import type { KnockoutRound } from "../services/standings";

type Props = {
  rounds: KnockoutRound[];
};

function SlotCard({ home, away }: { home: string; away: string }) {
  const isTbd = home === "待定" || away === "待定";
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded border text-xs ${
        isTbd
          ? "bg-[#111111] border-[#1A1A1A] text-[#555555]"
          : "bg-[#1A1A1A] border-[#222222]"
      }`}
    >
      <span className="truncate">{home}</span>
      <span className="text-[10px] text-[#00FF41] mx-1">vs</span>
      <span className="truncate">{away}</span>
    </div>
  );
}

export default function KnockoutBracket({ rounds }: Props) {
  if (rounds.length === 0) {
    return (
      <div className="text-center py-12 text-[#888888] text-sm">
        淘汰赛对阵尚未公布
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {rounds.map((round) => (
          <div key={round.stage} className="bg-[#111111] border border-[#1A1A1A] rounded-xl overflow-hidden">
            <div className="bg-[#1A1A1A] px-3 py-2">
              <span className="text-xs font-bold text-[#00FF41]">
                {round.label}
              </span>
              <span className="text-[10px] text-[#555555] ml-2">
                {round.matchCount} 场
              </span>
            </div>
            <div className="p-2 space-y-2">
              {round.matches.map((m) => {
                const home = m.homeTeam || "待定";
                const away = m.awayTeam || "待定";
                return (
                  <SlotCard key={m.id} home={home} away={away} />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
