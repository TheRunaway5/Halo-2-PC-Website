import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { EosService } from '../scripts/eos-service.ts';

test('EOS refresh examines a bounded page and advances past fresh rows',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE eos_profile_outbox(player TEXT PRIMARY KEY,revision INTEGER);
 CREATE TABLE eos_players(player TEXT PRIMARY KEY,puid TEXT);
 CREATE TABLE history_players(player TEXT PRIMARY KEY,public_id TEXT);`);
 const cache=new DatabaseSync(':memory:');
 const service=new EosService(db,'unused',':memory:',[],{close(){},async request(){throw Error('no publication expected');}});
 const state=(service as any).cache;
 for(let i=0;i<500;i++){
  const key=String(i).padStart(4,'0');
  db.prepare('INSERT INTO eos_profile_outbox VALUES(?,1)').run(key);
  db.prepare('INSERT INTO eos_players VALUES(?,?)').run(key,'1'.repeat(32));
  db.prepare('INSERT INTO history_players VALUES(?,?)').run(key,key);
  state.prepare('INSERT INTO publication VALUES(?,1)').run(key);
  state.prepare('INSERT INTO stats VALUES(?,?,?)').run(key,'{}',Math.floor(Date.now()/1000));
 }
 let lookups=0;const original=state.prepare.bind(state);
 state.prepare=(sql:string)=>{lookups++;return original(sql);};
 try {
  await service.refresh(); assert.ok(lookups<=64,`unbounded lookups: ${lookups}`);
  const first=(service as any).cursor;assert.notEqual(first,'');assert.notEqual(first,0);
  lookups=0;await service.refresh();assert.ok(lookups<=64);assert.notEqual((service as any).cursor,first);
 } finally {service.close();cache.close();db.close();}
});
