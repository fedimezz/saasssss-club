"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, User, CreditCard, Check, ArrowRight, ArrowLeft,
  Loader2, Eye, EyeOff, Zap, AlertCircle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface SaasPlan {
  id: string;
  tier: "STARTER" | "PRO" | "BUSINESS";
  name: string;
  priceMonthly: number;
  currency: string;
  limits: Record<string, unknown>;
}

interface FormData {
  // Step 1 — founder account
  name: string;
  email: string;
  password: string;
  phone: string;
  // Step 2 — club info
  clubName: string;
  slug: string;
  // Step 3 — plan
  planId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function limitLabel(key: string, val: unknown): string {
  if (val === null || val === undefined) return "Illimité";
  if (typeof val === "boolean") return val ? "✓" : "✗";
  const labels: Record<string, string> = {
    maxMembers: "membres",
    maxCoaches: "coachs",
    maxAdmins: "admins",
    maxBookingsPerMonth: "réservations/mois",
  };
  return `${val} ${labels[key] ?? key}`;
}

const DISPLAY_LIMIT_KEYS = ["maxMembers", "maxCoaches", "maxAdmins", "maxBookingsPerMonth", "advancedAnalytics", "customDomain"];

const TIER_COLOR: Record<string, string> = {
  STARTER:  "border-blue-500 bg-blue-500/5",
  PRO:      "border-purple-500 bg-purple-500/5",
  BUSINESS: "border-amber-500 bg-amber-500/5",
};
const TIER_BADGE: Record<string, string> = {
  STARTER:  "bg-blue-500/10 text-blue-600",
  PRO:      "bg-purple-500/10 text-purple-600",
  BUSINESS: "bg-amber-500/10 text-amber-600",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
            i < current
              ? "bg-[var(--primary)] text-white"
              : i === current
              ? "border-2 border-[var(--primary)] text-[var(--primary)]"
              : "border-2 border-border text-muted"
          }`}>
            {i < current ? <Check size={14} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`w-8 h-0.5 ${i < current ? "bg-[var(--primary)]" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-500 mt-1">{msg}</p>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{children}</label>;
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-4 py-2.5 bg-card border border-border rounded-xl text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-all text-sm ${props.className ?? ""}`}
    />
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function Step1({ data, onChange, errors }: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  errors: Record<string, string>;
}) {
  const [showPw, setShowPw] = useState(false);
  return (
    <div className="space-y-4">
      <div>
        <Label>Prénom et nom *</Label>
        <Input
          placeholder="Votre nom complet"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <FieldError msg={errors.name} />
      </div>
      <div>
        <Label>Email *</Label>
        <Input
          type="email"
          placeholder="vous@exemple.com"
          value={data.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
        <FieldError msg={errors.email} />
      </div>
      <div>
        <Label>Mot de passe *</Label>
        <div className="relative">
          <Input
            type={showPw ? "text" : "password"}
            placeholder="8 caractères minimum"
            value={data.password}
            onChange={(e) => onChange({ password: e.target.value })}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPw((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <FieldError msg={errors.password} />
      </div>
      <div>
        <Label>Téléphone (optionnel)</Label>
        <Input
          type="tel"
          placeholder="+216 XX XXX XXX"
          value={data.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </div>
    </div>
  );
}

function Step2({ data, onChange, errors }: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  errors: Record<string, string>;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const host = appUrl.replace(/^https?:\/\//, "");

  return (
    <div className="space-y-4">
      <div>
        <Label>Nom du club *</Label>
        <Input
          placeholder="Mon Club Fitness"
          value={data.clubName}
          onChange={(e) => {
            const clubName = e.target.value;
            onChange({ clubName, slug: slugify(clubName) });
          }}
        />
        <FieldError msg={errors.clubName} />
      </div>
      <div>
        <Label>Sous-domaine *</Label>
        <div className="flex items-center gap-0">
          <Input
            placeholder="mon-club"
            value={data.slug}
            onChange={(e) => onChange({ slug: slugify(e.target.value) })}
            className="rounded-r-none"
          />
          <span className="px-3 py-2.5 bg-muted/20 border border-l-0 border-border rounded-r-xl text-sm text-muted whitespace-nowrap">.{host}</span>
        </div>
        <p className="text-xs text-muted mt-1">
          Votre site sera accessible à : <code className="font-mono bg-muted/10 px-1 rounded">{data.slug || "mon-club"}.{host}</code>
        </p>
        <FieldError msg={errors.slug} />
      </div>
    </div>
  );
}

function Step3({ data, onChange, plans, errors }: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  plans: SaasPlan[];
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      {plans.length === 0 && (
        <div className="flex items-center gap-2 text-muted text-sm">
          <Loader2 size={16} className="animate-spin" /> Chargement des plans…
        </div>
      )}
      {plans.map((plan) => {
        const selected = data.planId === plan.id;
        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onChange({ planId: plan.id })}
            className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${
              selected ? TIER_COLOR[plan.tier] : "border-border bg-card hover:border-[var(--primary)]/30"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TIER_BADGE[plan.tier]}`}>
                    {plan.tier}
                  </span>
                  <span className="font-semibold text-primary">{plan.name}</span>
                </div>
                <p className="text-xl font-bold text-primary">
                  {plan.priceMonthly === 0 ? "Gratuit" : `${plan.priceMonthly} ${plan.currency}/mois`}
                </p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                selected ? "border-[var(--primary)] bg-[var(--primary)]" : "border-border"
              }`}>
                {selected && <Check size={11} className="text-white" />}
              </div>
            </div>
            <ul className="space-y-1">
              {DISPLAY_LIMIT_KEYS.map((key) => {
                const val = plan.limits[key];
                if (val === undefined) return null;
                return (
                  <li key={key} className="text-xs text-muted flex items-center gap-2">
                    <span className="text-[var(--primary)]">•</span>
                    {limitLabel(key, val)}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted mt-2 italic">
              Essai gratuit 14 jours — aucune carte bancaire requise.
            </p>
          </button>
        );
      })}
      <FieldError msg={errors.planId} />
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Votre compte",   icon: User },
  { label: "Votre club",     icon: Building2 },
  { label: "Choisir un plan", icon: CreditCard },
];

export default function OnboardingWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({
    name: "", email: "", password: "", phone: "",
    clubName: "", slug: "", planId: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [plans, setPlans] = useState<SaasPlan[]>([]);

  useEffect(() => {
    fetch("/api/saas-plans")
      .then((r) => r.json())
      .then((d) => { if (d.plans) setPlans(d.plans); })
      .catch(() => {});
  }, []);

  const patch = (p: Partial<FormData>) => {
    setForm((f) => ({ ...f, ...p }));
    // Clear the errors for changed fields
    const cleared: Record<string, string> = { ...errors };
    Object.keys(p).forEach((k) => delete cleared[k]);
    setErrors(cleared);
  };

  const validateStep = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!form.name.trim() || form.name.trim().length < 2) e.name = "Nom trop court";
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Email invalide";
      if (form.password.length < 8) e.password = "8 caractères minimum";
    }
    if (step === 1) {
      if (!form.clubName.trim() || form.clubName.trim().length < 2) e.clubName = "Nom du club trop court";
      if (!form.slug || form.slug.length < 3) e.slug = "Slug trop court (3 car. min.)";
      if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = "Lettres minuscules, chiffres et tirets uniquement";
    }
    if (step === 2) {
      if (!form.planId) e.planId = "Choisissez un plan pour continuer";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) { setStep((s) => s + 1); return; }
    // Final step — submit
    submit();
  };

  const submit = async () => {
    setSubmitting(true);
    setGlobalError(null);
    try {
      const res = await fetch("/api/onboarding/create-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.field) {
          setErrors({ [json.field]: json.error });
          // Go back to relevant step
          if (json.field === "email") setStep(0);
          if (json.field === "slug") setStep(1);
        } else {
          setGlobalError(json.error || "Erreur lors de la création du club.");
        }
        return;
      }
      // Success — JWT cookie is set, redirect to admin
      router.push("/admin");
    } catch {
      setGlobalError("Erreur réseau. Vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
    }
  };

  const StepIcon = STEPS[step].icon;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Zap size={28} className="text-[var(--primary)]" />
            <span className="text-xl font-bold text-primary">Le Club de Gammarth</span>
          </div>
          <h1 className="text-2xl font-bold text-primary mb-1">Créez votre gym en ligne</h1>
          <p className="text-muted text-sm">14 jours d&apos;essai gratuit · Aucune carte bancaire</p>
        </div>

        {/* Step indicator */}
        <div className="flex justify-center mb-8">
          <StepIndicator current={step} total={STEPS.length} />
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          {/* Step header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
              <StepIcon size={20} className="text-[var(--primary)]" />
            </div>
            <div>
              <p className="text-xs text-muted">Étape {step + 1} sur {STEPS.length}</p>
              <h2 className="font-semibold text-primary">{STEPS[step].label}</h2>
            </div>
          </div>

          {/* Global error */}
          {globalError && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 text-red-600 rounded-xl mb-4 text-sm">
              <AlertCircle size={16} /> {globalError}
            </div>
          )}

          {/* Step content */}
          {step === 0 && <Step1 data={form} onChange={patch} errors={errors} />}
          {step === 1 && <Step2 data={form} onChange={patch} errors={errors} />}
          {step === 2 && <Step3 data={form} onChange={patch} plans={plans} errors={errors} />}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-5 border-t border-border">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted hover:text-primary border border-border rounded-xl hover:border-[var(--primary)]/40 transition-all"
              >
                <ArrowLeft size={15} /> Retour
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={next}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--primary-dark)] disabled:opacity-60 transition-all"
            >
              {submitting ? (
                <><Loader2 size={15} className="animate-spin" /> Création…</>
              ) : step < STEPS.length - 1 ? (
                <>Suivant <ArrowRight size={15} /></>
              ) : (
                <>Créer mon gym <Check size={15} /></>
              )}
            </button>
          </div>
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-muted mt-4">
          Vous avez déjà un compte ?{" "}
          <a href="/user/login" className="text-[var(--primary)] hover:underline font-medium">
            Se connecter
          </a>
        </p>
      </div>
    </div>
  );
}
