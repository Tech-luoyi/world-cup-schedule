import { useState, useEffect, useMemo } from "react";
import { getAllSquads, getSquadsByContinent, getAllPositions, getFlag, getContinent } from "../services/squad";
import type { TeamSquad, Player } from "../services/squad";

const CONTINENTS = ["亚洲", "非洲", "北美洲", "南美洲", "欧洲", "大洋洲"] as const;

const CONTINENT_ICONS: Record<string, string> = {
  "亚洲": "🌏",
  "非洲": "🌍",
  "北美洲": "🌎",
  "南美洲": "🌎",
  "欧洲": "🌍",
  "大洋洲": "🌏",
};

const POSITION_COLORS: Record<string, string> = {
  "门将": "bg-yellow-500/20 text-yellow-400",
  "左后卫": "bg-blue-500/20 text-blue-400",
  "中后卫": "bg-indigo-500/20 text-indigo-400",
  "右后卫": "bg-blue-600/20 text-blue-300",
  "后腰": "bg-cyan-500/20 text-cyan-400",
  "左中场": "bg-teal-500/20 text-teal-400",
  "右中场": "bg-teal-600/20 text-teal-300",
  "前腰": "bg-purple-500/20 text-purple-400",
  "左边锋": "bg-orange-500/20 text-orange-400",
  "中锋": "bg-red-500/20 text-red-400",
  "右边锋": "bg-pink-500/20 text-pink-400",
};

const POSITION_HIGHLIGHT: Record<string, string> = {
  "门将": "bg-yellow-500 text-yellow-950",
  "左后卫": "bg-blue-500 text-blue-950",
  "中后卫": "bg-indigo-500 text-indigo-950",
  "右后卫": "bg-blue-600 text-blue-950",
  "后腰": "bg-cyan-500 text-cyan-950",
  "左中场": "bg-teal-500 text-teal-950",
  "右中场": "bg-teal-600 text-teal-950",
  "前腰": "bg-purple-500 text-purple-950",
  "左边锋": "bg-orange-500 text-orange-950",
  "中锋": "bg-red-500 text-red-950",
  "右边锋": "bg-pink-500 text-pink-950",
};

type StrongestInfo = { teamKey: string; playerName: string; playerNameEn: string; value: number };
type StrongestMap = Record<string, StrongestInfo>;
function getSquadFlag(squad: TeamSquad): string {
  return squad.flag || getFlag(squad.teamKey);
}

type Props = {
  selectedTeam?: string | null;
};

