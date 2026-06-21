import type { Match } from "../types/match";
import MatchCard from "./MatchCard";

type MatchListProps = {
  matches: Match[];
  onNavigateToTeam: (teamKey: string) => void;
  onNavigateToPrediction?: (homeKey: string, awayKey: string) => void;
};

export default function MatchList({ matches, onNavigateToTeam, onNavigateToPrediction }: MatchListProps) {
  if (matches.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[#888888]">
        <span className="text-4xl">⚽</span>
        <p className="mt-2 text-sm">当天暂无赛程</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} onNavigateToTeam={onNavigateToTeam} onNavigateToPrediction={onNavigateToPrediction} />
        ))}
      </div>
    </div>
  );
}
