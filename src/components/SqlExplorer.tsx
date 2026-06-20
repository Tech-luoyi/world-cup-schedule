import { useState } from "react";
import { isDuckDBReady } from "../services/duckdb";

export default function SqlExplorer() {
  const [open, setOpen] = useState(false);
  const [sql, setSql] = useState("SELECT * FROM teams LIMIT 5");
  const [result, setResult] = useState<any[] | null>(null);
  const [cols, setCols] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const ready = isDuckDBReady();

  const run = async () => {
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const win = window as any;
      if (!win.__duckdb) throw new Error("DuckDB 尚未就绪，请稍等");
      const rows = await win.__duckdb.query(sql);
      if (rows.length > 0) setCols(Object.keys(rows[0]));
      else setCols(null);
      setResult(rows.slice(0, 200)); // limit display to 200 rows
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-[#FFD700] text-black font-black text-sm flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
        title="DuckDB SQL Explorer"
      >
        🐤
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[420px] max-h-[70vh] bg-[#0A0A0A] border border-[#333] rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1A1A1A] border-b border-[#333]">
        <div className="flex items-center gap-2">
          <span className="text-lg">🐤</span>
          <span className="text-xs font-bold text-[#FFD700] uppercase tracking-wider">
            DuckDB Explorer
          </span>
          <span className={`w-2 h-2 rounded-full ${ready ? "bg-[#00FF41]" : "bg-[#FF0055]"} animate-pulse`} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setOpen(false); setResult(null); setError(null); }}
            className="text-[#666] hover:text-white text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      {/* SQL input */}
      <div className="p-3 border-b border-[#222]">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
          }}
          rows={3}
          className="w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-xs text-[#0f0] font-mono outline-none focus:border-[#FFD700] resize-none"
          spellCheck={false}
        />
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-2">
            <button
              onClick={() => setSql("SELECT * FROM teams")}
              className="text-[10px] px-2 py-0.5 rounded bg-[#1A1A1A] text-[#888] hover:text-white"
            >
              teams
            </button>
            <button
              onClick={() => setSql("SELECT * FROM players LIMIT 10")}
              className="text-[10px] px-2 py-0.5 rounded bg-[#1A1A1A] text-[#888] hover:text-white"
            >
              players
            </button>
            <button
              onClick={() => setSql("SELECT * FROM venues")}
              className="text-[10px] px-2 py-0.5 rounded bg-[#1A1A1A] text-[#888] hover:text-white"
            >
              venues
            </button>
            <button
              onClick={() => setSql("SELECT position, COUNT(*) as cnt FROM players GROUP BY position ORDER BY cnt DESC")}
              className="text-[10px] px-2 py-0.5 rounded bg-[#1A1A1A] text-[#888] hover:text-white"
            >
              count by pos
            </button>
            <button
              onClick={() => setSql("SELECT name, name_en, detailed_position, market_value_euro FROM players ORDER BY market_value_euro DESC LIMIT 20")}
              className="text-[10px] px-2 py-0.5 rounded bg-[#1A1A1A] text-[#888] hover:text-white"
            >
              top value
            </button>
            <button
              onClick={() => setSql("SELECT detailed_position, COUNT(*) as cnt, ROUND(AVG(market_value_euro)/1000000,1) as avg_m_eur FROM players GROUP BY detailed_position ORDER BY cnt DESC")}
              className="text-[10px] px-2 py-0.5 rounded bg-[#1A1A1A] text-[#888] hover:text-white"
            >
              pos + value
            </button>
          </div>
          <button
            onClick={run}
            disabled={!ready || running}
            className="text-[10px] font-bold px-3 py-1 rounded bg-[#FFD700] text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-yellow-300 transition-colors"
          >
            {running ? "执行中..." : ready ? "执行 (⌘↵)" : "等待DuckDB..."}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="bg-[#FF0055]/10 border border-[#FF0055]/30 rounded-lg px-3 py-2 text-xs text-[#FF0055] font-mono">
            {error}
          </div>
        )}

        {result && result.length === 0 && (
          <div className="text-xs text-[#666] text-center py-4">查询返回 0 行</div>
        )}

        {result && result.length > 0 && cols && (
          <div>
            <div className="text-[10px] text-[#888] mb-1">
              {result.length} 行
              {result.length >= 200 ? " (最多显示200行)" : ""}
            </div>
            <div className="overflow-auto">
              <table className="w-full text-[10px] font-mono border-collapse">
                <thead>
                  <tr className="border-b border-[#333]">
                    {cols.map((c) => (
                      <th key={c} className="text-left px-2 py-1 text-[#FFD700] whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.map((row, i) => (
                    <tr key={i} className="border-b border-[#1A1A1A] hover:bg-[#1A1A1A]/50">
                      {cols!.map((c) => (
                        <td key={c} className="px-2 py-0.5 text-[#ccc] whitespace-nowrap max-w-[150px] truncate">
                          {row[c] === null ? <span className="text-[#555]">NULL</span> : String(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