export default function TeamsPage({ selectedTeam }: Props) {
  const [squads, setSquads] = useState<TeamSquad[] | null>(null);
  const [byContinent, setByContinent] = useState<Record<string, TeamSquad[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeContinent, setActiveContinent] = useState("欧洲");
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  // Load squads from DuckDB
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [all, continents] = await Promise.all([
        getAllSquads(),
        getSquadsByContinent(),
      ]);
      if (cancelled) return;
      setSquads(all);
      setByContinent(continents);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Auto-navigate to selected team
  useEffect(() => {
    if (selectedTeam && squads) {
      const found = squads.find((s) => s.teamKey === selectedTeam);
      if (found) {
        setActiveContinent(getContinent(found.teamKey));
        setExpandedTeam(selectedTeam);
      }
    }
  }, [selectedTeam, squads]);

  const currentSquads = byContinent?.[activeContinent] || [];
  const currentSquad = expandedTeam && squads
    ? squads.find((s) => s.teamKey === expandedTeam) ?? null
    : null;

  // Compute the most valuable player for each detailed position
  const strongestByPos = useMemo<StrongestMap>(() => {
    if (!squads) return {};
    const map: StrongestMap = {};
    for (const pos of getAllPositions()) {
      let best: Player | null = null;
      let bestTeam = '';
      for (const squad of squads) {
        for (const p of squad.players) {
          if ((p.detailedPosition || p.position) === pos && (!best || p.marketValueEuro > best.marketValueEuro)) {
            best = p;
            bestTeam = squad.teamKey;
          }
        }
      }
      if (best) map[pos] = { teamKey: bestTeam, playerName: best.name, playerNameEn: best.nameEn, value: best.marketValueEuro };
    }
    return map;
  }, [squads]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-12">
          <span className="text-4xl">⚽</span>
          <p className="mt-3 text-base text-[#555555]">球队数据加载中...</p>
        </div>
      </div>
    );
  }

  const hasAnyData = squads && squads.length > 0;

  if (!hasAnyData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-12">
          <span className="text-4xl">⚽</span>
          <p className="mt-3 text-base text-[#555555]">球队数据加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Continent navigation */}
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
          {CONTINENTS.map((con) => {
            const cnt = byContinent?.[con]?.length || 0;
            const active = activeContinent === con;
            return (
              <button
                key={con}
                onClick={() => { setActiveContinent(con); setExpandedTeam(null); }}
                className={`flex-shrink-0 px-4 py-3 rounded-xl flex items-center gap-2 transition-all duration-200 border ${
                  active
                    ? `bg-[#00FF41]/10 border-[#00FF41]/50 text-white shadow-[0_0_15px_rgba(0,255,65,0.15)]`
                    : `bg-[#1A1A1A] border-[#222222] text-[#888888] hover:border-[#333333] hover:text-white`
                }`}
              >
                <span className="text-lg">{CONTINENT_ICONS[con] || "🌍"}</span>
                <span className="text-sm font-bold">{con}</span>
                <span className={`text-xs font-mono ${active ? "opacity-60" : "opacity-40"}`}>{cnt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Team list or squad detail */}
      <div className="max-w-4xl mx-auto px-4">
        {currentSquad ? (
          <SquadDetail
            squad={currentSquad}
            strongestByPos={strongestByPos}
            onBack={() => setExpandedTeam(null)}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentSquads.map((squad) => (
              <TeamCard
                key={squad.teamKey}
                squad={squad}
                strongestByPos={strongestByPos}
                onClick={() => setExpandedTeam(squad.teamKey)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** ── Team Card (list view) ── */
function TeamCard({ squad, onClick, strongestByPos }: { squad: TeamSquad; onClick: () => void; strongestByPos: StrongestMap }) {
  const totalValue = squad.players.reduce((sum, p) => sum + p.marketValueEuro, 0);
  const strongestHere = Object.entries(strongestByPos)
    .filter(([, info]) => info.teamKey === squad.teamKey);

  return (
    <button
      onClick={onClick}
      className="bg-[#111111] border border-[#222222] rounded-xl p-4 text-left hover:border-[#00FF41]/30 hover:bg-[#1A1A1A]/60 transition-all duration-200 group"
    >
      <div className="flex items-start gap-4">
        {/* Flag */}
        <span className="text-4xl flex-shrink-0">{getSquadFlag(squad)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-black text-white truncate">
              {squad.teamCn}
            </h3>
            {/* FIFA Rank badge */}
            <span className="text-[11px] font-black bg-[#00FF41] text-[#0A0A0A] px-2 py-0.5 rounded-md leading-none flex-shrink-0">
              FIFA #{squad.fifaRank}
            </span>
            <span className="text-xs text-[#00FF41] bg-[#00FF41]/10 px-1.5 py-0.5 rounded font-bold">
              {squad.fifaCode}
            </span>
          </div>
          <p className="text-xs text-[#666666] mb-2">
            主教练：{squad.coachCn}
          </p>
          {/* Total squad value */}
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs text-[#888888]">全队身价</span>
            <span className="text-sm font-black text-[#00FF41]">
              {formatMarketValue(totalValue)}
            </span>
          </div>
          {/* Strongest position badges */}
          {strongestHere.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {strongestHere.map(([pos]) => (
                <span
                  key={pos}
                  className={`text-[10px] font-black px-1.5 py-0.5 rounded ${POSITION_HIGHLIGHT[pos] || "bg-[#00FF41] text-[#0A0A0A]"}`}
                >
                  最强{pos}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* Arrow */}
        <span className="text-[#444444] group-hover:text-[#00FF41] transition-colors text-lg flex-shrink-0 self-center">
          ▸
        </span>
      </div>
    </button>
  );
}

/** ── Squad Detail View ── */
function SquadDetail({ squad, onBack, strongestByPos }: { squad: TeamSquad; onBack: () => void; strongestByPos: StrongestMap }) {
  const positions = getAllPositions();

  return (
    <div className="space-y-4">
      {/* Back + Team Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={onBack}
          className="text-[#888888] hover:text-white transition-colors text-lg px-1"
        >
          ← 返回
        </button>
      </div>

      <div className="bg-[#111111] border border-[#222222] rounded-2xl overflow-hidden">
        {/* Banner */}
        <div className="bg-[#1A1A1A] px-6 py-5 flex items-center gap-5 border-b border-[#222222]">
          <span className="text-5xl">{getSquadFlag(squad)}</span>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-white">{squad.teamCn}</h2>
              <span className="text-sm font-black bg-[#00FF41] text-[#0A0A0A] px-2.5 py-1 rounded-lg leading-none">
                FIFA #{squad.fifaRank}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-[#00FF41] font-bold">{squad.fifaCode}</span>
              <span className="text-xs text-[#555555]">{getContinent(squad.teamKey)} | {squad.group}组</span>
            </div>
            <p className="text-xs text-[#888888] mt-1">
              主教练：{squad.coachCn} ({squad.coach})
            </p>
          </div>
        </div>

        {/* Players by position */}
        <div className="divide-y divide-[#1A1A1A]">
          {positions.map((pos) => {
            const posPlayers = squad.players
              .filter((p) => p.detailedPosition === pos || (!p.detailedPosition && p.position === pos))
              .sort((a, b) => a.number - b.number);

            if (posPlayers.length === 0) return null;

            return (
              <div key={pos}>
                {/* Position header */}
                <div className={`px-6 py-2 flex items-center gap-2 ${POSITION_COLORS[pos] || "bg-gray-500/20 text-gray-400"} bg-opacity-10`}>
                  <span className="text-xs font-black uppercase tracking-wider">
                    {pos}
                  </span>
                  <span className="text-xs opacity-60">
                    {posPlayers.length}人
                  </span>
                </div>

                {/* Player rows */}
                <div className="divide-y divide-[#1A1A1A]/50">
                  {posPlayers.map((p) => (
                    <PlayerRow key={`${squad.teamKey}-${p.number}`} player={p} strongestByPos={strongestByPos} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** ── Single player row ── */
function PlayerRow({ player, strongestByPos }: { player: Player; strongestByPos: StrongestMap }) {
  const pos = player.detailedPosition || player.position;
  const strongest = strongestByPos[pos];
  const isStrongest = strongest?.playerName === player.name && strongest?.playerNameEn === player.nameEn;

  return (
    <div className={`px-6 py-3 flex items-center gap-4 transition-colors ${isStrongest ? 'bg-[#00FF41]/5 border-l-2 border-[#00FF41]' : 'hover:bg-[#1A1A1A]/40'}`}>
      {/* Jersey number */}
      <span className={`w-8 text-center font-mono text-lg font-black ${isStrongest ? 'text-[#FFD700]' : 'text-[#00FF41]'}`}>
        {player.number}
      </span>

      {/* Name + club */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white truncate">
            {player.name}
          </span>
          <span className="text-[10px] text-[#555555] font-mono">
            {player.nameEn}
          </span>
          {isStrongest && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${POSITION_HIGHLIGHT[pos] || "bg-[#00FF41] text-[#0A0A0A]"}`}>
              最强{pos}
            </span>
          )}
        </div>
        <p className="text-xs text-[#666666] truncate mt-0.5">
          {player.club}
        </p>
      </div>

      {/* Detailed position badge */}
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POSITION_COLORS[pos] || "bg-gray-500/20 text-gray-400"}`}>
        {pos}
      </span>

      {/* Market value */}
      <span className={`w-16 text-right text-xs font-mono font-bold ${isStrongest ? 'text-[#FFD700]' : 'text-[#00FF41]'}`}>
        {formatMarketValue(player.marketValueEuro)}
      </span>

      {/* Age */}
      <span className="w-10 text-right text-xs text-[#888888] font-mono">
        {player.age}岁
      </span>

      {/* Caps / Goals */}
      <div className="hidden sm:flex items-center gap-3 text-xs text-[#555555] font-mono">
        {player.caps !== undefined && (
          <span title="国家队出场">
            <span className="text-[#888888]">{player.caps}</span> 场
          </span>
        )}
        {player.goals !== undefined && (
          <span title="国家队进球">
            <span className="text-[#FFD700]">{player.goals}</span> 球
          </span>
        )}
      </div>
    </div>
  );
}

/** ── Helpers ── */
function formatMarketValue(eur: number): string {
  if (eur >= 100_000_000) {
    const yi = eur / 100_000_000;
    return yi === Math.floor(yi) ? `${yi}亿欧` : `${yi.toFixed(1)}亿欧`;
  }
  if (eur >= 10_000) {
    const wan = eur / 10_000;
    return wan === Math.floor(wan) ? `${wan}万欧` : `${wan.toFixed(1)}万欧`;
  }
  return `${eur}欧`;
}
