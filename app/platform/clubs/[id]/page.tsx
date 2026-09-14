"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldOff, ShieldCheck, Tag, Mail, Calendar, Users2, ExternalLink, LogIn, UserPlus, Pencil, Trash2, Ban, Save, X } from "lucide-react";

interface ClubDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  trialEndsAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  subscription: { status: string; plan: { id: string; tier: string; name: string; priceMonthly: number } } | null;
  settings: { name: string; logoUrl: string | null } | null;
  customDomain: string | null;
  _count: { users: number; sessions: number; payments: number };
  users: { id: string; name: string; email: string; createdAt: string }[];
}

interface Plan {
  id: string;
  tier: string;
  name: string;
  priceMonthly: number;
}

const STATUS_STYLE: Record<string, string> = {
  TRIAL: "bg-sky-500/10 text-sky-500",
  ACTIVE: "bg-emerald-500/10 text-emerald-500",
  SUSPENDED: "bg-rose-500/10 text-rose-500",
  CANCELLED: "bg-slate-500/10 text-slate-500",
};

export default function PlatformClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", slug: "", customDomain: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [clubRes, plansRes] = await Promise.all([
        fetch(`/api/platform/clubs/${id}`),
        fetch(`/api/platform/plans`),
      ]);
      if (clubRes.ok) {
        const nextClub = (await clubRes.json()).club;
        setClub(nextClub);
        setEditForm({ name: nextClub.name, slug: nextClub.slug, customDomain: nextClub.customDomain ?? "" });
      }
      if (plansRes.ok) setPlans((await plansRes.json()).plans);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (action: "freeze" | "unfreeze" | "ban" | "change_plan", planId?: string) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/clubs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, planId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erreur");
        return;
      }
      setShowPlanPicker(false);
      await load();
    } finally {
      setActionLoading(false);
    }
  };

  const saveClub = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/clubs/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editForm, customDomain: editForm.customDomain || null }) });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erreur"); return; }
      setEditing(false);
      await load();
    } finally { setActionLoading(false); }
  };

  const deleteClub = async () => {
    if (!window.confirm(`Supprimer définitivement ${club?.name} et toutes ses données ?`)) return;
    setActionLoading(true);
    const res = await fetch(`/api/platform/clubs/${id}`, { method: "DELETE" });
    if (res.ok) { window.location.href = "/platform/clubs"; return; }
    const json = await res.json();
    setError(json.error ?? "Impossible de supprimer le club");
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!club) {
    return <p className="text-sm text-rose-500">Club introuvable.</p>;
  }

  const owner = club.users[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
  const clubUrl = `${appUrl.replace("://", `://${club.slug}.`)}`;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/platform/clubs" className="flex items-center gap-1.5 text-xs font-bold text-secondary hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Retour aux clubs
      </Link>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {editing ? (
              <div className="space-y-2">
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-primary" />
                <input value={editForm.slug} onChange={(e) => setEditForm({ ...editForm, slug: e.target.value.toLowerCase() })} className="block rounded-lg border border-border bg-background px-3 py-2 text-xs text-primary" />
                <input value={editForm.customDomain} onChange={(e) => setEditForm({ ...editForm, customDomain: e.target.value })} placeholder="domaine personnalisé (optionnel)" className="block rounded-lg border border-border bg-background px-3 py-2 text-xs text-primary" />
              </div>
            ) : <><h1 className="text-xl font-black text-primary">{club.name}</h1><p className="text-xs text-muted">{club.slug}</p></>}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[club.status] ?? ""}`}>
            {club.status}
          </span>
        </div>

        {club.suspendedReason && (
          <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500">
            Motif de suspension : {club.suspendedReason}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500">{error}</p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Membres</p>
            <p className="mt-1 text-sm font-black text-primary">{club._count.users}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Sessions</p>
            <p className="mt-1 text-sm font-black text-primary">{club._count.sessions}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Paiements</p>
            <p className="mt-1 text-sm font-black text-primary">{club._count.payments}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Plan</p>
            <p className="mt-1 text-sm font-black text-primary">{club.subscription?.plan.name ?? "—"}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 rounded-xl border border-border bg-background p-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Propriétaire</p>
            <p className="mt-1 text-sm font-bold text-primary">{owner?.name ?? "—"}</p>
            <p className="text-xs text-muted">{owner?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Accès du club</p>
            <a href={clubUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> {clubUrl}
            </a>
            <div className="mt-2 flex gap-3 text-xs">
              <a href={`${clubUrl}/user/login`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-secondary hover:text-primary"><LogIn className="h-3 w-3" /> Connexion membre</a>
              <a href={`${clubUrl}/user/register`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-secondary hover:text-primary"><UserPlus className="h-3 w-3" /> Inscription</a>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {editing ? (
            <><button disabled={actionLoading} onClick={saveClub} className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950 disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Enregistrer</button><button disabled={actionLoading} onClick={() => setEditing(false)} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-secondary"><X className="h-3.5 w-3.5" /> Annuler</button></>
          ) : <button disabled={actionLoading} onClick={() => setEditing(true)} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-primary"><Pencil className="h-3.5 w-3.5 text-emerald-500" /> Modifier</button>}
          {club.status === "SUSPENDED" ? (
            <button
              disabled={actionLoading}
              onClick={() => runAction("unfreeze")}
              className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950 disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Réactiver le club
            </button>
          ) : (
            <button
              disabled={actionLoading}
              onClick={() => runAction("freeze")}
              className="flex items-center gap-2 rounded-full border border-rose-500/40 px-4 py-2 text-xs font-extrabold text-rose-500 disabled:opacity-50"
            >
              <ShieldOff className="h-3.5 w-3.5" /> Suspendre le club
            </button>
          )}
          <button
            disabled={actionLoading}
            onClick={() => setShowPlanPicker((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-primary disabled:opacity-50"
          >
            <Tag className="h-3.5 w-3.5 text-emerald-500" /> Changer de plan
          </button>
          {club.status !== "CANCELLED" && <button disabled={actionLoading} onClick={() => runAction("ban")} className="flex items-center gap-2 rounded-full border border-rose-500/40 px-4 py-2 text-xs font-extrabold text-rose-500 disabled:opacity-50"><Ban className="h-3.5 w-3.5" /> Bannir</button>}
          <button disabled={actionLoading} onClick={deleteClub} className="flex items-center gap-2 rounded-full border border-rose-500/40 px-4 py-2 text-xs font-extrabold text-rose-500 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>

        {showPlanPicker && (
          <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-border bg-muted/50 p-3">
            {plans.map((plan) => (
              <button
                key={plan.id}
                disabled={actionLoading || plan.id === club.subscription?.plan.id}
                onClick={() => runAction("change_plan", plan.id)}
                className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition disabled:opacity-40 ${
                  plan.id === club.subscription?.plan.id
                    ? "bg-emerald-500 text-slate-950"
                    : "border border-border bg-card text-secondary hover:border-emerald-500/40"
                }`}
              >
                {plan.name} — {plan.priceMonthly}$/mois
              </button>
            ))}
          </div>
        )}
      </div>

      {owner && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-4 text-sm font-extrabold text-primary">Propriétaire</h3>
          <div className="space-y-2 text-xs text-secondary">
            <p className="flex items-center gap-2"><Users2 className="h-3.5 w-3.5 text-emerald-500" /> {owner.name}</p>
            <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-emerald-500" /> {owner.email}</p>
            <p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-emerald-500" /> Inscrit le {new Date(owner.createdAt).toLocaleDateString("fr-FR")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
