// lib/env.ts — fail fast on a missing/malformed required env var, once, at
// boot, instead of letting each route discover it lazily (a 500 the first
// time a customer hits checkout, three weeks after a bad deploy).
//
// Two tiers:
//   REQUIRED  — the app cannot run correctly without these. Missing one
//               throws at startup (instrumentation.ts) and fails the deploy
//               health check instead of silently degrading in production.
//   RECOMMENDED — features that fail soft today (SMS/email log to console,
//               Cloudinary uploads 501, Konnect 501) when unset. Logged as a
//               warning so it's visible without being fatal — plenty of
//               environments (a demo, most CI) legitimately run without them.

interface Check {
  name: string;
  required: boolean;
  validate?: (value: string) => string | null; // returns an error message, or null if OK
}

const CHECKS: Check[] = [
  { name: "DATABASE_URL", required: true },
  {
    name: "JWT_SECRET", required: true,
    validate: (v) => (v.length < 32 ? "must be at least 32 characters" : null),
  },
  {
    name: "APP_URL", required: true,
    validate: (v) => {
      try {
        new URL(v);
        return null;
      } catch {
        return "must be a valid absolute URL (e.g. https://yourapp.com)";
      }
    },
  },
  { name: "COOKIE_DOMAIN", required: false },
  { name: "CRON_SECRET", required: false },
  { name: "BREVO_API_KEY", required: false },
  { name: "TWILIO_ACCOUNT_SID", required: false },
  { name: "CLOUDINARY_URL", required: false },
  { name: "KONNECT_API_KEY", required: false },
  { name: "GOOGLE_CLIENT_ID", required: false },
  { name: "UPSTASH_REDIS_REST_URL", required: false },
];

export function validateEnv(): void {
  const missing: string[] = [];
  const invalid: string[] = [];
  const recommended: string[] = [];

  for (const check of CHECKS) {
    const value = process.env[check.name];
    if (!value) {
      if (check.required) missing.push(check.name);
      else recommended.push(check.name);
      continue;
    }
    const err = check.validate?.(value);
    if (err) invalid.push(`${check.name} (${err})`);
  }

  if (recommended.length > 0) {
    console.warn(
      `[env] Not configured, related features will run in a degraded/dev mode: ${recommended.join(", ")}`
    );
  }

  if (missing.length > 0 || invalid.length > 0) {
    const lines = [
      missing.length > 0 ? `Missing: ${missing.join(", ")}` : null,
      invalid.length > 0 ? `Invalid: ${invalid.join(", ")}` : null,
    ].filter(Boolean);
    throw new Error(`[env] Required environment variables are not set correctly.\n${lines.join("\n")}`);
  }
}
