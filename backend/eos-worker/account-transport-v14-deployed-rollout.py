#!/usr/bin/env python3
"""Plan, or explicitly execute, the pinned directory-only EOS v14 rollout.

Planning is local and never opens SSH. Execution is a bounded server-side
transaction; command output, environment values and private state never enter
the public receipt. Review the adjacent runbook before using --execute.
"""
import argparse
import hashlib
import json
import os
import re
import shlex
import subprocess
import stat
import sys
from pathlib import Path


BASELINE = "ddd0682cecbdb2301936ef5cd291ffa6e70ca403fd68bb0dc22fb7489d545809"
WORKDIR = "/opt/halo2/releases/20261014T021753Z/multiplayer/master_server"
FILES = [
    WORKDIR + "/compose.production.yaml",
    WORKDIR + "/compose.production-matchmaking.yaml",
    WORKDIR + "/compose.direct-release.yaml",
    "/opt/halo2/website-api/compose.website-status.json",
    "/opt/halo2/steam-import-20261016/compose.steam.json",
    "/opt/halo2/eos-20261022T200436Z/compose.master.json",
    "/opt/halo2/eos-transport-20261022T214749Z/compose.master.json",
    "/opt/halo2/eos-profile-cache-20261022T235241Z/compose.master.json",
    "/opt/halo2/eos-career-indexes-20261023T000037Z/compose.master.json",
    "/opt/halo2/eos-social-20261023T031806Z/compose.social.json",
    "/opt/halo2/eos-social-capacity-20261023T040824Z/compose.capacity.json",
]
CHANGED = {"multiplayer/master_server/" + name for name in
           ("couch_players.py", "eos_identity.py", "match_transport.py")}
PRIVATE = ["master-key.json", "eos-openid-key.pem", "admin-token", "peers.json"]
MAX_REVIEW_BYTES = 1024 * 1024


