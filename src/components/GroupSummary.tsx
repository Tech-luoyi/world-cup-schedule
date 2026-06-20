import { useMemo } from "react";
import type { GroupTable } from "../services/standings";

type Props = {
  groupTables: GroupTable[];
  onNavigateToTeam: (teamKey: string) => void;
};

type AllTeamRecord = {
  team: string;
  teamKey: string;
  flag: string;
  group: string;
  groupRank: number; // 1-4 within group
  mp: number;
  totalMatches: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

function getZoneLabel(rank: number): string {
  if (rank === 1 || rank === 2) return "出线";
  if (rank === 3) return "待定";
  return "危险";
}

function getZoneStyle(rank: number): string {
  if (rank === 1 || rank === 2) return "bg-[#00FF41]/[0.06] border-l-2 border-[#00FF41]/40";
  if (rank === 3) return "bg-[#FFAA00]/[0.06] border-l-2 border-[#FFAA00]/40";
  return "bg-[#FF0055]/[0.03] border-l-2 border-[#FF0055]/30";
}

function getZoneBadge(rank: number): string {
  if (rank === 1 || rank === 2) return "bg-[#00FF41]/20 text-[#00FF41]";
  if (rank === 3) return "bg-[#FFAA00]/20 text-[#FFAA00]";
  return "bg-[#FF0055]/20 text-[#FF0055]";
}

export default function GroupSummary({ groupTables, onNavigateToTeam }: Props) {
  const allTeams = useMemo<AllTeamRecord[]>(() => {
    const teams: AllTeamRecord[] = [];
    for (const table of groupTables) {
      table.records.forEach((r, idx) => {
        teams.push({
          team: r.team,
          teamKey: r.teamKey,
          flag: r.flag,
          group: table.group,
          groupRank: idx + 1,
          mp: r.mp,
          totalMatches: r.totalMatches,
          w: r.w,
          d: r.d,
          l: r.l,
          gf: r.gf,
          ga: r.ga,
          gd: r.gd,
          pts: r.pts,
        });
      });
    }
    teams.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    return teams;
  }, [groupTables]);

  const hasAnyData = allTeams.some((r) => r.mp > 0);

  if (!hasAnyData) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-12 text-center">
          <span className="text-4xl">⚽</span>
          <p className="mt-3 text-base text-[#555555]">暂无比赛数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 space-y-4">
      {/* Legend */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#00FF41] shadow-[0_0_6px_rgba(0,255,65,0.5)]" />
            <span className="text-[#00FF41] font-bold">出线区</span>
            <span className="text-[#666666]">小组前2名直接晋级 | 7分稳出线 · 6分近乎出线</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FFAA00] shadow-[0_0_6px_rgba(255,170,0,0.4)]" />
            <span className="text-[#FFAA00] font-bold">待定区</span>
            <span className="text-[#666666]">小组第3名 | 12取8 · 4分大概率出线 · 3分需比净胜球</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF0055] shadow-[0_0_6px_rgba(255,0,85,0.4)]" />
            <span className="text-[#FF0055] font-bold">危险区</span>
            <span className="text-[#666666]">小组第4名确定淘汰</span>
          </div>
        </div>
      </div>

      {/* All Teams Table */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl overflow-hidden">
        <div className="bg-[#1A1A1A] px-6 py-4 flex items-center justify-between border-b border-[#222222]">
          <span className="text-lg font-black text-[#00FF41] tracking-wider">
            全部球队 {allTeams.length}支
          </span>
          <span className="text-xs text-[#666666]">按积分→净胜球→进球排序</span>
        </div>

        {/* Column headers */}
        <div className="px-4 py-2.5 flex items-center gap-1.5 text-[10px] text-[#555555] font-bold border-b border-[#1A1A1A] uppercase tracking-wider">
          <span className="w-7 text-center">#</span>
          <span className="flex-1 min-w-0 text-left">球队</span>
          <span className="w-8 text-center">组</span>
          <span className="w-10 text-center">区域</span>
          <span className="w-10 text-center">赛/总</span>
          <span className="w-8 text-center">胜</span>
          <span className="w-8 text-center">平</span>
          <span className="w-8 text-center">负</span>
          <span className="w-10 text-center">进球</span>
          <span className="w-10 text-center">失球</span>
          <span className="w-10 text-center">净胜</span>
          <span className="w-12 text-right text-[#00FF41]">积分</span>
        </div>

        <div className="divide-y divide-[#1A1A1A]">
          {allTeams.map((r, idx) => (
            <div
              key={`${r.group}-${r.team}`}
              className={`px-4 py-3 flex items-center gap-1.5 transition-colors hover:bg-[#1A1A1A]/60 ${getZoneStyle(r.groupRank)}`}
            >
              {/* Global rank */}
              <span className="w-7 text-center font-mono text-xs font-bold text-[#666666]">
                {idx + 1}
              </span>

              {/* Flag + Team */}
              <button
                className="flex-1 min-w-0 flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onNavigateToTeam(r.teamKey)}
                title={`查看${r.team}球队详情`}
              >
                <span className="text-xl flex-shrink-0">{r.flag}</span>
                <span className="text-sm font-bold text-white truncate">{r.team}</span>
              </button>

              {/* Group */}
              <span className="w-8 text-center text-sm text-white font-mono font-bold">
                {r.group}
              </span>

              {/* Zone badge */}
              <span className={`w-10 text-center text-[10px] font-bold rounded px-1 py-0.5 ${getZoneBadge(r.groupRank)}`}>
                {getZoneLabel(r.groupRank)}
              </span>

              {/* MP */}
              <span className="w-10 text-center text-xs text-[#888888] font-mono">
                {r.mp}<span className="text-[#444444]">/{r.totalMatches}</span>
              </span>
              {/* W */}
              <span className="w-8 text-center text-xs text-[#00FF41] font-mono font-bold">{r.w}</span>
              {/* D */}
              <span className="w-8 text-center text-xs text-[#FFD700]/70 font-mono">{r.d}</span>
              {/* L */}
              <span className="w-8 text-center text-xs text-[#FF0055]/50 font-mono">{r.l}</span>
              {/* GF */}
              <span className="w-10 text-center text-xs text-white font-mono font-semibold">{r.gf}</span>
              {/* GA */}
              <span className="w-10 text-center text-xs text-[#888888] font-mono">{r.ga}</span>
              {/* GD */}
              <span className={`w-10 text-center text-xs font-mono font-bold ${
                r.gd > 0 ? "text-[#00FF41]" : r.gd < 0 ? "text-[#FF0055]/80" : "text-[#666666]"
              }`}>
                {r.gd > 0 ? "+" : ""}{r.gd}
              </span>
              {/* Pts */}
              <span className="w-12 text-right text-base font-mono text-[#00FF41] font-black">{r.pts}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
