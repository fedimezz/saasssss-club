"use client";

import { useEffect, useState } from "react";
import { Loader2, Users2 } from "lucide-react";

interface Plan {
  id: string;
  tier: string;
  name: string;
  priceMonthly: number;
  currency: string;
  limits: Record<string, unknown>;
  isActive: boolean;
  subscriberCount: number;
}

function formatLimit(v: unknown) {
  if (v === null || v === undefined) return "Illimité";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  return String(v);
}

export default function PlatformPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/platform/plans");
      if (res.ok) setPlans((await res.json()).plans);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {plans.map((plan) => (
        <div key={plan.id} className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500">{plan.tier}</span>
            {!plan.isActive && (
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-500">Inactif</span>
            )}
          </div>
          <h3 className="mt-1 text-lg font-black text-primary">{plan.name}</h3>
          <p className="mt-2 text-2xl font-black text-primary">
            {plan.priceMonthly} {plan.currency}
            <span className="text-xs font-semibold text-muted"> /mois</span>
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs font-bold text-primary">
            <Users2 className="h-4 w-4 text-emerald-500" />
            {plan.subscriberCount} club{plan.subscriberCount !== 1 ? "s" : ""} abonné{plan.subscriberCount !== 1 ? "s" : ""}
          </div>

          <ul className="mt-4 space-y-1.5 border-t border-border pt-4 text-xs text-secondary">
            {Object.entries(plan.limits).map(([key, val]) => (
              <li key={key} className="flex items-center justify-between">
                <span className="text-muted">{key}</span>
                <span className="font-bold text-primary">{formatLimit(val)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
