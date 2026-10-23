"""Isolated real-master HTTP result fixtures, never production player data.

The PCR bytes are declared test inputs. This verifies admission, unanimous
consent, guest filtering, Halo skill and the durable result/outbox transaction;
it does not claim a played native match. All databases belong to the caller's
disposable validation directory.
"""
import asyncio
import io
import json
import os
from pathlib import Path
import shutil
import sqlite3
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch


def generate(master_source, master_tests, output):
    output = Path(output).resolve()
    scratch = Path(os.environ["HALO2_TEST_SCRATCH"]).resolve()
    if not output.is_relative_to(scratch):
        raise ValueError("Result fixtures require owned disposable storage")
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="result-source-", dir=scratch) as stage, \
            patch.dict(os.environ, {"H2_EOS_PROFILES": "0"}):
        package = Path(stage) / "multiplayer"
        package.mkdir()
        (package / "__init__.py").write_text("")
        shutil.copytree(master_source, package / "master_server",
                        ignore=shutil.ignore_patterns("__pycache__", "tests", "*.orig"))
        shutil.copytree(master_tests, package / "master_server/tests",
                        ignore=shutil.ignore_patterns("__pycache__"))
        sys.path.insert(0, stage)
        from multiplayer.master_server.tests.test_couch_online import CouchOnlineTests, catalog
        from multiplayer.master_server.tests.test_ranked_results import RankedResultsTests
        from multiplayer.master_server.tests.test_matchmaking_http import MatchmakingHttpTests
        from multiplayer.master_server.player_statistics import totals
        from multiplayer.master_server.playlist_skill import display_level
        sys.path.remove(stage)

        def playlists():
            value = catalog()
            value["playlists"][0].update(team_size=0, minimum_players=2,
                                         maximum_players=2, maximum_party=1)
            return value

        cases = []

        class Pipeline(CouchOnlineTests):
            catalog_fixture = staticmethod(playlists)
            review = RankedResultsTests.review
            playlist = "casual"

            async def enqueue(self, headers, playlist=None):
                return await MatchmakingHttpTests.enqueue(self, headers, playlist or self.playlist)

            def report(self, descriptors):
                raw = super().report(descriptors)
                for slot in range(len(descriptors[0]["players"])):
                    for index, value in ((7, 7 if self.playlist == "casual" else 5),
                                         (9, 2 if self.playlist == "casual" else 1),
                                         (8, 3 if self.playlist == "casual" else 2)):
                        struct.pack_into("<H", raw, 0xe30 + 2 * (slot * 437 + index), value)
                    for field, value in ((4, 20 if self.playlist == "casual" else 10),
                                         (5, 8 if self.playlist == "casual" else 6)):
                        struct.pack_into("<H", raw, 0xe30 + slot * 874 + 154 + 2 * (5 * 8 + field), value)
                    # Source weapon 0 is outside the qualified accuracy range.
                    struct.pack_into("<H", raw, 0xe30 + slot * 874 + 154 + 2 * 4, 30000)
                return raw

            def export(self, room, name):
                db = self.api.directory.store.db
                player = room.players[0][0]
                self.assertNotIn(player, room.guests)
                before = tuple(db.execute("SELECT revision FROM eos_profile_outbox WHERE player=?", (player,)).fetchone())
                self.api.results.commit(room)
                self.assertEqual(before, tuple(db.execute("SELECT revision FROM eos_profile_outbox WHERE player=?", (player,)).fetchone()))
                summary = totals(db, player)
                self.assertEqual(summary["matches"], len(cases) + 1)
                self.assertTrue(summary["accuracy_complete"])
                self.assertEqual(summary["kills"], 7 if name == "casual" else 12)
                self.assertEqual(summary["shots"], 20 if name == "casual" else 30)
                self.assertEqual(summary["hits"], 8 if name == "casual" else 14)
                public = db.execute("SELECT public_id FROM history_players WHERE player=?", (player,)).fetchone()[0]
                self.assertEqual(db.execute("SELECT count(*) FROM match_result_players WHERE match=?", (room.id,)).fetchone()[0], 2)
                self.assertEqual(db.execute("SELECT count(*) FROM carnage_players WHERE match=?", (room.id,)).fetchone()[0], 2)
                # No guest may acquire a durable profile, history row or outbox.
                for guest in room.guests:
                    for table, column in (("player_profiles", "player"), ("history_players", "player"),
                                          ("eos_profile_outbox", "player")):
                        self.assertEqual(db.execute(f"SELECT count(*) FROM {table} WHERE {column}=?", (guest,)).fetchone()[0], 0)
                rank = db.execute("SELECT raw_rank FROM playlist_skill WHERE player=? AND playlist='ranked'", (player,)).fetchone()
                db.commit()
                path = output / (name + ".sqlite3")
                with sqlite3.connect(path) as target:
                    db.backup(target)
                cases.append(dict(name=name, database=str(path), player=player, public=public,
                                  expected=summary, ranked_level=display_level(rank[0]) if rank else None,
                                  guest_slots=len(room.guests), duplicate_commit_unchanged=True,
                                  report_sha256=room.result_digest))

            async def test_pipeline(self):
                await self.run_two_couches(expected=2)
                room = next(iter(self.api.transport.rooms.values()))
                self.assertEqual(len(room.guests), 6)
                self.export(room, "casual")
                self.local_rosters = {"one": [], "two": []}
                self.playlist = "ranked"
                _, descriptors, sockets, queues, host = await RankedResultsTests.running(self)
                room = self.api.transport.rooms[descriptors[0]["id"]]
                raw = self.report(descriptors)
                raw[0x370 + 0x94 + 0x90] = 1
                digest = await self.review(descriptors, sockets, queues, host, raw)
                await sockets[0].send_json({"confirm_result": digest})
                await asyncio.sleep(.05)
                self.assertEqual(self.api.directory.store.db.execute("SELECT count(*) FROM match_results").fetchone()[0], 1)
                await sockets[1].send_json({"confirm_result": digest})
                for queue in queues:
                    self.assertEqual(await asyncio.wait_for(queue.get(), 2), {"completed": digest})
                    await asyncio.wait_for(queue.get(), 2)
                self.export(room, "ranked")

        log = io.StringIO()
        result = unittest.TextTestRunner(stream=log).run(Pipeline("test_pipeline"))
        if not result.wasSuccessful():
            raise RuntimeError("Accepted-result fixture failed: " + log.getvalue()[-12000:])
    manifest = output / "cases.json"
    manifest.write_text(json.dumps(dict(cases=cases), indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--master-source", type=Path, required=True)
    parser.add_argument("--master-tests", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(generate(args.master_source, args.master_tests, args.output))
