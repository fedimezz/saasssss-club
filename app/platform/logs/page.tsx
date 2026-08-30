"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface LogEntry {
  id: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  targetName: string | null;
  createdAt: string;
  club: { name: string; slug: string } | null;
}

const CATEGORIES = ["", "AUTH", "SUBSCRIPTION", "SYSTEM", "MEMBER", "PAYMENT", "SETTINGS"];

export default function PlatformLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (category) params.set("category", category);
      const res = await fetch(`/api/platform/logs?${params}`);
      if (res.ok) {
        const json = await res.json();
        setLogs(json.logs);
        setTotalPages(json.pagination.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [page, category]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c || "all"}
            onClick={() => { setPage(1); setCategory(c); }}
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition ${
              category === c ? "bg-emerald-500 text-slate-950" : "border border-border bg-card text-secondary"
            }`}
          >
            {c || "Toutes"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
          </div>
        ) : logs.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs text-muted">Aucune entrée trouvée.</p>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between px-4 py-3 text-xs">
                <div>
                  <p className="font-bold text-primary">{log.action}</p>
                  <p className="text-[10px] text-muted">
                    {log.actorName ?? "Système"} {log.club ? `· ${log.club.name}` : ""} {log.targetName ? `· ${log.targetName}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-secondary">{log.category}</span>
                  <p className="mt-1 text-[10px] text-muted">{new Date(log.createdAt).toLocaleString("fr-FR")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-full border border-border bg-card p-2 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-semibold text-secondary">Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-border bg-card p-2 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
