"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RankBadge } from "./rank-badge";
import { SteamProfileLink } from "./steam-profile-link";
import { VistaIntro } from "./vista-motion";
import { ArrowUpRight, RefreshCw, Trophy } from "lucide-react";
import { api, label, playerLink } from "@/lib/api";
import type { Leaderboard } from "@/lib/types";
import { EmptyState, Loading, SectionTitle } from "./ui";

export function LeaderboardView() {
  const [playlists,setPlaylists]=useState<string[]|null>(null),[playlist,setPlaylist]=useState("");
  const [data,setData]=useState<Leaderboard|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const c=new AbortController();
    api.playlists(c.signal).then(r=>{setPlaylists(r.playlists);setPlaylist(current=>current||r.playlists[0]||"");if(!r.playlists.length)setLoading(false);})
      .catch(e=>{if(!c.signal.aborted){setError(e.message);setLoading(false);}});
    return ()=>c.abort();
  },[]);
  useEffect(()=>{
    if(!playlist)return;
    const c=new AbortController();setLoading(true);setError("");setData(null);
    api.leaders(playlist,c.signal).then(setData).catch(e=>{if(!c.signal.aborted)setError(e.message);})
      .finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return ()=>c.abort();
  },[playlist,refresh]);
  return <div className="page-width interior">
    <SectionTitle number="01" eyebrow="COMMUNITY STANDINGS" title="Playlist top 25.">
      <span className="page-tag"><Trophy size={15}/> ALL-TIME RECORDS</span>
    </SectionTitle>
    <p className="page-intro">The leading players in each playlist, based on verified match results.</p>
    <div className="filter-bar">
      <label>PLAYLIST<select value={playlist} onChange={e=>setPlaylist(e.target.value)} disabled={!playlists?.length}>
        {playlists?.map(p=><option key={p} value={p}>{label(p)}</option>)}
      </select></label>
      <button className="icon-button" aria-label="Refresh leaderboard" disabled={loading||!playlist} onClick={()=>setRefresh(r=>r+1)}><RefreshCw size={17}/></button>
      <span className="filter-note">{data?.metric==="level"?"Current playlist skill":"Total playlist kills"}</span>
    </div>
    <VistaIntro className="data-panel" track="panel">
      <div className="panel-caption"><span>PLAYER STANDINGS</span><span className="muted">TOP 25</span></div>
      {loading?<Loading/>:error?<EmptyState title="Standings unavailable" error>{error}</EmptyState>:!data?.players.length?
        <EmptyState title="The next legend starts here.">Playlist standings will appear after verified results are published.</EmptyState>:
        <div className="table-scroll"><table><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Skill</th><th scope="col">{data.metric==="level"?"Level":"Kills"}</th><th scope="col"><span className="sr-only">Service record</span></th></tr></thead>
          <tbody>{data.players.map(p=><VistaIntro as="tr" track="player" delay={250} key={p.id}>
            <td className={p.position<=3?"top-position":""}>{String(p.position).padStart(2,"0")}</td>
            <td><div className="player-cell"><Link className="player-emblem" href={playerLink(p.id)} aria-label={`View ${p.screen_name}'s service record`}>{p.screen_name.slice(0,1).toUpperCase()}</Link><span className="player-name"><Link href={playerLink(p.id)}><strong>{p.screen_name}</strong></Link><SteamProfileLink player={p}/></span></div></td>
            <td><RankBadge skill={p.skill}/></td><td className="stat-highlight">{p.score.toLocaleString()}</td>
            <td><Link href={playerLink(p.id)} aria-label={`View ${p.screen_name}'s service record`}><ArrowUpRight size={16}/></Link></td>
          </VistaIntro>)}</tbody></table></div>}
    </VistaIntro>
    <p className="data-note">Ranked playlists retain Halo’s skill rules. Standings update periodically; detailed match history remains in each player’s service record. Guests are excluded.</p>
  </div>;
}
