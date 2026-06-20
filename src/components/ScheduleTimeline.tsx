import { useRef, useEffect, useState, useCallback, Fragment } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { Match } from "../types/match";
import MatchCard from "./MatchCard";

type Props = {
  allMatches: Match[];
  allDates: string[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  onNavigateToTeam: (teamKey: string) => void;
};

export default function ScheduleTimeline({
  allMatches, allDates, selectedDate, onDateChange, onNavigateToTeam,
}: Props) {
  const mainRef = useRef<HTMLDivElement>(null);
  const dateStripRef = useRef<HTMLDivElement>(null);
  const scrollInProgress = useRef(false);
  const [activeIndex, setActiveIndex] = useState(() => {
    const idx = allDates.indexOf(selectedDate);
    return idx >= 0 ? idx : 0;
  });

  // Scroll to center the target date section
  const scrollToDate = useCallback((index: number) => {
    const container = mainRef.current;
    if (container == null) return;
    const sections = container.querySelectorAll<HTMLElement>("[data-section]");
    const target = sections[index];
    if (target == null) return;
    const secCenter = target.offsetLeft + target.clientWidth / 2;
    const targetLeft = secCenter - container.clientWidth / 2;
    const maxScroll = container.scrollWidth - container.clientWidth;
    const clamped = Math.max(0, Math.min(targetLeft, maxScroll));
    scrollInProgress.current = true;
    container.scrollTo({ left: clamped, behavior: "smooth" });
    setTimeout(() => { scrollInProgress.current = false; }, 600);
  }, []);

  // Sync date strip scroll
  const syncDateStrip = useCallback((index: number) => {
    const strip = dateStripRef.current;
    if (strip == null) return;
    const target = strip.children[index] as HTMLElement | undefined;
    if (target == null) return;
    const center = target.offsetLeft - strip.clientWidth / 2 + target.clientWidth / 2;
    strip.scrollTo({ left: center, behavior: "smooth" });
  }, []);

  // Gentle snap: when scrolling naturally stops, pull nearest section to center if close enough
  useEffect(() => {
    const container = mainRef.current;
    if (container == null) return;

    let snapTimer: ReturnType<typeof setTimeout>;
    const THRESHOLD = 0.3; // 30% of section width
    const IDLE_MS = 200;

    const trySnap = () => {
      if (scrollInProgress.current) return;
      const sections = container.querySelectorAll<HTMLElement>("[data-section]");
      if (sections.length === 0) return;

      const viewCenter = container.scrollLeft + container.clientWidth / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      let bestCenter = 0;

      for (let i = 0; i < sections.length; i++) {
        const secCenter = sections[i].offsetLeft + sections[i].clientWidth / 2;
        const dist = Math.abs(secCenter - viewCenter);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; bestCenter = secCenter; }
      }

      const sectionWidth = sections[bestIdx]?.clientWidth || 700;
      if (bestDist > 0 && bestDist < sectionWidth * THRESHOLD) {
        const targetLeft = bestCenter - container.clientWidth / 2;
        const maxScroll = container.scrollWidth - container.clientWidth;
        const clamped = Math.max(0, Math.min(targetLeft, maxScroll));
        container.scrollTo({ left: clamped, behavior: "smooth" });
      }
    };

    const onScroll = () => {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(trySnap, IDLE_MS);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(snapTimer);
      container.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Listen for scroll to update active index and date strip
  useEffect(() => {
    const container = mainRef.current;
    if (container == null) return;

    const handleScroll = () => {
      const container = mainRef.current;
      if (container == null) return;
      const sections = container.querySelectorAll<HTMLElement>("[data-section]");
      const mid = container.scrollLeft + container.clientWidth / 2;
      let best = 0;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].offsetLeft + sections[i].clientWidth / 2 <= mid) best = i;
      }
      if (best !== activeIndex) {
        setActiveIndex(best);
        onDateChange(allDates[best]);
        syncDateStrip(best);
      }
    };

    let timeout: ReturnType<typeof setTimeout>;
    const debounced = () => {
      clearTimeout(timeout);
      timeout = setTimeout(handleScroll, 100);
    };

    container.addEventListener("scroll", debounced, { passive: true });
    return () => {
      clearTimeout(timeout);
      container.removeEventListener("scroll", debounced);
    };
  }, [activeIndex, allDates, onDateChange, syncDateStrip]);

  // Scroll to initial position on mount
  useEffect(() => {
    scrollToDate(activeIndex);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle date strip tap — jump to center
  const handleDateTap = (index: number) => {
    setActiveIndex(index);
    onDateChange(allDates[index]);
    scrollToDate(index);
    syncDateStrip(index);
  };

  // Group matches by date
  const matchesByDate = new Map<string, Match[]>();
  for (const m of allMatches) {
    const arr = matchesByDate.get(m.date) || [];
    arr.push(m);
    matchesByDate.set(m.date, arr);
  }

  return (
    <div className="w-full">
      {/* Date strip indicator */}
      <div
        ref={dateStripRef}
        className="px-4 py-2 flex gap-2 overflow-x-auto hide-scrollbar"
      >
        {allDates.map((date, idx) => {
          const d = new Date(date + "T00:00:00");
          const isToday = date === "2026-06-20";
          const isActive = idx === activeIndex;
          const dayName = format(d, "EEE", { locale: zhCN });
          const md = format(d, "M/dd");

          return (
            <button
              key={date}
              onClick={() => handleDateTap(idx)}
              className={`flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 min-w-[64px] ${
                isActive
                  ? "bg-[#00FF41] text-[#0A0A0A] shadow-[0_0_10px_rgba(0,255,65,0.3)]"
                  : isToday
                  ? "bg-[#1A1A1A] text-[#00FF41] border border-[#00FF41]/30"
                  : "bg-[#111111] text-[#888888] hover:bg-[#1A1A1A]"
              }`}
            >
              <span className={`text-[10px] ${isActive ? "opacity-80" : "opacity-60"}`}>
                {isToday ? "今天" : dayName}
              </span>
              <span className="text-sm leading-tight">{md}</span>
            </button>
          );
        })}
      </div>

      {/* Main continuous timeline — all dates flow as one strip */}
      <div
        ref={mainRef}
        className="flex overflow-x-auto hide-scrollbar px-4 pb-4 items-start"
      >
        {allDates.map((date, idx) => {
          const dayMatches = matchesByDate.get(date) || [];
          const d = new Date(date + "T00:00:00");
          const dateLabel = format(d, "M月dd日 EEE", { locale: zhCN });

          return (
            <Fragment key={date}>
              {/* Vertical divider between dates (not before first) */}
              {idx > 0 && (
                <div className="flex-shrink-0 w-px bg-[#1A1A1A] self-stretch mx-[3.75rem]" />
              )}

              {/* Date section */}
              <div
                data-section="true"
                className="flex-shrink-0 w-[640px]"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold text-[#888888]">{dateLabel}</span>
                  <span className="text-xs text-[#555555]">{dayMatches.length} 场</span>
                </div>

                {dayMatches.length === 0 ? (
                  <div className="py-12 text-center text-[#555555]">
                    <span className="text-2xl">⚽</span>
                    <p className="mt-2 text-xs">当天暂无赛程</p>
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-2">
                    {dayMatches.map((match) => (
                      <MatchCard key={match.id} match={match} onNavigateToTeam={onNavigateToTeam} />
                    ))}
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
