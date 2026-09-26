// src/lib/sms.ts
//
// Minimal SMS sender via Twilio's REST API (plain fetch, no SDK dependency
// needed). Mirrors lib/email.ts: if Twilio isn't configured (e.g. local
// dev), it logs the message to the server console instead of throwing, so
// nothing that calls this breaks when SMS isn't set up yet.
//
// Required env vars (Twilio Console → Account):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER   — an SMS-capable Twilio number, E.164 format (+216...)
//
// Swap the provider by rewriting the body of sendSms() — the call sites
// (sendSms({ to, body })) won't need to change.

import { fetchWithTimeout } from "@/lib/http";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || "";

export const isSmsConfigured = Boolean(
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER
);

// Destination allow-list (SMS pumping / toll fraud): an attacker who can make
// the app text arbitrary numbers can make it text premium-rate numbers in
// other countries. Only these country calling codes are ever sent to.
// Override with SMS_ALLOWED_COUNTRY_CODES="+216,+33" for a wider market.
function allowedCountryCodes(): string[] {
  return (process.env.SMS_ALLOWED_COUNTRY_CODES || "+216")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Normalises a user-typed phone number to E.164, or null if it can't be.
 * Accepts "+216 20 123 456", "00216 20123456" and bare 8-digit Tunisian
 * numbers ("20 123 456" → "+21620123456").
 */
export function toE164(raw: string): string | null {
  let n = raw.replace(/[\s\-().]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (/^\d{8}$/.test(n)) n = `+216${n}`;
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}

export function isSmsDestinationAllowed(e164: string): boolean {
  return allowedCountryCodes().some((cc) => e164.startsWith(cc));
}

interface SendSmsInput {
  to: string; // any user-typed format; normalised + allow-listed below
  body: string;
}

export async function sendSms({ to, body }: SendSmsInput): Promise<void> {
  const destination = toE164(to);
  if (!destination || !isSmsDestinationAllowed(destination)) {
    // Deliberately not logging the number.
    throw new Error("SMS destination rejected (invalid or not in allowed countries)");
  }

  if (!isSmsConfigured) {
    // Dev convenience only. In production the message (which can be a login
    // OTP) and the phone number must NEVER reach the logs.
    if (process.env.NODE_ENV === "production") {
      console.error("[sms] Twilio is not configured; SMS not sent.");
      return;
    }
    console.log(`[sms:dev] to=${destination}\n${body}`);
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: destination, From: TWILIO_FROM_NUMBER, Body: body }),
  });

  if (!res.ok) {
    // Status only: Twilio's error body can echo the destination number.
    throw new Error(`Twilio SMS send failed (${res.status})`);
  }
}

// `brand` is the club's display name. These used to hardcode
// "Le Club de Gammarth" for every tenant.
export function verificationCodeSms(code: string, brand = "GymOS"): string {
  return `${brand} : votre code de vérification est ${code}. Il expire dans 15 minutes.`;
}

export function sessionReminderSms(activity: string, startTime: string, brand = "GymOS"): string {
  return `${brand} : rappel — votre séance de ${activity} commence aujourd'hui à ${startTime}.`;
}
