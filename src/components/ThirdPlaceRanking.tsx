import { useMemo } from "react";
import type { GroupTable } from "../services/standings";

type Props = {
  groupTables: GroupTable[];
  onNavigateToTeam: (teamKey: string) => void;
};

type ThirdPlaceRecord = {
  team: string;
  teamKey: string;
  flag: string;
  group: string;
  mp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

export default function ThirdPlaceRanking({ groupTables, onNavigateToTeam }: Props) {
  const thirdPlaceRanking = useMemo<ThirdPlaceRecord[]>(() => {
    const thirds = groupTables
      .filter((t) => t.records.length >= 3)
      .map((t) => {
        const r = t.records[2];
        return {
          team: r.team,
          teamKey: r.teamKey,
          flag: r.flag,
          group: t.group,
          mp: r.mp,
          w: r.w,
          d: r.d,
          l: r.l,
          gf: r.gf,
          ga: r.ga,
          gd: r.gd,
          pts: r.pts,
        };
      });
    thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    return thirds;
  }, [groupTables]);

  const hasAnyData = thirdPlaceRanking.some((r) => r.mp > 0);

  if (!hasAnyData) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-12 text-center">
          <span className="text-4xl">⚽</span>
          <p className="mt-3 text-base text-[#555555]">暂无第3名比赛数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-4">
      {/* Explanation */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FFAA00] shadow-[0_0_6px_rgba(255,170,0,0.4)]" />
            <span className="text-[#FFAA00] font-bold">晋级区</span>
            <span className="text-[#666666]">前8名第3名晋级淘汰赛</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF0055] shadow-[0_0_6px_rgba(255,0,85,0.4)]" />
            <span className="text-[#FF0055] font-bold">淘汰区</span>
            <span className="text-[#666666]">后4名第3名直接淘汰</span>
          </div>
          <span className="text-[#666666]">|</span>
          <span className="text-[#666666]">按积分→净胜球→进球排序</span>
        </div>
      </div>

      {/* 3rd Place Ranking Table */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl overflow-hidden overflow-x-auto hide-scrollbar">
        <div className="bg-[#1A1A1A] px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 border-b border-[#222222]">
          <span className="text-lg font-black text-[#FFAA00] tracking-wider">
            第3名排名
          </span>
          <span className="text-xs text-[#666666] bg-[#222222] px-2 py-0.5 rounded">
            前8晋级
          </span>
        </div>

        {/* Column headers */}
        <div className="px-2 py-2.5 flex items-center gap-1 text-[10px] text-[#555555] font-bold border-b border-[#1A1A1A] uppercase tracking-wider min-w-[420px]">
          <span className="w-6 text-center">#</span>
          <span className="flex-1 min-w-0 text-left">球队</span>
          <span className="w-7 text-center">组</span>
          <span className="w-7 text-center">赛</span>
          <span className="w-7 text-center">胜</span>
          <span className="w-7 text-center">平</span>
          <span className="w-7 text-center">负</span>
          <span className="w-8 text-center">进</span>
          <span className="w-8 text-center">失</span>
          <span className="w-8 text-center">净</span>
          <span className="w-10 text-right text-[#FFAA00]">分</span>
        </div>

        <div className="divide-y divide-[#1A1A1A]">
          {thirdPlaceRanking.map((r, idx) => (
            <div
              key={r.team}
              className={`px-2 py-3 flex items-center gap-1 transition-colors hover:bg-[#1A1A1A]/60 min-w-[420px] ${
                idx < 8 ? "bg-[#FFAA00]/[0.04]" : "bg-[#FF0055]/[0.03] opacity-50"
              }`}
            >
              {/* Rank */}
              <span
                className={`w-6 text-center font-mono text-sm font-bold ${
                  idx < 8 ? "text-[#FFAA00]" : "text-[#FF0055]/60"
                }`}
              >
                {idx + 1}
              </span>
              {/* Flag + Team */}
              <button
                className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onNavigateToTeam(r.teamKey)}
                title={`查看${r.team}球队详情`}
              >
                <span className="text-lg flex-shrink-0">{r.flag}</span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">{r.team}</span>
              </button>
              {/* Group */}
              <span className="w-7 text-center text-xs text-white font-mono font-bold">
                {r.group}
              </span>
              {/* MP */}
              <span className="w-7 text-center text-xs text-[#888888] font-mono">
                {r.mp}
              </span>
              {/* W */}
              <span className="w-7 text-center text-xs text-[#00FF41] font-mono font-bold">{r.w}</span>
              {/* D */}
              <span className="w-7 text-center text-xs text-[#FFD700]/70 font-mono">{r.d}</span>
              {/* L */}
              <span className="w-7 text-center text-xs text-[#FF0055]/60 font-mono">{r.l}</span>
              {/* GF */}
              <span className="w-8 text-center text-xs text-white font-mono font-semibold">{r.gf}</span>
              {/* GA */}
              <span className="w-8 text-center text-xs text-[#888888] font-mono">{r.ga}</span>
              {/* GD */}
              <span className={`w-8 text-center text-xs font-mono font-bold ${
                r.gd > 0 ? "text-[#00FF41]" : r.gd < 0 ? "text-[#FF0055]/80" : "text-[#666666]"
              }`}>
                {r.gd > 0 ? "+" : ""}{r.gd}
              </span>
              {/* Pts */}
              <span className="w-10 text-right text-base font-mono text-[#FFAA00] font-black">
                {r.pts}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