def reviewed_bytes(path):
    """Authenticate and parse the same bounded regular-file descriptor."""
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size <= MAX_REVIEW_BYTES and
                before.st_uid in (0, os.getuid()) and not before.st_mode & 0o022,
                "Untrusted qualification file identity, mode or size")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            data = stream.read(MAX_REVIEW_BYTES + 1)
        after = os.fstat(fd)
        identity = lambda s: (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
        require(len(data) <= MAX_REVIEW_BYTES and identity(before) == identity(after),
                "Qualification file changed during read")
        return data
    finally:
        os.close(fd)


def sha256(path):
    return hashlib.sha256(reviewed_bytes(path)).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def image_id(value):
    return value.removeprefix("sha256:")


def artifact(parent, value):
    path = Path(value)
    if not path.is_absolute():
        # Metadata paths are either adjacent artifact names or Website-relative.
        path = (parent / path if (parent / path).exists()
                else parent.parent.parent / path)
    require(path.is_file() and not path.is_symlink(), "Missing regular qualification artifact")
    return path


def validate(metadata, parent):
    require(metadata["schema"] == "halo2-eos-account-v14-deployed-candidate-v1", "Wrong metadata schema")
    baseline, candidate = metadata["baseline"], metadata["candidate"]
    require(image_id(baseline["image_id"]) == BASELINE, "Wrong authenticated baseline image")
    for entry in (baseline, candidate):
        require(re.fullmatch(r"[0-9a-f]{64}", image_id(entry["image_id"])), "Invalid image ID")
        require(re.fullmatch(r"halo2-master-eos:[A-Za-z0-9_.-]+", entry["image_tag"]), "Invalid image tag")
        manifest = entry["source_sha256"]
        require(len(manifest) == 36, "Expected exact 36-source manifest")
        for name, digest in manifest.items():
            require(name == "requirements.txt" or
                    (name.startswith("multiplayer/master_server/") and
                     ".." not in Path(name).parts and Path(name).suffix in {".py", ".json", ".txt", ".md"}),
                    "Invalid source path")
            require(re.fullmatch(r"[0-9a-f]{64}", digest), "Invalid source digest")
    require(baseline["source_sha256"].keys() == candidate["source_sha256"].keys(), "Source set changed")
    require({name for name, digest in candidate["source_sha256"].items()
             if baseline["source_sha256"][name] != digest} == CHANGED, "Unexpected source delta")
    require(image_id(candidate["image_id"]) != BASELINE and candidate["size_bytes"] > 0,
            "Candidate must be a different built image")
    compose = metadata["compose"]
    details = {"file_sha256", "environment_file", "bind_file_sha256", "resolved_directory_sha256"}
    require({k: v for k, v in compose.items() if k not in details} ==
            {"project": "halo2-directory-prod", "service": "directory",
            "container": "halo2-directory-prod-directory-1", "working_directory": WORKDIR,
            "files": FILES}, "Compose owner or ordered inputs changed")
    require(compose["file_sha256"].keys() == set(FILES) and
            all(re.fullmatch(r"[0-9a-f]{64}", digest) for digest in compose["file_sha256"].values()),
            "Expected authenticated hashes for all 11 Compose inputs")
    require(compose["environment_file"]["path"] == "/opt/halo2/website-api/compose.variables.env" and
            re.fullmatch(r"[0-9a-f]{64}", compose["environment_file"]["sha256"]),
            "Expected the original labelled Compose environment file")
    require(compose["bind_file_sha256"] and
            all(path.startswith("/opt/halo2/") and ".." not in Path(path).parts and
                re.fullmatch(r"[0-9a-f]{64}", digest)
                for path, digest in compose["bind_file_sha256"].items()), "Invalid bind dependency pins")
    require(re.fullmatch(r"[0-9a-f]{64}", compose["resolved_directory_sha256"]),
            "Expected resolved directory configuration digest")
    require(metadata["backup"] == {"state": "/state", "database": "registry.sqlite3",
            "private_files": PRIVATE, "volume": "halo2-directory-prod_master-data",
            "destination_prefix": ".rollout-backups"}, "State/backup contract changed")
    require(metadata["health"] == {"internal": "http://127.0.0.1:8080/v1/health",
            "public": "https://master.halo2forever.net/v1/health"}, "Health endpoints changed")
    require(metadata["qualification"]["focused"] == 44 and metadata["qualification"]["social"] == 35,
            "Expected 79 applicable deployed-baseline checks")
    require(len(metadata["qualification"]["baseline_exceptions"]) == 2 and
            metadata["qualification"]["new_auth_queue"] == 17, "Qualification scope changed")
    require(metadata["qualification"]["image_tests"]["passed"] is True and
            metadata["qualification"]["image_smoke"]["passed"] is True and
            metadata["qualification"]["scratch_removed_verified"] is True,
            "Candidate image qualification is incomplete")
    for key in ("patch", "qualification"):
        entry = metadata[key]
        path = artifact(parent, entry["path"] if key == "patch" else entry["receipt"])
        require(sha256(path) == entry["sha256"], "Qualification artifact hash mismatch")


# Sent only when --execute is explicit. stdout is one sanitized JSON receipt.
# Docker/SSH diagnostics are captured privately and are never echoed.
REMOTE = r'''
import datetime, fcntl, hashlib, json, os, secrets, signal, stat, re
import subprocess, sys, time, urllib.request, tarfile, tempfile, threading
from pathlib import Path, PurePosixPath

m = json.load(sys.stdin)
c = m['compose']; backup = m['backup']; container = c['container']
# These are the three actual interpolation names in the pinned original files.
# Use the original labelled --env-file, without ambient SSH-shell overrides.
compose_env = dict(os.environ)
for name in ('MASTER_DOMAIN','H2_PEER_STUN_URLS','MATCHMAKING_CATALOG',
             'COMPOSE_ENV_FILES','COMPOSE_DISABLE_ENV_FILE'):
    compose_env.pop(name,None)
stage = 'lock'; changed = False; override = None; rollback = None; snapshot = None
report = {'schema':'halo2-eos-account-v14-rollout-receipt-v1', 'passed':False,
          'service':c['service'], 'database_restored':False, 'private_values_exported':False}

def fail(code):
    raise RuntimeError(code)

def run(argv, data=None, timeout=45, env=None):
    p = subprocess.run(argv, input=data, text=True, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE, timeout=timeout, cwd=c['working_directory'],env=env)
    if p.returncode:
        fail('command-failed')
    return p.stdout

def inspect(ref, kind='container'):
    return json.loads(run(['docker',kind,'inspect',ref]))[0]

def iid(value):
    return value.removeprefix('sha256:')

class BoundedTarInfo(tarfile.TarInfo):
    def _proc_member(self, archive):
        if self.type in (tarfile.GNUTYPE_LONGNAME,tarfile.GNUTYPE_LONGLINK,tarfile.XHDTYPE,tarfile.XGLTYPE) and self.size>65536:
            fail('export-metadata-budget')
        return super()._proc_member(archive)

class ExportReader:
    def __init__(self, stream): self.stream=stream; self.bytes=0
    def read(self, size):
        if size<0 or size>1024*1024: fail('export-read-budget')
        data=self.stream.read(size); self.bytes+=len(data)
        if self.bytes>2*1024**3: fail('export-byte-budget')
        return data

def tar_manifest(stream):
    result={}
    with tarfile.open(fileobj=ExportReader(stream),mode='r|',tarinfo=BoundedTarInfo) as archive:
        for item in archive:
            path=PurePosixPath(item.name)
            if path.is_absolute() or '..' in path.parts or len(item.name)>4096 or len(result)>=100000:
                fail('export-path-budget')
            name=str(path)
            if name in result: fail('export-duplicate')
            if item.size>128*1024**2 or item.size<0: fail('export-file-budget')
            digest=None
            if item.isfile():
                h=hashlib.sha256()
                with archive.extractfile(item) as inp:
                    while block:=inp.read(1024*1024): h.update(block)
                digest=h.hexdigest()
            elif not (item.isdir() or item.issym() or item.islnk()):
                fail('export-special-file')
            result[name]=(item.type.decode('ascii'),item.mode,item.uid,item.gid,item.linkname,item.size,digest)
    return result

def filesystem(ref, immutable=False):
    # Docker owns serialization; trusted host Python hashes without executing
    # any interpreter, entrypoint, startup hook or binary from the subject.
    created=None; process=None; timer=None
    with tempfile.TemporaryFile() as errors:
        try:
            if immutable:
                created=run(['docker','create','--network','none','--entrypoint','/bin/false',ref]).strip()
                if not re.fullmatch('[0-9a-f]{64}',created): fail('export-container-id')
            process=subprocess.Popen(['docker','export',created or ref],stdout=subprocess.PIPE,stderr=errors)
            timer=threading.Timer(45,process.kill);timer.start()
            result=tar_manifest(process.stdout)
            if process.wait(timeout=45): fail('export-failed')
            return result
        finally:
            if timer: timer.cancel()
            if process:
                if process.poll() is None: process.kill()
                process.wait(timeout=5)
                process.stdout.close()
            if created: run(['docker','rm',created])

def source_manifest(manifest):
    out={}
    for name,entry in manifest.items():
        path=PurePosixPath(name)
        if name=='app/requirements.txt' or (name.startswith('app/multiplayer/master_server/') and
                '__pycache__' not in path.parts and path.suffix in {'.py','.json','.txt','.md'}):
            if entry[0]!='0': fail('linked-source')
            out[name.removeprefix('app/')]=entry[-1]
    return out

def source(ref): return source_manifest(filesystem(ref))

def verify_rootfs(baseline,candidate,allowed):
    dynamic={'etc/hostname','etc/hosts','etc/resolv.conf'}
    changed={name for name in baseline.keys()|candidate.keys()
             if name not in dynamic and baseline.get(name)!=candidate.get(name)}
    if changed!={'app/'+name for name in allowed}: fail('unreviewed-rootfs-delta')

trusted_filesystem=None; trusted_config=None

def verify_image(entry):
    global trusted_filesystem,trusted_config
    ref = 'sha256:'+iid(entry['image_id'])
    data = inspect(ref,'image')
    if iid(data['Id']) != iid(entry['image_id']): fail('image-id')
    if iid(inspect(entry['image_tag'],'image')['Id']) != iid(entry['image_id']): fail('image-tag')
    manifest=filesystem(ref,True)
    if source_manifest(manifest) != entry['source_sha256']: fail('immutable-source-manifest')
    config={k:v for k,v in data['Config'].items() if k not in ('Image','Hostname','Domainname','Labels')}
    if iid(entry['image_id'])==iid(m['baseline']['image_id']):
        trusted_filesystem=manifest; trusted_config=config
    else:
        if trusted_filesystem is None or config!=trusted_config: fail('image-runtime-config')
        allowed={name for name,value in entry['source_sha256'].items() if m['baseline']['source_sha256'][name]!=value}
        verify_rootfs(trusted_filesystem,manifest,allowed)
    return ref

def verify_running(entry, original=False):
    data = inspect(container)
    if iid(data['Image']) != iid(entry['image_id']) or not data['State']['Running']:
        fail('running-image')
    labels=data['Config']['Labels']
    expected={'com.docker.compose.project':c['project'],'com.docker.compose.service':c['service'],
              'com.docker.compose.project.working_dir':c['working_directory']}
    if any(labels.get(k)!=v for k,v in expected.items()): fail('compose-owner')
    if labels.get('com.docker.compose.project.environment_file')!=c['environment_file']['path']:
        fail('compose-environment-owner')
    if original and labels.get('com.docker.compose.project.config_files','').split(',')!=c['files']:
        fail('compose-input-order')
    mounts=[x for x in data['Mounts'] if x['Destination']==backup['state']]
    if len(mounts)!=1 or mounts[0].get('Name')!=backup['volume'] or not mounts[0].get('RW'):
        fail('state-volume')
    files={x['Source'] for x in data['Mounts'] if x['Type']=='bind' and Path(x['Source']).is_file()}
    if files!=set(c['bind_file_sha256']): fail('bind-file-set')
    if source(container)!=entry['source_sha256']: fail('running-source-manifest')
    return data

def others():
    ids=run(['docker','ps','-aq']).split()
    if not ids: return []
    values=json.loads(run(['docker','container','inspect']+ids))
    return sorted((x['Id'],x['Image'],x['State']['StartedAt'],x['State']['Running'])
                  for x in values if x['Name'].lstrip('/')!=container)

def compose_args(path=None):
    argv=['docker','compose','--env-file',c['environment_file']['path'],
          '--project-name',c['project'],'--project-directory',c['working_directory']]
    for name in c['files']+([str(path)] if path else []): argv+=['-f',name]
    return argv

def check_resolved(path=None):
    value=json.loads(run(compose_args(path)+['config','--format','json'],env=compose_env))
    directory=value['services'][c['service']]
    directory.pop('image',None)
    digest=hashlib.sha256(json.dumps(directory,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if digest!=c['resolved_directory_sha256']: fail('resolved-directory-config')

def compose(path):
    check_compose(); check_resolved(path)
    run(compose_args(path)+['up','-d','--no-deps','--no-build','--pull','never',c['service']],
        timeout=180,env=compose_env)

def check_compose():
    files={**c['file_sha256'],**c['bind_file_sha256'],
           c['environment_file']['path']:c['environment_file']['sha256']}
    for name,digest in files.items():
        p=Path(name)
        if not p.is_file() or p.is_symlink() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:
            fail('compose-input-content')

BACKUP = """
import hashlib,json,os,sqlite3,stat,sys,time
from pathlib import Path
v=json.load(sys.stdin); state=Path('/state'); dest=state/v['destination']
assert not dest.exists() and not dest.is_symlink()
parent=dest.parent
if parent.exists(): assert parent.is_dir() and not parent.is_symlink() and stat.S_IMODE(parent.stat().st_mode)==0o700
else: parent.mkdir(mode=0o700)
dest.mkdir(mode=0o700)
key_digests={}
for name in v['private_files']:
    p=state/name
    assert p.is_file() and not p.is_symlink() and stat.S_IMODE(p.stat().st_mode)==0o600
    data=p.read_bytes()
    key_digests[name]=hashlib.sha256(data).hexdigest()
    fd=os.open(dest/name,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'wb') as f: f.write(data); f.flush(); os.fsync(f.fileno())
    assert hashlib.sha256((dest/name).read_bytes()).digest()==hashlib.sha256(data).digest()
db=state/'registry.sqlite3'; assert db.is_file() and not db.is_symlink()
out=dest/'registry.sqlite3'
fd=os.open(out,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600); os.close(fd)
deadline=time.monotonic()+30
def progress(*_):
    if time.monotonic()>deadline: raise TimeoutError('backup-budget')
with sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True,timeout=5) as src:
    with sqlite3.connect(out) as dst:
        src.backup(dst,pages=128,progress=progress,sleep=.05)
        assert dst.execute('PRAGMA quick_check').fetchone()==('ok',)
with out.open('rb') as f: os.fsync(f.fileno())
assert stat.S_IMODE(out.stat().st_mode)==0o600
print(json.dumps({'consistent_sqlite':True,'private_files':len(v['private_files']),
 'bytes':sum(p.stat().st_size for p in dest.iterdir()),'key_digests':key_digests}))
"""

CHECK_KEYS = """
import hashlib,json,stat,sys
from pathlib import Path
v=json.load(sys.stdin); root=Path('/state'); dest=root/v['destination']
for name in v['private_files']:
    a=root/name; b=dest/name
    assert a.is_file() and b.is_file() and not a.is_symlink() and not b.is_symlink()
    assert stat.S_IMODE(a.stat().st_mode)==stat.S_IMODE(b.stat().st_mode)==0o600
    assert hashlib.sha256(a.read_bytes()).hexdigest()==v['key_digests'][name]
    assert hashlib.sha256(b.read_bytes()).hexdigest()==v['key_digests'][name]
print('{"unchanged":true}')
"""

def trusted_state(script,payload,readonly=True):
    # The already trusted baseline owns this isolated verifier, never candidate Python.
    argv=['docker','run','--rm','-i','--network','none','--read-only','--cap-drop','ALL',
          '--security-opt','no-new-privileges','--mount',
          'type=volume,src='+backup['volume']+',dst=/state'+(',readonly' if readonly else ''),
          '--entrypoint','python3',oldref,'-I','-c',script]
    return run(argv,json.dumps(payload),timeout=40)

def healthy(entry):
    deadline=time.monotonic()+50
    while True:
        try:
            data=verify_running(entry)
            if data['State'].get('Health',{}).get('Status')!='healthy': fail('docker-health')
            networks=data['NetworkSettings']['Networks']
            addresses=[v['IPAddress'] for v in networks.values() if v.get('IPAddress')]
            if not addresses: fail('internal-address')
            for address in addresses:
                import ipaddress
                address=str(ipaddress.IPv4Address(address))
                with urllib.request.urlopen('http://'+address+':8080/v1/health',timeout=3) as r:
                    value=json.load(r)
                    if r.status!=200 or value.get('status')!='ok' or value.get('ready') is not True: fail('internal-health')
            with urllib.request.urlopen(m['health']['public'],timeout=3) as r:
                payload=json.load(r)
                if r.status!=200 or payload.get('status')!='ok' or payload.get('ready') is not True:
                    fail('public-health')
            keydata={'destination':str(snapshot),'private_files':backup['private_files'],'key_digests':key_digests}
            trusted_state(CHECK_KEYS,keydata)
            check_compose(); check_resolved()
            if others()!=other_before: fail('other-container-changed')
            return
        except Exception:
            if time.monotonic()>=deadline: fail('postflight')
            time.sleep(2)

def interrupted(*_):
    fail('interrupted')

os.umask(0o077)
for sig in (signal.SIGHUP,signal.SIGINT,signal.SIGTERM): signal.signal(sig,interrupted)
lockfd=os.open('/run/lock/halo2-directory-account-v14.lock',os.O_CREAT|os.O_WRONLY,0o600)
try:
    fcntl.flock(lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    stage='preflight'
    check_compose(); check_resolved()
    verify_running(m['baseline'],True)
    oldref=verify_image(m['baseline']); newref=verify_image(m['candidate'])
    if inspect(newref,'image')['Size']!=m['candidate']['size_bytes']: fail('candidate-size')
    other_before=others()
    version=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(4)
    snapshot=Path(backup['destination_prefix'])/('account-v14-'+version)
    stage='backup'
    payload={'destination':str(snapshot),'private_files':backup['private_files']}
    result=json.loads(trusted_state(BACKUP,payload,False))
    # Keep reference hashes only in the trusted host process. The candidate
    # can write its state volume, including the on-volume backup copies.
    key_digests=result.pop('key_digests')
    payload['key_digests']=key_digests
    report['backup']={'server_path':'/state/'+str(snapshot),**result}
    directory=Path('/opt/halo2')/('eos-account-v14-'+version); directory.mkdir(mode=0o700)
    override=directory/'compose.account-v14.json'; rollback=directory/'compose.rollback.json'
    for path,ref in ((override,newref),(rollback,oldref)):
        with path.open('x') as f: json.dump({'services':{c['service']:{'image':ref}}},f)
    report['server_override']=str(override); report['server_rollback_override']=str(rollback)
    # Refuse a concurrent image/config/source replacement after the backup.
    verify_running(m['baseline'],True)
    trusted_state(CHECK_KEYS,payload)
    stage='candidate-up'; changed=True
    compose(override)
    stage='postflight'; healthy(m['candidate'])
    report.update(passed=True,image_id=newref,source_count=36,private_files_unchanged=True,
                  internal_health=True,public_health=True,other_containers_unchanged=True,
                  rollback_performed=False)
except BaseException:
    report['failure_stage']=stage
    if changed:
        # Complete rollback even when the operator's SSH process was interrupted.
        for sig in (signal.SIGHUP,signal.SIGINT,signal.SIGTERM): signal.signal(sig,signal.SIG_IGN)
        try:
            compose(rollback); healthy(m['baseline'])
            report.update(rollback_performed=True,rollback_healthy=True)
        except BaseException:
            report.update(rollback_performed=True,rollback_healthy=False,
                          operator_action_required=True)
    else:
        report['rollback_performed']=False
finally:
    os.close(lockfd)
print(json.dumps(report,sort_keys=True),flush=True)
sys.exit(0 if report['passed'] else 1)
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--plan", action="store_true", help="Local validation and plan only (default)")
    mode.add_argument("--execute", action="store_true", help="Perform the reviewed server transaction")
    parser.add_argument("--metadata", type=Path,
                        default=Path(__file__).with_name("account-transport-v14-deployed-candidate.json"))
    parser.add_argument("--metadata-sha256", help="Required for execution: exact reviewed metadata digest")
    parser.add_argument("--receipt", type=Path, help="Optional sanitized execution receipt; never private state")
    args = parser.parse_args()
    receipt_handle = None
    try:
        raw = reviewed_bytes(args.metadata)
        digest = hashlib.sha256(raw).hexdigest()
        if args.metadata_sha256 is not None:
            require(args.metadata_sha256 == digest, "Reviewed metadata digest changed")
        metadata = json.loads(raw)
        validate(metadata, args.metadata.resolve().parent)
        if not args.execute:
            print(json.dumps({"mode": "plan", "remote_contacted": False, "metadata_sha256": digest,
                "helper_sha256": sha256(Path(__file__)), "baseline_image": "sha256:" + BASELINE,
                "candidate_image": metadata["candidate"]["image_id"], "source_count": 36,
                "changed_sources": sorted(CHANGED), "compose_files": FILES,
                "service": "directory", "database_restored_on_rollback": False,
                "steps": ["authenticate running owner, image, ordered compose files and source36",
                          "authenticate both immutable local images and candidate source36",
                          "private SQLite backup and four private key copies on existing server volume",
                          "directory-only candidate up: --no-deps --no-build --pull never",
                          "verify exact sources, state/key preservation, Docker/internal/public health",
                          "on failure: directory-only original image rollback; preserve database writes"]}, indent=2))
            return 0
        require(args.metadata_sha256 is not None, "--execute requires --metadata-sha256 from the reviewed plan")
        if args.receipt:
            # Detect collisions/permissions before any remote effect. A started
            # marker remains if the local process cannot collect the final result.
            fd = os.open(args.receipt, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            receipt_handle = os.fdopen(fd, "w")
            receipt_handle.write(json.dumps({"passed": False, "state": "execution-started",
                "operator_action_required": True, "metadata_sha256": digest}) + "\n")
            receipt_handle.flush()
            os.fsync(receipt_handle.fileno())
        command = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=7", "-o",
                   "StrictHostKeyChecking=yes", "halo2-master", "python3 -c " + shlex.quote(REMOTE)]
        # No local timeout kills the owner during rollback; all remote operations
        # have finite budgets. SSH stderr is deliberately not published.
        result = subprocess.run(command, input=json.dumps(metadata), text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            receipt = json.loads(result.stdout)
        except (ValueError, TypeError):
            receipt = {"passed": False, "transport_receipt_missing": True,
                       "operator_action_required": True,
                       "note": "SSH ended without a final receipt; inspect private server rollout state before retrying"}
        receipt.update(metadata_sha256=digest, helper_sha256=sha256(Path(__file__)))
        saved = True
        if receipt_handle:
            try:
                receipt_handle.seek(0)
                receipt_handle.write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
                receipt_handle.truncate()
                receipt_handle.flush()
                os.fsync(receipt_handle.fileno())
            except OSError:
                saved = False
                receipt.update(local_receipt_saved=False,
                    note="Final server result follows; local receipt persistence failed. Do not repeat a successful rollout")
        output = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
        print(output, end="")
        return 0 if result.returncode == 0 and receipt.get("passed") and saved else 1
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({"passed": False, "mode": "execute" if args.execute else "plan",
                          "error": str(exc)}), file=sys.stderr)
        return 2
    finally:
        if receipt_handle:
            try:
                receipt_handle.close()
            except OSError:
                pass  # The final sanitized server result was already printed.


if __name__ == "__main__":
    raise SystemExit(main())
