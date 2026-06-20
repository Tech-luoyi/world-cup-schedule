export default function Footer() {
  return (
    <footer className="border-t border-[#1A1A1A] bg-[#0A0A0A]">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4 text-xs text-[#555555]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41] animate-pulse" />
          <span>数据更新于 {new Date().toLocaleString("zh-CN")}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[#444444]">作者:luoyi</span>
          <div className="flex items-center gap-1">
            <span>⚡</span>
            <span>
              实时数据由
              <span className="text-[#00FF41] font-semibold"> FIFA </span>
              驱动
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
