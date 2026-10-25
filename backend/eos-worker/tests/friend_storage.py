"""Exercise real worker/C++ callbacks against an offline official-ABI fixture."""
import json
import subprocess


def qualify_storage_boundary(source,root,env):
    shim=root/'friend-storage-fixture.so'
    subprocess.run(['c++','-std=c++20','-shared','-fPIC',str(source/'tests/storage_fixture.cpp'),
        '-I'+str(root/'SDK/Include'),'-o',str(shim)],env=env,check=True)
    config=root/'fixture-friends.env'
    values=dict(H2_EOS_PRODUCT_ID='a'*32,H2_EOS_SANDBOX_ID='b'*32,H2_EOS_DEPLOYMENT_ID='c'*32,
        H2_EOS_FRIEND_CLIENT_ID='fixture-client',H2_EOS_FRIEND_CLIENT_SECRET='fixture-secret',
        H2_EOS_FRIEND_CACHE_DIR=str(root/'fixture-cache'),H2_EOS_FRIEND_ENCRYPTION_KEY='d'*64)
    config.write_text('\n'.join(k+'='+v for k,v in values.items())+'\n');config.chmod(0o600)
    record=dict(format='halo2-friends-v1',player='01234567-abcd-ef01-2345-6789abcdef01',
        friend_tag='Player#00000001',revision=2,relationships=[dict(player='01234567-abcd-ef01-2345-6789abcdef02',state='friend')])
    payload=json.dumps(record,sort_keys=True,separators=(',',':'))
    cases=[('new',None,True,1),('retry',payload,True,0),
        ('wrong_user',None,False,0),('missing_binding',None,False,0),
        ('newer_revision',json.dumps(record|dict(revision=3)),False,0),
        ('equal_conflict',json.dumps(record|dict(friend_tag='Other#00000001')),False,0),
        ('wrong_owner',json.dumps(record|dict(player='01234567-abcd-ef01-2345-6789abcdef03')),False,0),
        ('oversized',payload,False,0),('wrong_read_user',payload,False,0),
        ('malformed','not-json',False,0),('changed_readback',None,False,1)]
    results=[]
    for case,initial,accepted,writes in cases:
        private=env|dict(LD_PRELOAD=str(shim),H2_EOS_WORKER_MODE='friends',
            H2_EOS_FRIEND_STORAGE_CONFIG=str(config),H2_FRIEND_TEST_CASE=case,
            H2_EOS_FRIEND_CACHE_DIR=str(root/('cache-'+case)))
        if initial is not None:
            seed=root/(case+'.json');seed.write_text(initial);private['H2_FRIEND_TEST_INITIAL_FILE']=str(seed)
        request=json.dumps(dict(op='friend_store',user='a'*32,token='fixture-token',record=payload)).encode()+b'\n'
        result=subprocess.run([str(root/'target/release/halo2-eos-worker')],input=request,env=private,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
        replies=[json.loads(v[6:]) for v in result.stdout.splitlines() if v.startswith(b'H2EOS ')]
        counters=[json.loads(v[7:]) for v in result.stdout.splitlines() if v.startswith(b'H2TEST ')]
        if result.returncode or len(replies)!=1 or len(counters)!=1 or replies[0].get('ok')!=accepted or counters[0]['writes']!=writes:
            raise ValueError('Storage ABI boundary failed: '+case)
        if accepted and replies[0]['value']['record']!=payload:raise ValueError('Storage ack mismatch: '+case)
        if case=='new' and not(counters[0]['clears']==2 and counters[0]['reads']==1):raise ValueError('Storage skipped remote read-back')
        results.append(dict(case=case,passed=True,writes=writes,acknowledged=accepted))
    return dict(passed=True,cases=results,scope='Offline official SDK ABI callbacks; no EOS network or real players',
        live_player_cloud_roundtrip_verified=False)
