import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { DatabaseSync as Database } from "node:sqlite";
import { currentSkill } from "./public-ranks.ts";

type Board = { playlist: string; board: string; stat: string; metric: "kills" | "level" };
type StatReply = { stats: Record<string, number> };
export const counterNames = { matches:"H2_MATCHES", wins:"H2_WINS", kills:"H2_KILLS", deaths:"H2_DEATHS", assists:"H2_ASSISTS", shots:"H2_SHOTS", hits:"H2_HITS" } as const;
const safeName = (s: string) => /^[A-Z0-9_]{1,64}$/.test(s);
const safeBoard = (s: string) => /^[A-Za-z0-9_.:-]{1,256}$/.test(s);

export class EosWorker {
  private process?: ChildProcessWithoutNullStreams;
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private binary: string;
  constructor(binary: string) { this.binary=binary; }
  request(value: unknown): Promise<any> {
    if (++this.queued > 32) { --this.queued; return Promise.reject(new Error("EOS worker busy")); }
    const result = this.tail.catch(() => {}).then(() => this.execute(value));
    this.tail = result;
    return result.finally(() => { --this.queued; });
  }
  private execute(value: unknown): Promise<any> {
    if (!this.process) {
      this.process = spawn(this.binary, [], { stdio: ["pipe", "pipe", "pipe"] });
      // SDK diagnostics and credentials never enter HTTP responses or logs.
      this.process.stderr.resume();
      this.process.on("error", () => {});
    }
    const child = this.process;
    return new Promise((resolve, reject) => {
      let buffer = "", done = false;
      const finish = (error?: Error, data?: unknown) => {
        if (done) return; done = true; clearTimeout(timeout);
        child.stdout.off("data", read); child.off("exit", exited); child.off("error", exited);
        if (error) { this.close(); reject(error); } else resolve(data);
      };
      const exited = () => finish(new Error("EOS worker unavailable"));
      const read = (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        if (buffer.length > 262144) return finish(new Error("EOS worker response too large"));
        for (;;) {
          const newline = buffer.indexOf("\n"); if (newline < 0) break;
          const line = buffer.slice(0,newline); buffer = buffer.slice(newline+1);
          if (!line.startsWith("H2EOS ")) continue;
          try { const reply = JSON.parse(line.slice(6));
            if (reply.ok === true) finish(undefined, reply.value);
            else finish(new Error("EOS service operation failed"));
          } catch { finish(new Error("Invalid EOS worker reply")); }
        }
      };
      const timeout = setTimeout(() => finish(new Error("EOS worker timed out")), 40000);
      child.stdout.on("data", read); child.once("exit", exited); child.once("error", exited);
      child.stdin.write(JSON.stringify(value)+"\n", error => { if(error)finish(new Error("EOS worker unavailable")); });
    });
  }
  close() { const process = this.process; this.process = undefined; process?.kill(); }
}

export function profileStats(db: Database, player: string): Record<string, number> {
  const row = db.prepare(`SELECT COUNT(*) AS matches,COALESCE(SUM(placement=0),0) AS wins,
    COALESCE(SUM(kills),0) AS kills,COALESCE(SUM(deaths),0) AS deaths,COALESCE(SUM(assists),0) AS assists
    FROM match_result_players WHERE player=?`).get(player)!;
  const stats: Record<string,number> = {};
  for(const [field,key] of Object.entries(counterNames)) if(field!=="shots" && field!=="hits") stats[key]=Number(row[field]);
  const weapons = db.prepare(`SELECT field,SUM(value) AS value FROM carnage_weapon_stats WHERE player=?
    AND weapon BETWEEN 5 AND 38 AND field IN (4,5) GROUP BY field`).all(player);
  stats.H2_SHOTS=0;stats.H2_HITS=0;
  for(const w of weapons)stats[Number(w.field)===4?"H2_SHOTS":"H2_HITS"]=Number(w.value);
  const profile=db.prepare(`SELECT p.joined_at,c.appearance,c.service_tag FROM player_profiles p
    LEFT JOIN player_customization c ON c.player=p.player WHERE p.player=?`).get(player);
  if(profile?.joined_at!=null){const stamp=Number(profile.joined_at);stats.H2_JOINED_DAY=Math.floor(stamp/86400);stats.H2_JOINED_SECOND=stamp%86400;stats.H2_JOINED_KNOWN=1;}
  else stats.H2_JOINED_KNOWN=0;
  if(profile?.appearance instanceof Uint8Array){const bytes=profile.appearance;
    if(bytes.length!==9 || bytes[4]>1)throw new Error("Invalid source profile");
    stats.H2_SPECIES=bytes[4];
    for(let n=0;n<4;n++)stats[`H2_COLOR_${n}`]=bytes[n]>127?bytes[n]-256:bytes[n];
    for(const [n,key] of ["FOREGROUND","BACKGROUND","FLAGS","RESERVED"].entries())stats[`H2_EMBLEM_${key}`]=bytes[n+5];
    const tag=String(profile.service_tag??"");if(!/^[A-Z0-9]{0,4}$/.test(tag))throw new Error("Invalid source service tag");
    for(let n=0;n<4;n++)stats[`H2_TAG_${n}`]=tag.charCodeAt(n)||0;
  }
  if(Object.values(stats).some(v=>!Number.isInteger(v)||v< -2147483648||v>2147483647))throw new Error("EOS stat range exceeded");
  return stats;
}

