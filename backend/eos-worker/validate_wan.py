#!/usr/bin/env python3
"""Explicit real-EOS qualification between this Linux PC and an SSH Docker host.

Run through the game's tools/run_test.py. This creates anonymous EOS test users;
it never binds a master account or publishes player statistics.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import time
import uuid
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game-root', type=Path, required=True)
    parser.add_argument('--sdk-archive', type=Path, required=True)
    parser.add_argument('--game-config', type=Path, required=True)
    parser.add_argument('--host', required=True)
    parser.add_argument('--allow-direct', action='store_true', help='Use normal EOS routing instead of forcing relay')
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    if not os.environ.get('HALO2_TEST_SCRATCH'):
        parser.error('Run through tools/run_test.py')
    web = Path(__file__).resolve().parents[2]
    identity = 'h2-eos-wan-' + uuid.uuid4().hex[:12]
    image, builder = identity + ':probe', identity
    report = dict(passed=False, force_relay=not args.allow_direct,
                  scope='Two physical hosts, local PC and public server; EOS P2P and Sessions. Not two consumer NATs, microphone playback or gameplay acceptance.', commands=[])
    remote_root = None
    owner = None
    processes, logs = [], []

    def ssh(command, *, check=True, timeout=180):
        result = subprocess.run(['ssh', '-o', 'BatchMode=yes', args.host, shlex.join(command)],
                                capture_output=True, text=True, timeout=timeout)
        if check and result.returncode:
            raise RuntimeError('Remote qualification step failed: ' + command[0] + '\n' + (result.stdout + result.stderr)[-3000:])
        return result

    def copy(source, destination):
        subprocess.run(['scp', '-q', str(source), str(destination)], check=True, timeout=90)

    try:
        owner = tempfile.TemporaryDirectory(prefix=identity, dir=os.environ['HALO2_TEST_SCRATCH'])
        root = Path(owner.name)
        report['scratch'] = str(root)
        upload = root / 'upload'
        context = upload / 'context/backend/eos-worker'
        (context / 'tests').mkdir(parents=True)
        for name in ('relay-probe.Dockerfile', 'tests/relay_probe.cpp'):
            shutil.copy2(web / 'backend/eos-worker' / name, context / name)
        shutil.copytree(args.game_root / 'rust', upload / 'rust',
                        ignore=shutil.ignore_patterns('target', '__pycache__', '.git'))
        with zipfile.ZipFile(args.sdk_archive) as sdk:
            for entry in sdk.infolist():
                if entry.is_dir() or not (entry.filename.startswith('SDK/Include/') or entry.filename == 'SDK/Bin/libEOSSDK-Linux-Shipping.so'):
                    continue
                path = upload / entry.filename
                if not path.resolve().is_relative_to(upload):
                    raise ValueError('Unsafe SDK path')
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(sdk.read(entry))
        report['sources'] = {str(p.relative_to(upload)): hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in upload.rglob('*') if p.is_file() and 'SDK' not in p.parts}
        archive = root / 'source.tar.gz'
        with tarfile.open(archive, 'w:gz') as stream:
            stream.add(upload, arcname='source')
        remote_root = ssh(['mktemp', '-d', '/tmp/' + identity + '-XXXXXX']).stdout.strip()
        copy(archive, args.host + ':' + remote_root + '/source.tar.gz')
        ssh(['tar', '-xzf', remote_root + '/source.tar.gz', '-C', remote_root])
        ssh(['docker', 'buildx', 'create', '--name', builder, '--driver', 'docker-container'])
        command = ['docker', 'buildx', 'build', '--builder', builder,
                   '--build-context', 'game-rust=' + remote_root + '/source/rust',
                   '--build-context', 'eos-sdk=' + remote_root + '/source/SDK',
                   '-f', remote_root + '/source/context/backend/eos-worker/relay-probe.Dockerfile',
                   '--tag', image, '--load', remote_root + '/source/context']
        built = ssh(command, check=False, timeout=600)
        report['commands'].append(dict(step='remote_build', exit_code=built.returncode, output=(built.stdout + built.stderr)[-6000:]))
        if built.returncode:
            raise RuntimeError('Probe build failed; see report')
        ssh(['docker', 'create', '--name', identity + '-extract', image])
        ssh(['docker', 'cp', identity + '-extract:/usr/local/bin/eos-relay-probe', remote_root + '/eos-relay-probe'])
        ssh(['docker', 'rm', identity + '-extract'])
        local = root / 'local'
        local.mkdir()
        copy(args.host + ':' + remote_root + '/eos-relay-probe', local / 'eos-relay-probe')
        (local / 'eos-relay-probe').chmod(0o755)
        shutil.copy2(upload / 'SDK/Bin/libEOSSDK-Linux-Shipping.so', local)
        socket, key = secrets.token_hex(16), secrets.token_hex(32)
        remote_input = root / 'remote'
        remote_input.mkdir()
        for slot, directory in enumerate((local, remote_input)):
            (directory / 'admission').write_text(str(slot) + '\n' + socket + '\n' + key + '\n')
            (directory / 'admission').chmod(0o600)
            shutil.copy2(args.game_config, directory / 'client.env')
            (directory / 'client.env').chmod(0o600)
        ssh(['mkdir', remote_root + '/peer-input'])
        for name in ('admission', 'client.env'):
            copy(remote_input / name, args.host + ':' + remote_root + '/peer-input/' + name)
        ssh(['chown', '-R', '10001:10001', remote_root + '/peer-input'])
        local_log, remote_log = open(root / 'local.log', 'w+'), open(root / 'remote.log', 'w+')
        logs.extend((local_log, remote_log))
        env = os.environ | dict(H2_EOS_CONFIG=str(local / 'client.env'), H2_EOS_CACHE_DIR=str(local / 'cache'),
                                 XDG_CONFIG_HOME=str(local / 'config'), XDG_DATA_HOME=str(local / 'data'), XDG_CACHE_HOME=str(local / 'xdg-cache'))
        env['H2_EOS_DIAGNOSTICS'] = '1'
        env.pop('H2_EOS_PROBE_ALLOW_DIRECT', None)
        if args.allow_direct:
            env['H2_EOS_PROBE_ALLOW_DIRECT'] = '1'
        processes.append(subprocess.Popen([str(local / 'eos-relay-probe'), str(local)], env=env, stdout=local_log, stderr=local_log))
        command = ['docker', 'run', '--rm', '--name', identity, '--mount', 'type=bind,src=' + remote_root + '/peer-input,dst=/qualification']
        for name, value in dict(H2_EOS_CONFIG='/qualification/client.env', H2_EOS_CACHE_DIR='/qualification/cache',
                                H2_EOS_DIAGNOSTICS='1', XDG_CONFIG_HOME='/qualification/config', XDG_DATA_HOME='/qualification/data', XDG_CACHE_HOME='/qualification/xdg-cache').items():
            command += ['-e', name + '=' + value]
        command += [image, '/qualification']
        if args.allow_direct:
            command[-2:-2] = ['-e', 'H2_EOS_PROBE_ALLOW_DIRECT=1']
        processes.append(subprocess.Popen(['ssh', '-o', 'BatchMode=yes', args.host, shlex.join(command)], stdout=remote_log, stderr=remote_log))
        deadline = time.monotonic() + 90
        exchanged = False
        while time.monotonic() < deadline:
            if any(p.poll() not in (None, 0) for p in processes):
                break
            if not exchanged and (local / 'identity').is_file() and ssh(['test', '-s', remote_root + '/peer-input/identity'], check=False).returncode == 0:
                copy(args.host + ':' + remote_root + '/peer-input/identity', local / 'peer')
                copy(local / 'identity', args.host + ':' + remote_root + '/peer-input/peer')
                ssh(['chown', '10001:10001', remote_root + '/peer-input/peer'])
                exchanged = True
            if all(p.poll() is not None for p in processes):
                break
            time.sleep(.5)
        for process in processes:
            process.wait(timeout=5)
        copy(args.host + ':' + remote_root + '/peer-input/result.json', root / 'remote-result.json')
        report['peers'] = [json.loads((local / 'result.json').read_text()), json.loads((root / 'remote-result.json').read_text())]
        report['passed'] = exchanged and all(p.returncode == 0 for p in processes) and all(p['passed'] for p in report['peers'])
    except Exception as error:
        report['error'] = str(error)[-4000:]
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill(); process.wait()
        report['diagnostics'] = []
        for stream in logs:
            stream.flush(); stream.seek(0)
            report['diagnostics'].append(stream.read()[-8000:])
            stream.close()
        if remote_root:
            for command in (['docker', 'rm', '-f', identity], ['docker', 'rm', '-f', identity + '-extract'],
                            ['docker', 'image', 'rm', image], ['docker', 'buildx', 'rm', builder]):
                ssh(command, check=False)
            assert remote_root.startswith('/tmp/' + identity + '-')
            ssh(['rm', '-rf', '--', remote_root])
            report['remote_scratch_removed'] = ssh(['test', '!', '-e', remote_root], check=False).returncode == 0
        if owner is not None:
            owner.cleanup()
        report['scratch_removed'] = not Path(report.get('scratch', '/nonexistent')).exists()
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k not in ('commands', 'sources', 'diagnostics')}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
