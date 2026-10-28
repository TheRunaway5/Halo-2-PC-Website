"""Local adversarial checks; never contacts SSH or Docker."""
import ast
import tarfile
import importlib.util
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]/'account-transport-v14-deployed-rollout.py'
spec=importlib.util.spec_from_file_location('rollout', SOURCE)
rollout=importlib.util.module_from_spec(spec);spec.loader.exec_module(rollout)

class ReviewedBytesTests(unittest.TestCase):
    def test_path_swap_cannot_authorize_different_parsed_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'metadata.json'
            bad=json.dumps({'candidate':{'image_id':'unreviewed'}})
            good=json.dumps({'candidate':{'image_id':'reviewed'}}).encode()
            path.write_text(bad)
            original=Path.read_text
            def swap(selected,*args,**kwargs):
                result=original(selected,*args,**kwargs)
                if selected==path:path.write_bytes(good)
                return result
            argv=['rollout','--plan','--metadata',str(path),'--metadata-sha256',hashlib.sha256(good).hexdigest()]
            with patch.object(sys,'argv',argv),patch.object(Path,'read_text',swap),patch.object(rollout,'validate'),redirect_stdout(io.StringIO()):
                self.assertEqual(rollout.main(),2)

    def test_reject_untrusted_metadata_file_types_and_modes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);path=root/'value';path.write_text('{}');path.chmod(0o600)
            self.assertEqual(rollout.reviewed_bytes(path),b'{}')
            link=root/'link';link.symlink_to(path)
            with self.assertRaises((OSError,ValueError)):rollout.reviewed_bytes(link)
            path.chmod(0o666)
            with self.assertRaises(ValueError):rollout.reviewed_bytes(path)
            path.chmod(0o600);path.write_bytes(b' '*(rollout.MAX_REVIEW_BYTES+1))
            with self.assertRaises(ValueError):rollout.reviewed_bytes(path)
            with self.assertRaises((OSError,ValueError)):rollout.reviewed_bytes(root)

class IndependentVerifierTests(unittest.TestCase):
    def verifier(self):
        names={'BoundedTarInfo','ExportReader','tar_manifest','source_manifest','verify_rootfs','trusted_state'}
        tree=ast.parse(rollout.REMOTE)
        selected=ast.Module(body=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in names],type_ignores=[])
        def fail(code):raise ValueError(code)
        from pathlib import PurePosixPath
        ns=dict(tarfile=tarfile,hashlib=hashlib,PurePosixPath=PurePosixPath,fail=fail,json=json)
        exec(compile(selected,'trusted-remote','exec'),ns)
        return ns

    def manifest(self, ns, files):
        stream=io.BytesIO()
        with tarfile.open(fileobj=stream,mode='w') as out:
            for name,data in files.items():
                item=tarfile.TarInfo(name);item.size=len(data);item.mode=0o644
                out.addfile(item,io.BytesIO(data))
        stream.seek(0)
        return ns['tar_manifest'](stream)

    def test_forged_python_and_startup_hook_cannot_self_attest(self):
        ns=self.verifier()
        base={'usr/bin/python3':b'trusted interpreter','app/multiplayer/master_server/eos_identity.py':b'old'}
        baseline=self.manifest(ns,base)
        candidate=base|{'app/multiplayer/master_server/eos_identity.py':b'new'}
        ns['verify_rootfs'](baseline,self.manifest(ns,candidate),{'multiplayer/master_server/eos_identity.py'})
        for extra in ({'usr/bin/python3':b'print("expected manifest")'},
                      {'usr/local/lib/python3.14/site-packages/sitecustomize.py':b'forge key check'}):
            with self.assertRaisesRegex(ValueError,'rootfs'):
                ns['verify_rootfs'](baseline,self.manifest(ns,candidate|extra),{'multiplayer/master_server/eos_identity.py'})

    def test_key_check_uses_only_pinned_baseline_helper(self):
        ns=self.verifier();commands=[]
        ns.update(oldref='sha256:trusted',backup={'volume':'private-volume'},run=lambda argv,*a,**k:commands.append(argv))
        ns['trusted_state']('verify actual private files',{'destination':'backup'})
        self.assertIn('sha256:trusted',commands[0]);self.assertIn('type=volume,src=private-volume,dst=/state,readonly',commands[0])
        self.assertNotIn('exec',commands[0]);self.assertIn('-I',commands[0])

    def test_candidate_cannot_replace_both_private_files_and_backup_reference(self):
        import subprocess
        tree=ast.parse(rollout.REMOTE)
        code=next(n.value.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CHECK_KEYS' for t in n.targets))
        code=code.replace("root=Path('/state')", "root=Path(v['root'])")
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);backup=root/'backup';backup.mkdir()
            original=b'fixture-original-key';changed=b'fixture-replacement-key'
            payload={'root':str(root),'destination':'backup','private_files':['key'],
                     'key_digests':{'key':hashlib.sha256(original).hexdigest()}}
            for data,expected in ((original,0),(changed,1)):
                for path in (root/'key',backup/'key'):path.write_bytes(data);path.chmod(0o600)
                result=subprocess.run([sys.executable,'-I','-c',code],input=json.dumps(payload),text=True,
                                      stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                self.assertEqual(result.returncode,expected)

if __name__=='__main__': unittest.main()
