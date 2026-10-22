#!/usr/bin/env python3
"""Build and smoke-test owned EOS images, then remove images, builder and SDK."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import uuid
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk-archive', type=Path, required=True)
    parser.add_argument('--master-source', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    if not os.environ.get('HALO2_TEST_SCRATCH'):
        parser.error('Run through Halo-2-Decompiled/tools/run_test.py')
    web = Path(__file__).resolve().parents[2]
    builder = 'h2-eos-check-' + uuid.uuid4().hex[:12]
    images = [builder + ':master', builder + ':website-api']
    report = {'passed': False, 'commands': [], 'large_artifacts_retained': False}

    def run(command, *, check=True, timeout=600):
        result = subprocess.run(command, cwd=web, capture_output=True, text=True, timeout=timeout)
        report['commands'].append({'command': command, 'exit_code': result.returncode,
                                   'output': (result.stdout + result.stderr)[-8192:]})
        print(json.dumps({'step': command[:4], 'exit_code': result.returncode}), flush=True)
        if check and result.returncode:
            raise RuntimeError('Command failed: ' + ' '.join(command[:4]))
        return result

    def interrupted(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        with tempfile.TemporaryDirectory(prefix='eos-containers-', dir=os.environ['HALO2_TEST_SCRATCH']) as temporary:
            root = Path(temporary)
            report['scratch'] = str(root)
            with zipfile.ZipFile(args.sdk_archive) as sdk:
                for entry in sdk.infolist():
                    if entry.is_dir() or not (entry.filename.startswith('SDK/Include/') or
                                             entry.filename == 'SDK/Bin/libEOSSDK-Linux-Shipping.so'):
                        continue
                    path = root / entry.filename
                    if not path.resolve().is_relative_to(root):
                        raise ValueError('Unsafe SDK path')
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(sdk.read(entry))
            report['sdk_sha256'] = hashlib.sha256(args.sdk_archive.read_bytes()).hexdigest()
            run(['docker', 'buildx', 'create', '--name', builder, '--driver', 'docker-container'])
            for target, image in zip(('master', 'website-api'), images):
                run(['docker', 'buildx', 'build', '--builder', builder, '--platform', 'linux/amd64',
                     '--build-context', 'eos-sdk=' + str(root / 'SDK'), '--build-context',
                     'master-source=' + str(args.master_source.resolve()), '-f',
                     'backend/eos-worker/Dockerfile', '--target', target, '--tag', image, '--load', '.'])
                linked = run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'ldd', image,
                              '/usr/local/bin/halo2-eos-worker'])
                if 'not found' in linked.stdout:
                    raise RuntimeError('Missing SDK runtime dependency')
            master_smoke = '''import asyncio,tempfile,stat
from pathlib import Path
from aiohttp.test_utils import TestClient,TestServer
from multiplayer.master_server.service import Settings,create_app
async def main():
 with tempfile.TemporaryDirectory() as state:
  app=create_app(Settings(state=Path(state),public_url='https://qualification.invalid',behind_tls_proxy=True))
  async with TestClient(TestServer(app)) as client:
   async with client.get('/v1/health') as response: assert response.status==200
   async with client.get('/v1/online/status') as response:
    data=await response.json();assert response.status==200 and data['online']=={'users':0,'guests':0}
   async with client.get('/v1/auth/eos/jwks') as response:
    data=await response.json();assert response.status==200 and data['keys'][0]['alg']=='RS256'
    assert 'd' not in data['keys'][0]
   assert stat.S_IMODE((Path(state)/'eos-openid-key.pem').stat().st_mode)==0o600
   async with client.get('/v1/account/profile') as response: assert response.status==401
 print('Master HTTP, population, JWKS, signing-key mode and profile auth passed')
asyncio.run(main())'''
            run(['docker', 'run', '--rm', '--network', 'none', '-e', 'H2_EOS_OPENID_AUDIENCE=h2forever-profile-v1',
                 '--entrypoint', 'python', images[0], '-c', master_smoke])
            web_smoke = '''import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {once} from 'node:events';import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('/tmp/qualification.sqlite3');db.close();
const zero={users:0,guests:0};const counts={online:{users:3,guests:0},idle:{users:2,guests:0},queued:{users:1,guests:0},joining:zero,playing:zero,postgame:zero};
const upstream=createServer((req,res)=>{res.setHeader('Content-Type','application/json');
res.end(JSON.stringify(req.url==='/v1/health'?{ready:true}:req.url==='/v1/servers'?{servers:[{players:8}]}:
{...counts,updated_at:Math.floor(Date.now()/1000),activity_window_seconds:30,playlists:[]}));});
upstream.listen(18081,'127.0.0.1');await once(upstream,'listening');
process.env.MASTER_DATABASE='/tmp/qualification.sqlite3';process.env.MASTER_INTERNAL_URL='http://127.0.0.1:18081';
await import('/app/scripts/bridge.ts');
const response=await fetch('http://127.0.0.1:8090/v1/website/status');const data=await response.json();
assert.equal(response.status,200);assert.equal(data.online.online.users,3);assert.equal(data.online.queued.users,1);assert.equal(data.players,8);
console.log('Website image HTTP bridge and separate account/server counts passed');process.exit(0);'''
            run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', images[1],
                 '--input-type=module', '-e', web_smoke])
            report['passed'] = True
    except (Exception, KeyboardInterrupt) as error:
        report['error'] = str(error)[:512] or 'Interrupted'
    finally:
        # Exact task-owned names only; never prune shared builders or images.
        for image in images:
            run(['docker', 'image', 'rm', '--force', image], check=False, timeout=30)
        run(['docker', 'buildx', 'rm', '--force', builder], check=False, timeout=30)
        report['scratch_removed'] = not Path(report.get('scratch', '/nonexistent')).exists()
        report['builder_removed'] = subprocess.run(['docker', 'buildx', 'inspect', builder],
            capture_output=True).returncode != 0
        report['images_removed'] = all(subprocess.run(['docker', 'image', 'inspect', image],
            capture_output=True).returncode != 0 for image in images)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({k: v for k, v in report.items() if k != 'commands'}, indent=2))
    return 0 if report['passed'] and all(report[k] for k in ('scratch_removed', 'builder_removed', 'images_removed')) else 1


if __name__ == '__main__':
    raise SystemExit(main())
