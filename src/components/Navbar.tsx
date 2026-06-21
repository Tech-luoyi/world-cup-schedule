type NavProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
};

const tabs = [
  { key: "schedule", label: "⚽ 赛程" },
  { key: "standings", label: "🏆 积分榜" },
  { key: "teams", label: "👥 球队" },
  { key: "predictions", label: "📊 预测" },
];

export default function Navbar({ activeTab, onTabChange }: NavProps) {
  return (
    <nav className="sticky top-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-sm border-b border-[#1A1A1A]">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚽</span>
          <span className="font-black text-lg tracking-tight">
            WORLD <span className="text-[#00FF41]">CUP</span> 2026
          </span>
        </div>

        {/* Nav tabs */}
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                activeTab === tab.key
                  ? "bg-[#1A1A1A] text-[#00FF41] shadow-[0_0_10px_rgba(0,255,65,0.15)]"
                  : "text-[#888888] hover:text-white hover:bg-[#1A1A1A]/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
