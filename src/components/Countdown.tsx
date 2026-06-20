import { useState, useEffect } from "react";
import type { Match } from "../types/match";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

type CountdownProps = {
  nextMatch: Match | null;
};

export default function Countdown({ nextMatch }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  // 使用原始 UTC 时间戳，保证倒计时准确
  const targetTime = nextMatch
    ? new Date(`${nextMatch.utcTimestamp}Z`).getTime()
    : null;

  useEffect(() => {
    if (!targetTime) return;
    const tick = () => {
      const diff = targetTime - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTime]);

  if (!nextMatch) {
    return (
      <section className="w-full py-6 px-4 text-center">
        <div className="text-[#888888] text-sm uppercase tracking-[0.2em] mb-3">
          ⚽ 全部比赛已结束
        </div>
      </section>
    );
  }

  return (
    <section className="w-full py-6 px-4 text-center">
      <div className="inline-flex items-center gap-2 text-[#888888] text-sm uppercase tracking-[0.2em] mb-3">
        <span className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse" />
        下一场 ⚽ {nextMatch.homeFlag} {nextMatch.homeTeam} vs {nextMatch.awayTeam} {nextMatch.awayFlag}
      </div>
      <div className="text-[#666666] text-xs mb-3">
        {nextMatch.date} {nextMatch.time} (北京时间) · {nextMatch.venue}
      </div>
      <div className="flex items-center justify-center gap-3 md:gap-5">
        {[
          { label: "天", value: timeLeft.days },
          { label: "时", value: timeLeft.hours },
          { label: "分", value: timeLeft.minutes },
          { label: "秒", value: timeLeft.seconds },
        ].map((item, idx) => (
          <div key={item.label} className="flex items-center gap-3 md:gap-5">
            <div className="flex flex-col items-center">
              <span className="score-number text-[#00FF41] text-glow text-5xl md:text-7xl leading-none">
                {pad(item.value)}
              </span>
              <span className="text-[#888888] text-xs md:text-sm mt-1 uppercase tracking-widest">
                {item.label}
              </span>
            </div>
            {idx < 3 && (
              <span className="text-[#00FF41] text-3xl md:text-5xl font-bold opacity-40 mb-4">
                :
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
