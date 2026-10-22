import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { EosService,profileStats } from "../scripts/eos-service.ts";

function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE match_results(id TEXT,playlist TEXT,ranked INTEGER);
    CREATE TABLE match_result_players(match TEXT,player TEXT,placement INTEGER,kills INTEGER,deaths INTEGER,assists INTEGER);
    CREATE TABLE carnage_weapon_stats(player TEXT,weapon INTEGER,field INTEGER,value INTEGER);
    CREATE TABLE player_profiles(player TEXT,screen_name TEXT,discord_username TEXT,joined_at INTEGER);
    CREATE TABLE player_customization(player TEXT,appearance BLOB,service_tag TEXT);
    CREATE TABLE history_players(player TEXT,public_id TEXT);
    CREATE TABLE eos_players(player TEXT,puid TEXT);
    CREATE TABLE eos_profile_outbox(player TEXT,revision INTEGER);
    CREATE TABLE playlist_skill(player TEXT,playlist TEXT,configuration TEXT,raw_rank INTEGER,xp INTEGER);
    INSERT INTO match_results VALUES('m','slayer',1);
    INSERT INTO match_result_players VALUES('m','private-player',0,7,2,3);
    INSERT INTO carnage_weapon_stats VALUES('private-player',5,4,20),('private-player',5,5,8),('private-player',0,4,999);
    INSERT INTO player_profiles VALUES('private-player','Pilot','pilot',1700000000);
    INSERT INTO player_customization VALUES('private-player',X'ff020304013f1f81a5','A117');
    INSERT INTO history_players VALUES('private-player','public-player');
    INSERT INTO eos_players VALUES('private-player','11111111111111111111111111111111');
    INSERT INTO eos_profile_outbox VALUES('private-player',1);`);
  return db;
}
test("publishes source appearance, immutable join date, absolute career and correct shot counters",()=>{
  const db=fixture();try{
    const stats=profileStats(db,"private-player");
    assert.equal(stats.H2_KILLS,7);assert.equal(stats.H2_WINS,1);
    assert.equal(stats.H2_SHOTS,20);assert.equal(stats.H2_HITS,8);
    assert.equal(stats.H2_COLOR_0,-1);assert.equal(stats.H2_SPECIES,1);
    assert.equal(stats.H2_EMBLEM_RESERVED,165);assert.equal(stats.H2_TAG_0,65);
    assert.equal(stats.H2_JOINED_DAY*86400+stats.H2_JOINED_SECOND,1700000000);
    db.exec("UPDATE player_customization SET service_tag='';UPDATE player_profiles SET joined_at=NULL");
    const cleared=profileStats(db,"private-player");assert.equal(cleared.H2_TAG_0,0);assert.equal(cleared.H2_JOINED_KNOWN,0);
    db.exec("UPDATE match_result_players SET kills=2147483648");
    assert.throws(()=>profileStats(db,"private-player"),/range/);
  }finally{db.close();}
});
test("read-back gates publication; retries stay absolute and EOS top25 never leaks PUID or private IDs",async()=>{
  const db=fixture();let ingest=0,observed=false;
  const worker={close(){},async request(job:any){
    if(job.op==="board")return {records:[{user:"11111111111111111111111111111111",rank:1,score:7},{user:"22222222222222222222222222222222",rank:2,score:6}]};
    ++ingest;assert.equal(job.stats.H2_KILLS,7);return {stats:observed?job.stats:{}};
  }};
  const service=new EosService(db,"unused",":memory:",[{playlist:"slayer",board:"H2_SLAYER",stat:"H2_SLAYER_KILLS",metric:"kills"}],worker);
  try{
    await service.refresh();assert.equal(ingest,1);
    const before:any={id:"public-player",statistics:{kills:7}};service.enrich(before);assert.equal(before.statistics_source,undefined);
    observed=true;await service.refresh();assert.equal(ingest,2);
    const after:any={id:"public-player",statistics:{kills:7}};service.enrich(after);assert.equal(after.statistics_source,"eos");
    await service.refresh();assert.equal(ingest,2);
    const board=service.top("slayer")!;assert.equal(board.players.length,1);assert.equal(board.players[0].position,1);
    assert.ok(!JSON.stringify(board).includes("private-player"));assert.ok(!JSON.stringify(board).includes("11111111111111111111111111111111"));
    db.exec("UPDATE eos_profile_outbox SET revision=2");
    const newer:any={id:"public-player",statistics:{kills:8}};service.enrich(newer);assert.equal(newer.statistics_source,undefined);assert.equal(newer.statistics.kills,8);
  }finally{service.close();db.close();}
});
test("an invalid player's counters do not starve others and unchanged profiles refresh with queries",async()=>{
  const db=fixture();const jobs:any[]=[];
  db.exec(`INSERT INTO player_profiles VALUES('z-player','Other','other',1700000000);
    INSERT INTO history_players VALUES('z-player','other-public');
    INSERT INTO eos_players VALUES('z-player','22222222222222222222222222222222');
    INSERT INTO eos_profile_outbox VALUES('z-player',1);
    UPDATE match_result_players SET kills=2147483648;`);
  const worker={close(){},async request(job:any){jobs.push(job);return {stats:job.stats};}};
  const service=new EosService(db,"unused",":memory:",[],worker);
  const original=Date.now;
  try{
    await service.refresh();assert.equal(jobs.length,1);assert.equal(jobs[0].user,"2".repeat(32));
    assert.equal(jobs[0].op,"publish");
    Date.now=()=>original()+301000;
    await service.refresh();assert.equal(jobs.length,2);assert.equal(jobs[1].op,"query");
  }finally{Date.now=original;service.close();db.close();}
});
test("unmapped EOS qualification accounts do not consume the 25 public record slots",async()=>{
  const db=fixture();
  const unknown=Array.from({length:25},(_,n)=>({user:(n+100).toString(16).padStart(32,"0"),rank:n+1,score:50}));
  const worker={close(){},async request(job:any){return job.op==="board"?{records:[...unknown,{user:"1".repeat(32),rank:26,score:7}]}:{stats:job.stats};}};
  const service=new EosService(db,"unused",":memory:",[{playlist:"slayer",board:"H2_SLAYER",stat:"H2_SLAYER_KILLS",metric:"kills"}],worker);
  try{await service.refresh();const board=service.top("slayer")!;assert.equal(board.players.length,1);assert.equal(board.players[0].position,26);assert.equal(board.players[0].id,"public-player");}
  finally{service.close();db.close();}
});
