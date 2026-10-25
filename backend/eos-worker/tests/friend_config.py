"""Check a real private config with the SDK, without reading/writing player data."""
import json
import os
import subprocess


def qualify_private_config(root,env,path):
    path=path.resolve(strict=True)
    info=path.stat()
    if os.name=='posix' and (info.st_mode&0o077 or info.st_uid not in (0,os.geteuid())):
        raise ValueError('Config must be owner-only')
    cache=root/'friend-config-cache';cache.mkdir(mode=0o700)
    private=env|dict(H2_EOS_WORKER_MODE='friends',H2_EOS_FRIEND_STORAGE_CONFIG=str(path),
        H2_EOS_FRIEND_CACHE_DIR=str(cache),HOME=str(root),XDG_CONFIG_HOME=str(root/'config'),
        XDG_DATA_HOME=str(root/'data'),XDG_CACHE_HOME=str(root/'cache'),
        # Inline secrets must never override the dedicated storage file.
        H2_EOS_FRIEND_CLIENT_SECRET='\ninvalid-inline-secret',H2_EOS_FRIEND_ENCRYPTION_KEY='invalid-inline-key')
    request=b'{"op":"board","board":"H2_RANKED_LEVEL"}\n'
    result=subprocess.run([str(root/'target/release/halo2-eos-worker')],input=request,env=private,
        stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=20)
    replies=[json.loads(line[6:]) for line in result.stdout.splitlines() if line.startswith(b'H2EOS ')]
    if result.returncode or len(replies)!=1 or replies[0]!={'ok':False,'error':'Storage client cannot execute this operation'}:
        raise ValueError('Storage config/platform policy check failed')
    return dict(passed=True,private_config_loaded=True,inline_secret_overrides_ignored=True,
        sdk_platform_initialized=True,publisher_operation_rejected=True,player_data_accessed=False,
        live_player_cloud_roundtrip_verified=False)
