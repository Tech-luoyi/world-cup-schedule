import { useState, useMemo } from "react";
import type { Match } from "../types/match";
import { computeGroupStandings, getKnockoutRounds } from "../services/standings";
import GroupTable from "./GroupTable";
import GroupSummary from "./GroupSummary";
import ThirdPlaceRanking from "./ThirdPlaceRanking";
import KnockoutBracket from "./KnockoutBracket";

type Props = {
  matches: Match[];
  onNavigateToTeam: (teamKey: string) => void;
};

const GROUPS = "ABCDEFGHIJKL".split("");

export default function StandingsPage({ matches, onNavigateToTeam }: Props) {
  const [view, setView] = useState<"groups" | "knockout">("groups");
  const [activeGroup, setActiveGroup] = useState("A");

  const groupTables = useMemo(() => computeGroupStandings(matches), [matches]);
  const knockoutRounds = useMemo(() => getKnockoutRounds(matches), [matches]);

  const currentTable = groupTables.find((t) => t.group === activeGroup);

  const groupComplete =
    matches.filter((m) => m.stage === "Group stage" && m.status === "finished").length;
  const groupTotal = matches.filter((m) => m.stage === "Group stage").length;

  const isSummary = activeGroup === "summary";
  const isThird = activeGroup === "third";

  return (
    <div className="pb-8">
      {/* Top nav: 小组赛 | 淘汰赛 */}
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-2 flex gap-3">
        <button
          onClick={() => setView("groups")}
          className={`px-6 py-2.5 text-base font-black rounded-lg transition-all duration-200 ${
            view === "groups"
              ? "bg-[#00FF41] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,65,0.4)]"
              : "bg-[#111111] text-[#888888] hover:text-white hover:bg-[#1A1A1A]"
          }`}
        >
          小组赛
        </button>
        <button
          onClick={() => setView("knockout")}
          className={`px-6 py-2.5 text-base font-black rounded-lg transition-all duration-200 ${
            view === "knockout"
              ? "bg-[#00FF41] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,65,0.4)]"
              : "bg-[#111111] text-[#888888] hover:text-white hover:bg-[#1A1A1A]"
          }`}
        >
          淘汰赛
        </button>
      </div>

      {/* Group stage view */}
      {view === "groups" && (
        <>
          {/* Group nav tabs + 汇总 / 第3名 */}
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
              {GROUPS.map((g) => {
                const t = groupTables.find((x) => x.group === g);
                const hasData = t?.records.some((r) => r.mp > 0);
                return (
                  <button
                    key={g}
                    onClick={() => setActiveGroup(g)}
                    className={`flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center transition-all duration-200 ${
                      activeGroup === g
                        ? "bg-[#00FF41] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,65,0.5)] scale-105"
                        : hasData
                        ? "bg-[#1A1A1A] text-white hover:bg-[#222222]"
                        : "bg-[#111111] text-[#444444]"
                    }`}
                  >
                    <span className="text-lg font-black leading-none">{g}</span>
                    <span className="text-[9px] leading-none mt-0.5 opacity-70">组</span>
                  </button>
                );
              })}
              {/* Separator */}
              <div className="w-px bg-[#333333] mx-1 flex-shrink-0" />
              {/* 汇总 tab */}
              <button
                onClick={() => setActiveGroup("summary")}
                className={`flex-shrink-0 px-5 h-14 rounded-xl flex items-center justify-center transition-all duration-200 ${
                  isSummary
                    ? "bg-[#00FF41] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,65,0.5)] scale-105"
                    : "bg-[#1A1A1A] text-white hover:bg-[#222222]"
                }`}
              >
                <span className="text-sm font-black leading-none">全部球队</span>
              </button>
              {/* 第3名 tab */}
              <button
                onClick={() => setActiveGroup("third")}
                className={`flex-shrink-0 px-5 h-14 rounded-xl flex items-center justify-center transition-all duration-200 ${
                  isThird
                    ? "bg-[#FFAA00] text-[#0A0A0A] shadow-[0_0_20px_rgba(255,170,0,0.5)] scale-105"
                    : "bg-[#1A1A1A] text-white hover:bg-[#222222]"
                }`}
              >
                <span className="text-sm font-black leading-none">第3名</span>
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="max-w-3xl mx-auto px-4 mb-4 flex items-center gap-3 text-xs text-[#666666]">
            <span>
              已完成 <span className="text-[#00FF41] font-bold">{groupComplete}</span>/{groupTotal} 场
            </span>
            <span className="text-[#444444]">|</span>
            <span>前2名直接晋级 · 8个最佳第3名进入淘汰赛</span>
          </div>

          {/* Content area */}
          {isSummary && <GroupSummary groupTables={groupTables} onNavigateToTeam={onNavigateToTeam} />}
          {isThird && <ThirdPlaceRanking groupTables={groupTables} onNavigateToTeam={onNavigateToTeam} />}
          {!isSummary && !isThird && currentTable && (
            <div className="max-w-3xl mx-auto px-4">
              <GroupTable table={currentTable} onNavigateToTeam={onNavigateToTeam} />
            </div>
          )}
        </>
      )}

      {/* Knockout view */}
      {view === "knockout" && (
        <KnockoutBracket rounds={knockoutRounds} />
      )}
    </div>
  );
}
