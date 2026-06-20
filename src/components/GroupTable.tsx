import type { GroupTable as GroupTableType } from "../services/standings";

type Props = {
  table: GroupTableType;
  onNavigateToTeam: (teamKey: string) => void;
};

export default function GroupTable({ table, onNavigateToTeam }: Props) {
  const hasResults = table.records.some((r) => r.mp > 0);

  if (!hasResults) {
    return (
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-12 text-center">
        <span className="text-4xl">⚽</span>
        <p className="mt-3 text-base text-[#555555]">{table.group}组暂无比赛数据</p>
      </div>
    );
  }

  return (
    <div className="bg-[#111111] border border-[#222222] rounded-2xl overflow-hidden overflow-x-auto hide-scrollbar">
      {/* Header */}
      <div className="bg-[#1A1A1A] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-[#222222]">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-[#00FF41] text-glow tracking-wider">
            {table.group}组
          </span>
          <span className="text-xs text-[#666666] bg-[#222222] px-2 py-0.5 rounded">
            前2名晋级
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className="px-4 sm:px-6 py-2.5 flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-[#555555] font-bold border-b border-[#1A1A1A] uppercase tracking-wider min-w-[520px]">
        <span className="w-8 text-center">#</span>
        <span className="flex-1 text-left">球队</span>
        <span className="w-12 text-center">赛/总</span>
        <span className="w-10 text-center">胜</span>
        <span className="w-10 text-center">平</span>
        <span className="w-10 text-center">负</span>
        <span className="w-12 text-center">进球</span>
        <span className="w-12 text-center">失球</span>
        <span className="w-12 text-center">净胜</span>
        <span className="w-14 text-right text-[#00FF41]">积分</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#1A1A1A]">
        {table.records.map((r, idx) => (
          <div
            key={r.team}
            className={`px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-1 sm:gap-2 transition-colors min-w-[520px] ${
              idx < 2 ? "bg-[#00FF41]/[0.05]" : ""
            } hover:bg-[#1A1A1A]/60`}
          >
            {/* Rank */}
            <span
              className={`w-8 text-center font-mono text-lg font-bold ${
                idx === 0
                  ? "text-[#FFD700]"
                  : idx === 1
                  ? "text-[#C0C0C0]"
                  : "text-[#555555]"
              }`}
            >
              {idx + 1}
            </span>

            {/* Flag + Team */}
            <button
              className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onNavigateToTeam(r.teamKey)}
              title={`查看${r.team}球队详情`}
            >
              <span className="text-2xl flex-shrink-0">{r.flag}</span>
              <span className="text-base font-bold text-white truncate">
                {r.team}
              </span>
            </button>

            {/* MP */}
            <span className="w-12 text-center text-base text-[#888888] font-mono">
              {r.mp}<span className="text-[#444444]">/{r.totalMatches}</span>
            </span>
            {/* W */}
            <span className="w-10 text-center text-base text-[#00FF41] font-mono font-bold">{r.w}</span>
            {/* D */}
            <span className="w-10 text-center text-base text-[#FFD700]/70 font-mono">{r.d}</span>
            {/* L */}
            <span className="w-10 text-center text-base text-[#FF0055]/60 font-mono">{r.l}</span>
            {/* GF */}
            <span className="w-12 text-center text-base text-white font-mono font-semibold">{r.gf}</span>
            {/* GA */}
            <span className="w-12 text-center text-base text-[#888888] font-mono">{r.ga}</span>
            {/* GD */}
            <span className={`w-12 text-center text-base font-mono font-bold ${
              r.gd > 0 ? "text-[#00FF41]" : r.gd < 0 ? "text-[#FF0055]/80" : "text-[#666666]"
            }`}>
              {r.gd > 0 ? "+" : ""}{r.gd}
            </span>
            {/* Pts */}
            <span className="w-14 text-right text-xl font-mono text-[#00FF41] font-black">{r.pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
