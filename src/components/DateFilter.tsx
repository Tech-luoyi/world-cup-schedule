import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

type DateFilterProps = {
  dates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
};

export default function DateFilter({ dates, selectedDate, onSelect }: DateFilterProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-3">
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
        {dates.map((date) => {
          const d = new Date(date + "T00:00:00");
          const isToday = date === new Date().toISOString().slice(0, 10);
          const isSelected = date === selectedDate;
          const dayName = format(d, "EEE", { locale: zhCN });
          const md = format(d, "M/dd");

          return (
            <button
              key={date}
              onClick={() => onSelect(date)}
              className={`flex-shrink-0 flex flex-col items-center px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 min-w-[72px] ${
                isToday && !isSelected
                  ? "bg-[#1A1A1A] text-[#00FF41] border border-[#00FF41]/30"
                  : isSelected
                  ? "bg-[#00FF41] text-[#0A0A0A] shadow-[0_0_15px_rgba(0,255,65,0.4)]"
                  : "bg-[#111111] text-[#888888] hover:bg-[#1A1A1A] hover:text-white"
              }`}
            >
              <span className={`text-[10px] mb-0.5 ${isSelected ? "opacity-80" : "opacity-50"}`}>
                {isToday ? "TODAY" : dayName}
              </span>
              <span className={`text-sm ${isSelected ? "text-[#0A0A0A]" : ""}`}>
                {md}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