export class EosService {
  private worker: Pick<EosWorker,"request"|"close">;
  private cache: DatabaseSync;
  private timer?: NodeJS.Timeout;
  private active=false;
  private closed=false;
  private cursor=0;
  readonly boards: Board[];
  private master: Database;
  constructor(master: Database, binary: string, state: string, boards: Board[], worker?: Pick<EosWorker,"request"|"close">) {
    this.master=master;
    this.worker=worker??new EosWorker(binary); this.boards=boards;
    this.cache=new DatabaseSync(state);
    this.cache.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS publication(player TEXT PRIMARY KEY,revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS stats(player TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS boards(id TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at INTEGER NOT NULL);`);
  }
  start(){this.timer=setInterval(()=>void this.refresh(),15000);void this.refresh();}
  async refresh(){
    if(this.active||this.closed)return;this.active=true;
    try {
      const rows=this.master.prepare(`SELECT o.player,o.revision,e.puid,h.public_id FROM eos_profile_outbox o
        JOIN eos_players e ON e.player=o.player JOIN history_players h ON h.player=o.player ORDER BY o.player`).all();
      let published=0;
      const start=this.cursor;
      for(let offset=0;offset<rows.length && !this.closed;offset++){
        const index=(start+offset)%rows.length;
        const row=rows[index];
        const old=this.cache.prepare("SELECT revision FROM publication WHERE player=?").get(row.player);
        const cached=this.cache.prepare("SELECT updated_at FROM stats WHERE player=?").get(row.player);
        const current=old && Number(old.revision)===Number(row.revision);
        if(current && cached && Number(cached.updated_at)>Date.now()/1000-300)continue;
        if(published++>=4)break;
        try {
        this.master.exec("BEGIN");
        let stats: Record<string,number>;
        try {
          stats=profileStats(this.master,String(row.player));
          for(const b of this.boards){
            if(b.metric==="level"){const rank=currentSkill(this.master,String(row.public_id),b.playlist);if(rank)stats[b.stat]=rank.level;}
            else stats[b.stat]=Number(this.master.prepare(`SELECT COALESCE(SUM(r.kills),0) AS total FROM match_result_players r
              JOIN match_results m ON m.id=r.match WHERE r.player=? AND m.playlist=?`).get(row.player,b.playlist)!.total);
          }
          this.master.exec("COMMIT");
        }catch(error){this.master.exec("ROLLBACK");throw error;}
        if(Object.values(stats).some(v=>!Number.isInteger(v)||v< -2147483648||v>2147483647))throw new Error("EOS stat range exceeded");
        const reply=await this.worker.request({op:current?"query":"publish",user:row.puid,stats}) as StatReply;
        // The SDK's ingest callback only acknowledges receipt. Keep the item
        // pending until every published absolute value is observed in a query.
        if(!reply.stats || Object.entries(stats).some(([k,v])=>reply.stats[k]!==v)){
          if(current)this.cache.prepare("DELETE FROM publication WHERE player=?").run(row.player);
          continue;
        }
        this.cache.prepare("INSERT OR REPLACE INTO stats VALUES(?,?,?)").run(row.player,JSON.stringify(reply.stats),Math.floor(Date.now()/1000));
        this.cache.prepare("INSERT OR REPLACE INTO publication VALUES(?,?)").run(row.player,row.revision);
        }catch { /* A failing player must not starve the rest of the queue. */ }
        finally { this.cursor=(index+1)%rows.length; }
      }
      for(const board of this.boards){
        if(this.closed)break;
        try {
        const cached=this.cache.prepare("SELECT updated_at FROM boards WHERE id=?").get(board.board);
        if(cached && Number(cached.updated_at)>Date.now()/1000-300)continue;
        const reply=await this.worker.request({op:"board",board:board.board});
        if(!Array.isArray(reply.records)||reply.records.length>1000||new Set(reply.records.map((r:any)=>r.user)).size!==reply.records.length||reply.records.some((r:any)=>
          !/^[0-9a-f]{32}$/.test(r.user)||!Number.isInteger(r.rank)||r.rank<1||!Number.isInteger(r.score)||r.score< -2147483648||r.score>2147483647))throw new Error("Invalid EOS board");
        this.cache.prepare("INSERT OR REPLACE INTO boards VALUES(?,?,?)").run(board.board,JSON.stringify(reply.records),Math.floor(Date.now()/1000));
        }catch { /* Each board recovers independently. */ }
      }
    }catch { /* Keep accepted master data and retry after service recovery. */ }
    finally{this.active=false;if(this.closed)this.cache.close();}
  }
  enrich(player: Record<string,any>){
    const row=this.master.prepare("SELECT player FROM history_players WHERE public_id=?").get(player.id);if(!row)return;
    const cached=this.cache.prepare("SELECT data,updated_at FROM stats WHERE player=?").get(row.player);
    if(!cached||Number(cached.updated_at)<Date.now()/1000-900)return;
    const data=JSON.parse(String(cached.data));
    // Do not regress a newer accepted result/profile to an older EOS snapshot.
    const dirty=this.master.prepare("SELECT revision FROM eos_profile_outbox WHERE player=?").get(row.player);
    const sent=this.cache.prepare("SELECT revision FROM publication WHERE player=?").get(row.player);
    if(!dirty||!sent||Number(sent.revision)!==Number(dirty.revision))return;
    if(player.statistics)for(const [field,key] of Object.entries(counterNames))player.statistics[field]=data[key];
    player.statistics_source="eos";player.statistics_updated_at=Number(cached.updated_at);
  }
  top(playlist: string){
    const definition=this.boards.find(b=>b.playlist===playlist);if(!definition)return null;
    const cached=this.cache.prepare("SELECT data,updated_at FROM boards WHERE id=?").get(definition.board);if(!cached)return null;
    const players=[];
    for(const r of JSON.parse(String(cached.data))){
      const row=this.master.prepare(`SELECT h.public_id AS id,p.screen_name,p.discord_username FROM eos_players e
        JOIN history_players h ON h.player=e.player JOIN player_profiles p ON p.player=e.player WHERE e.puid=?`).get(r.user);
      if(row)players.push({id:String(row.id),screen_name:String(row.screen_name),discord_username:String(row.discord_username),position:Number(r.rank),score:Number(r.score),skill:currentSkill(this.master,String(row.id),playlist)});
      if(players.length===25)break;
    }
    return {playlist,metric:definition.metric,players,updated_at:Number(cached.updated_at),source:"eos"};
  }
  close(){if(this.closed)return;this.closed=true;if(this.timer)clearInterval(this.timer);this.worker.close();if(!this.active)this.cache.close();}
}

export function eosEnvironment(db: Database): EosService | null {
  const binary=process.env.H2_EOS_WORKER,state=process.env.H2_EOS_WEB_STATE;
  if(!binary||!state)return null;
  const boards: Board[]=process.env.H2_EOS_LEADERBOARDS_FILE?JSON.parse(readFileSync(process.env.H2_EOS_LEADERBOARDS_FILE,"utf8")):[];
  if(!Array.isArray(boards)||boards.length>64||new Set(boards.map(b=>b.playlist)).size!==boards.length||boards.some(b=>!b||typeof b.playlist!=="string"||!b.playlist.length||b.playlist.length>64||!safeBoard(b.board)||!safeName(b.stat)||!["kills","level"].includes(b.metric)))throw new Error("Invalid EOS board configuration");
  return new EosService(db,binary,state,boards);
}
