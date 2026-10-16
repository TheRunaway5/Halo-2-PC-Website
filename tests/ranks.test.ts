import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { currentSkill, skillsAtMatch } from "../scripts/public-ranks.ts";
test("public ranks use the literal 50-level display mapping and exclude unranked hidden skill", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
 CREATE TABLE playlist_skill(player TEXT,playlist TEXT,configuration TEXT,raw_rank INTEGER,xp INTEGER);
 CREATE TABLE history_players(player TEXT,public_id TEXT);
 CREATE TABLE match_results(id TEXT,playlist TEXT,ranked INTEGER);
 CREATE TABLE match_result_players(match TEXT,player TEXT);
 CREATE TABLE carnage_reports(match TEXT,public_id TEXT);
 CREATE TABLE match_result_skill(match TEXT,player TEXT,raw_rank INTEGER,configuration TEXT);
 INSERT INTO history_players VALUES('private','public');
 INSERT INTO playlist_skill VALUES('private','team_slayer','title-update-1.5-defaults',127,99999),('private','unranked','hidden',127,99999);
 INSERT INTO match_results VALUES('m1','team_slayer',1),('m2','unranked',0);
 INSERT INTO match_result_players VALUES('m1','private'),('m2','private');
 INSERT INTO carnage_reports VALUES('m1','public-match'),('m2','public-casual');
 INSERT INTO match_result_skill VALUES('m1','private',48,'title-update-1.5-defaults'),('m2','private',49,'hidden');
 `);
    assert.deepEqual(currentSkill(db, "public"), {
      level: 50,
      playlist: "team_slayer",
      configuration: "title-update-1.5-defaults",
    });
    assert.equal(currentSkill(db, "public", "unranked"), null);
    assert.equal(skillsAtMatch(db, "public-match").get("public")?.level, 49);
    assert.equal(skillsAtMatch(db, "public-casual").size, 0);
    assert.ok(!JSON.stringify(currentSkill(db, "public")).includes("99999"));
  } finally {
    db.close();
  }
});
