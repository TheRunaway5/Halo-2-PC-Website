"""Explicit live SDK qualification against an isolated generated device-test user."""
import hashlib
import json
import re
import selectors
import subprocess
import time


def qualify(source,root,env,server_config,game_config):
    binary=root/'device-fixture'
    subprocess.run(['c++','-std=c++20',str(source/'tests/device_fixture.cpp'),'-I'+str(root/'SDK/Include'),
        '-L'+str(root/'SDK/Bin'),'-lEOSSDK-Linux-Shipping','-o',str(binary)],env=env,check=True)
    cache=root/'device-cache';cache.mkdir()
    private=env|{'XDG_CONFIG_HOME':str(root/'config'),'XDG_DATA_HOME':str(root/'data'),'XDG_CACHE_HOME':str(root/'cache')}
    fixture=subprocess.run([str(binary),str(game_config.resolve()),str(cache)],env=private,capture_output=True,text=True,timeout=80)
    if fixture.returncode:raise RuntimeError('Device qualification failed: '+fixture.stderr[-256:])
    match=re.search(r'^H2_TEST_USER ([0-9a-f]{32})$',fixture.stdout,re.M)
    if not match:raise RuntimeError('Device qualification returned no user')
    user=match[1]
    process=subprocess.Popen([str(root/'target/release/halo2-eos-worker')],env=private|{'H2_EOS_SERVER_CONFIG':str(server_config.resolve()),'H2_EOS_SERVER_CACHE_DIR':str(root/'server-cache')},stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    def request(op,stats=None,board=None):
        process.stdin.write(json.dumps(dict(op=op,user=user,stats=stats,board=board)).encode()+b'\n');process.stdin.flush()
        selector=selectors.DefaultSelector();selector.register(process.stdout,selectors.EVENT_READ)
        try:
            until=time.monotonic()+40
            while time.monotonic()<until:
                if not selector.select(max(0,until-time.monotonic())):break
                line=process.stdout.readline(262144)
                if not line:raise RuntimeError('EOS worker exited')
                if not line.startswith(b'H2EOS '):continue
                reply=json.loads(line[6:])
                if reply.get('ok') is not True:raise RuntimeError('EOS rejected qualification: '+str(reply.get('error'))[:128])
                return reply['value']['records' if op=='board' else 'stats']
            raise RuntimeError('EOS qualification reply timed out')
        finally:selector.close()
    def observe(stats):
        values=request('publish',stats)
        until=time.monotonic()+120
        while values!=stats and time.monotonic()<until:
            time.sleep(2);values=request('query',stats)
        if any(values.get(k)!=v for k,v in stats.items()):raise RuntimeError('EOS stat read-back did not converge')
    try:
        stats={'H2_MATCHES':1,'H2_WINS':1,'H2_KILLS':7,'H2_DEATHS':2,'H2_ASSISTS':3,'H2_SHOTS':20,'H2_HITS':8,
            'H2_JOINED_DAY':20000,'H2_JOINED_SECOND':12345,'H2_JOINED_KNOWN':1,'H2_SPECIES':1,
            'H2_EMBLEM_FOREGROUND':63,'H2_EMBLEM_BACKGROUND':31,'H2_EMBLEM_FLAGS':129,'H2_EMBLEM_RESERVED':165}
        stats.update({f'H2_COLOR_{n}':v for n,v in enumerate([-1,2,3,4])})
        stats.update({f'H2_TAG_{n}':ord(v) for n,v in enumerate('A117')})
        observe(stats);print('EOS qualification: all 23 fields observed',flush=True)
        observe(stats);print('EOS qualification: duplicate absolute publication did not add counters',flush=True)
        cleared=stats|{'H2_SPECIES':0,**{f'H2_TAG_{n}':0 for n in range(4)}}
        observe(cleared);print('EOS qualification: LATEST decreases and service-tag clearing observed',flush=True)
        boards=json.loads((source/'config/leaderboards.json').read_text())
        for board in boards:request('board',board=board['board'])
        print('EOS qualification: all nine configured board IDs queried successfully',flush=True)
        def board_score(score):
            observe({'H2_RANKED_LEVEL':score})
            until=time.monotonic()+120
            while time.monotonic()<until:
                rows=request('board',board='H2_RANKED_LEVEL')
                if any(r['user']==user and r['score']==score for r in rows):return
                time.sleep(2)
            raise RuntimeError('EOS leaderboard did not observe the current level')
        board_score(3);board_score(1)
        print('EOS qualification: populated leaderboard and lowering current level observed',flush=True)
        return dict(passed=True,boards_queried=len(boards),board_rank_decrease=True,scope='Real trusted server SDK publication to one isolated test PUID; not production account binding',fields=len(stats),duplicate_safe=True,latest_decrease_and_clear=True,user_hash=hashlib.sha256(user.encode()).hexdigest())
    finally:
        process.terminate()
        try:process.wait(5)
        except subprocess.TimeoutExpired:process.kill();process.wait()
