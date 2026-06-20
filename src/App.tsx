import { useState, useMemo, useEffect, useCallback } from "react";
import Navbar from "./components/Navbar";
import Countdown from "./components/Countdown";
import ScheduleTimeline from "./components/ScheduleTimeline";
import StandingsPage from "./components/StandingsPage";
import TeamsPage from "./components/TeamsPage";
import Footer from "./components/Footer";
import { fetchMatches } from "./services/api";
import { initDuckDB } from "./services/duckdb";
import type { Match } from "./types/match";

function App() {
  const [activeTab, setActiveTab] = useState("schedule");
  const [selectedDate, setSelectedDate] = useState("2026-06-20");
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  // ── DuckDB init (separate effect, fire-and-forget) ──
  useEffect(() => {
    console.log('[App] 🔌 Starting DuckDB init...');
    initDuckDB().then(() => {
      console.log('[App] ✅ DuckDB ready');
    }).catch((e) => {
      console.error('[App] ❌ DuckDB init failed:', e);
    });
  }, []);

  // ── Fetch match data ──
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const { matches, error: err } = await fetchMatches();
        if (cancelled) return;

        if (err) {
          setError(err);
        } else {
          setAllMatches(matches);
          const today = new Date().toISOString().slice(0, 10);
          const exists = matches.some((m) => m.date === today);
          if (exists) setSelectedDate(today);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Schedule data ──
  const allDates = useMemo(() => {
    const dateSet = new Set(allMatches.map((m) => m.date));
    return Array.from(dateSet).sort();
  }, [allMatches]);

  const filteredMatches = useMemo(() => {
    return allMatches.filter((m) => m.date === selectedDate);
  }, [allMatches, selectedDate]);

  const nextMatch = useMemo(() => {
    const upcoming = allMatches.filter((m) => m.status === "upcoming");
    if (upcoming.length === 0) return null;
    return upcoming.reduce((earliest, curr) => {
      const de = new Date(`${earliest.utcTimestamp}Z`).getTime();
      const dc = new Date(`${curr.utcTimestamp}Z`).getTime();
      return dc < de ? curr : earliest;
    });
  }, [allMatches]);

  const liveCount = allMatches.filter((m) => m.status === "live").length;
  const totalCount = allMatches.length;

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (tab !== "teams") setSelectedTeam(null);
  }, []);

  const handleNavigateToTeam = useCallback((teamKey: string) => {
    setSelectedTeam(teamKey);
    setActiveTab("teams");
  }, []);
  const handleDateSelect = useCallback((date: string) => setSelectedDate(date), []);

  // ── Loading / Error states ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A]">
        <Navbar activeTab={activeTab} onTabChange={handleTabChange} />
        <main className="flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-2 border-[#00FF41]/30 border-t-[#00FF41] rounded-full animate-spin" />
            <p className="mt-3 text-sm text-[#888888]">正在获取赛程数据...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0A0A0A]">
        <Navbar activeTab={activeTab} onTabChange={handleTabChange} />
        <main className="flex items-center justify-center">
          <div className="text-center">
            <span className="text-4xl">⚠️</span>
            <p className="mt-2 text-sm text-[#FF0055]">数据加载失败</p>
            <p className="text-xs text-[#888888] mt-1">{error}</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <Navbar activeTab={activeTab} onTabChange={handleTabChange} />

      <main>
        {/* Tab: 赛程 */}
        {activeTab === "schedule" && (
          <>
            <Countdown nextMatch={nextMatch} />
            <div className="max-w-4xl mx-auto px-4 mb-2 flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-[#888888]">
                <span className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse" />
                <span>{liveCount} 场进行中</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#888888]">
                <span>📅</span>
                <span>{filteredMatches.length} 场比赛</span>
              </div>
              {totalCount > 0 && (
                <div className="flex items-center gap-1.5 text-[#666666]">
                  <span>🏟️</span>
                  <span>共 {totalCount} 场</span>
                </div>
              )}
            </div>
            <ScheduleTimeline
              allMatches={allMatches}
              allDates={allDates}
              selectedDate={selectedDate}
              onDateChange={handleDateSelect}
              onNavigateToTeam={handleNavigateToTeam}
            />
          </>
        )}

        {/* Tab: 积分榜 */}
        {activeTab === "standings" && <StandingsPage matches={allMatches} onNavigateToTeam={handleNavigateToTeam} />}

        {/* Tab: 球队 */}
        {activeTab === "teams" && <TeamsPage selectedTeam={selectedTeam} />}
      </main>

      <Footer />
    </div>
  );
}

export default App;
