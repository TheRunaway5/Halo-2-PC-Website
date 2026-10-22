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
    args=parser.parse_args()
    if platform.system()!='Linux' or platform.machine()!='x86_64':
        parser.error('This validation runner currently covers Linux x86_64')
    if bool(args.server_config)!=bool(args.game_config):parser.error('Live qualification requires both private config paths')
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
        if report['passed'] and args.server_config:
            import sys
            sys.path.insert(0,str(source/'tests'))
            from live_stats import qualify
            try:report['live']=qualify(source,root,env,args.server_config,args.game_config)
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
