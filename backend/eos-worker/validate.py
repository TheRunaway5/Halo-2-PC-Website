#!/usr/bin/env python3
"""Compile/tests against a licensed SDK in an owned disposable directory."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile
import zipfile


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk-archive',type=Path,required=True)
    parser.add_argument('--report',type=Path)
    parser.add_argument('--server-config',type=Path)
    parser.add_argument('--game-config',type=Path)
    parser.add_argument('--friend-config',type=Path,
                        help='Check the private storage config/platform and deny publisher operations; no player cloud writes')
    parser.add_argument('--master-source',type=Path,
                        help='Exact master source for isolated accepted-result HTTP/ledger qualification')
    parser.add_argument('--master-tests',type=Path,
                        help='Matching master HTTP fixture sources; requires --master-source and live configs')
    parser.add_argument('--node',type=Path,default=Path('node'))
    args=parser.parse_args()
    if platform.system()!='Linux' or platform.machine()!='x86_64':
        parser.error('This validation runner currently covers Linux x86_64')
    if bool(args.server_config)!=bool(args.game_config):parser.error('Live qualification requires both private config paths')
    if bool(args.master_source)!=bool(args.master_tests) or (args.master_source and not args.server_config):
        parser.error('Accepted-result qualification requires both master paths and live configs')
    if args.master_source:
        version=subprocess.check_output([str(args.node),'--version'],text=True).strip().lstrip('v').split('.')
        if int(version[0])!=26 or int(version[1])<12:parser.error('Accepted-result qualification requires Node >=26.12 and <27')
    source=Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix='eos-worker-',dir=os.environ.get('HALO2_TEST_SCRATCH')) as temporary:
        root=Path(temporary)
        with zipfile.ZipFile(args.sdk_archive) as sdk:
            for entry in sdk.infolist():
                if entry.is_dir() or not (entry.filename.startswith('SDK/Include/') or entry.filename=='SDK/Bin/libEOSSDK-Linux-Shipping.so'):
                    continue
                target=root/entry.filename
                if not target.resolve().is_relative_to(root):raise ValueError('Unsafe SDK archive path')
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(sdk.read(entry))
        env=os.environ|{'CARGO_TARGET_DIR':str(root/'target'),'HALO2_EOS_SDK_ROOT':str(root/'SDK'),
                        'LD_LIBRARY_PATH':str(root/'SDK/Bin')}
        commands=[['cargo','fmt','--check'],['cargo','test','--locked','--offline'],['cargo','build','--locked','--offline','--release']]
        results=[]
        for command in commands:
            result=subprocess.run(command,cwd=source,env=env,check=False)
            results.append({'command':command,'exit_code':result.returncode})
            if result.returncode:break
        report={'passed':all(r['exit_code']==0 for r in results) and len(results)==len(commands),
                'sdk_sha256':hashlib.sha256(args.sdk_archive.read_bytes()).hexdigest(),
                'commands':results,'scratch':str(root),'large_artifacts_retained':False,
                'sources':{str(p.relative_to(source)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source/'Cargo.toml',source/'Cargo.lock',source/'build.rs',*sorted((source/'src').glob('*'))]}}
        if report['passed']:
            import sys
            sys.path.insert(0,str(source/'tests'))
            from friend_storage import qualify_storage_boundary
            try:report['friend_storage_boundary']=qualify_storage_boundary(source,root,env)
            except Exception as error:
                report['passed']=False
                report['friend_storage_boundary']={'passed':False,'error':str(error)[:256]}
        report['sources'].update({str(p.relative_to(source)):hashlib.sha256(p.read_bytes()).hexdigest() for p in
            (source/'tests/friend_storage.py',source/'tests/storage_fixture.cpp',source/'tests/friend_config.py')})
        if report['passed'] and args.friend_config:
            import sys
            sys.path.insert(0,str(source/'tests'))
            from friend_config import qualify_private_config
            try:report['friend_config']=qualify_private_config(root,env,args.friend_config)
            except Exception:
                report['passed']=False
                report['friend_config']={'passed':False,'error':'Private storage config/platform qualification failed'}
        if args.master_source:
            report['accepted_result_sources']={str(p.relative_to(source.parent.parent)):hashlib.sha256(p.read_bytes()).hexdigest()
                for p in [source/'tests/accepted_result_fixture.py',source/'tests/live_result_publication.ts',
                          source/'tests/live_stats.py',source.parent.parent/'scripts/eos-service.ts',source.parent.parent/'scripts/public-ranks.ts']}
            report['master_sources']={str(p.relative_to(args.master_source)):hashlib.sha256(p.read_bytes()).hexdigest()
                for p in sorted(args.master_source.rglob('*')) if p.is_file() and p.suffix in ('.py','.json') and '__pycache__' not in p.parts}
            report['master_fixture_sources']={name:hashlib.sha256((args.master_tests/name).read_bytes()).hexdigest()
                for name in ('test_couch_online.py','test_match_transport.py','test_matchmaking_http.py','test_ranked_results.py')}
        if report['passed'] and args.server_config:
            import sys
            sys.path.insert(0,str(source/'tests'))
            from live_stats import qualify
            try:report['live']=qualify(source,root,env,args.server_config,args.game_config,
                master_source=args.master_source,master_tests=args.master_tests,node=args.node)
            except Exception as error:
                report['passed']=False
                report['live']={'passed':False,'error':str(error)[:512]}
    report['scratch_removed']=not root.exists()
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    return 0 if report['passed'] and report['scratch_removed'] else 1


if __name__=='__main__':raise SystemExit(main())
