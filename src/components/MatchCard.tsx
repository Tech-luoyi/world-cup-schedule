import type { Match } from "../types/match";

function formatNumber(n: number): string {
  if (n >= 10000) {
    return (n / 10000).toFixed(1) + "w";
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1) + "k";
  }
  return n.toString();
}

function formatStage(stage: string, group?: string): string {
  if (group) return `${stage} · G${group}`;
  return stage;
}

type MatchCardProps = {
  match: Match;
  onNavigateToTeam: (teamKey: string) => void;
  onNavigateToPrediction?: (homeKey: string, awayKey: string) => void;
};

export default function MatchCard({ match, onNavigateToTeam, onNavigateToPrediction }: MatchCardProps) {
  const isLive = match.status === "live";
  const isUpcoming = match.status === "upcoming";

  const handleCardClick = () => {
    if (match.status === "finished") return;
    if (onNavigateToPrediction) {
      onNavigateToPrediction(match.homeTeamKey, match.awayTeamKey);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`relative rounded-xl p-4 transition-all duration-300 border cursor-pointer ${
        isLive
          ? "bg-[#1A1A1A] border-[#00FF41]/50 live-glow"
          : isUpcoming
          ? "bg-[#111111] border-[#1A1A1A] opacity-80"
          : "bg-[#1A1A1A] border-[#1A1A1A]"
      } hover:border-[#00FF41]/30 hover:opacity-100`}
    >
      {/* Stage badge + heat info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${
              isLive
                ? "bg-[#00FF41]/20 text-[#00FF41]"
                : isUpcoming
                ? "bg-[#FFD700]/20 text-[#FFD700]"
                : "bg-[#FF0055]/20 text-[#FF0055]"
            }`}
          >
            {isLive && <span className="live-indicator inline-block mr-1">🔴</span>}
            {isLive ? "LIVE" : isUpcoming ? "即将开始" : "已结束"}
          </span>
          <span className="text-[10px] text-[#555555] truncate">
            {formatStage(match.stage, match.groupLetter)}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#888888] flex-shrink-0">
          <span className="flex items-center gap-1">
            <span>🔥</span>
            <span className="text-[#FF0055]">{match.heatIndex}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>💬</span>
            <span>{formatNumber(match.discussionCount)}</span>
          </span>
        </div>
      </div>

      {/* Teams + score */}
      <div className="flex items-center justify-between gap-4">
        {/* Home team */}
        <button
          className="flex flex-col items-center flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onNavigateToTeam(match.homeTeamKey); }}
          title={`查看${match.homeTeam}球队详情`}
        >
          <span className="text-3xl mb-1">{match.homeFlag}</span>
          <span
            className={`text-sm font-bold truncate max-w-full ${
              isUpcoming ? "text-[#888888]" : "text-white"
            }`}
          >
            {match.homeTeam}
          </span>
        </button>

        {/* Score / VS */}
        <div className="flex flex-col items-center flex-shrink-0 mx-2">
          {isUpcoming ? (
            <span className="score-number text-2xl text-[#888888]">vs</span>
          ) : (
            <span
              className={`score-number text-2xl ${
                isLive ? "text-[#00FF41] text-glow" : "text-white"
              }`}
            >
              {match.homeScore} - {match.awayScore}
            </span>
          )}
          <span className="text-[10px] text-[#888888] mt-0.5">{match.time}</span>
        </div>

        {/* Away team */}
        <button
          className="flex flex-col items-center flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onNavigateToTeam(match.awayTeamKey); }}
          title={`查看${match.awayTeam}球队详情`}
        >
          <span className="text-3xl mb-1">{match.awayFlag}</span>
          <span
            className={`text-sm font-bold truncate max-w-full ${
              isUpcoming ? "text-[#888888]" : "text-white"
            }`}
          >
            {match.awayTeam}
          </span>
        </button>
      </div>

      {/* Venue */}
      <div className="mt-3 pt-3 border-t border-[#222222] flex items-center justify-center gap-1 text-[10px] text-[#666666]">
        <span>📍</span>
        <span>{match.venue}</span>
      </div>
    </div>
  );
}
