"""Exercise the shipped Steam overlay after priming its upstream cache."""
import json
from pathlib import Path
import sqlite3
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

WEBSITE=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(WEBSITE.parent/'Halo-2-Decompiled'))

class SocialOverlayTests(unittest.IsolatedAsyncioTestCase):
    async def test_both_block_directions_filter_cached_rows(self):
        text=(WEBSITE/'backend/eos-worker/steam-social-and-remembered-login.patch').read_text()
        chunk=text.split('+++ b/multiplayer/master_server/steam_friends.py\n',1)[1].split('\n--- ',1)[0]
        code='\n'.join(line[1:] for line in chunk.splitlines() if line.startswith('+'))
        ns={'__name__':'multiplayer.master_server._shipped_steam_friends','__package__':'multiplayer.master_server'}
        exec(compile(code,'shipped-steam-friends','exec'),ns)
        db=sqlite3.connect(':memory:');self.addCleanup(db.close)
        db.executescript("CREATE TABLE player_identities(player TEXT,provider TEXT,subject TEXT); CREATE TABLE party_blocks(player TEXT,inviter TEXT); INSERT INTO player_identities VALUES('target','steam','76561197960287931');")
        blocks=set()
        directory=SimpleNamespace(store=SimpleNamespace(db=db),rate=lambda *a:None,source=lambda r:'fixture',
            clans=SimpleNamespace(session=lambda r:(None,'caller')),
            friends=SimpleNamespace(blocked=lambda a,b:(a,b) in blocks or (b,a) in blocks))
        api=ns['SteamFriends'](directory)
        cached={'state':'ready','friends':[{'id':'76561197960287931','name':'Pilot'}]}
        api.lookup=AsyncMock(return_value=cached)
        with patch('multiplayer.master_server.player_presence.observed',return_value={'target':'online'}):
            visible=json.loads((await api.get(None)).text)
            self.assertTrue(visible['friends'][0]['halo_online'])
            for pair in (('caller','target'),('target','caller')):
                blocks.add(pair)
                self.assertEqual(json.loads((await api.get(None)).text)['friends'],[])
                blocks.clear()
            self.assertEqual(cached['friends'],[{'id':'76561197960287931','name':'Pilot'}])

    async def test_public_friend_search_does_not_consult_bilateral_block_state(self):
        text=(WEBSITE/'backend/eos-worker/friends-deployed.patch').read_text()
        chunk=text.split('+++ b/multiplayer/master_server/friends_http.py\n',1)[1].split('\n--- ',1)[0]
        code='\n'.join(line[1:] for line in chunk.splitlines() if line.startswith('+'))
        ns={'__name__':'multiplayer.master_server._shipped_friends','__package__':'multiplayer.master_server'}
        exec(compile(code,'shipped-friends','exec'),ns)
        import uuid
        directory=SimpleNamespace(body=AsyncMock(return_value={'request_id':str(uuid.uuid4()),'action':'search','tag':'Pilot#12345678'}),clans=SimpleNamespace(session=lambda r:(None,'caller')))
        expected={'id':'public-target','name':'Pilot','friend_tag':'Pilot#12345678','presence':'offline'}
        def private_predicate(*args):raise AssertionError('Public search consulted private block')
        fake=SimpleNamespace(directory=directory,db=None,view=lambda who:{'friends':[]},public_player=lambda target:expected,blocked=private_predicate)
        with patch('multiplayer.master_server.friend_tags.resolve',return_value='target'):
            result=await ns['FriendsApi'].command(fake,None)
        self.assertEqual(json.loads(result.text)['search_result'],expected)

if __name__=='__main__':unittest.main()
