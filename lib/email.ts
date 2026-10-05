import { fetchWithTimeout } from "@/lib/http";

// Escapes text before it's interpolated into an HTML email body.
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.error("[email] Resend is not configured; email was not sent.");
    throw new Error("Email provider is not configured");
  }

  const res = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    console.error(`[email] Resend request failed (${res.status}).`);
    throw new Error(`Resend send failed (${res.status})`);
  }
}

export function verificationCodeEmail(code: string) {
  return {
    subject: "Votre code de vérification — Le Club de Gammarth",
    html: `<p>Votre code de vérification est :</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>Ce code expire dans 15 minutes.</p>`,
  };
}

export function resetPasswordEmail(resetUrl: string) {
  return {
    subject: "Réinitialisation de votre mot de passe — Le Club de Gammarth",
    html: `<p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Ce lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
  };
}

const ROLE_LABELS_FR: Record<string, string> = {
  OWNER: "propriétaire",
  ADMIN: "administrateur",
  COACH: "coach",
  MEMBER: "membre",
};

export function invitationEmail(input: {
  clubName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresInDays: number;
}) {
  const club = escapeHtml(input.clubName);
  const inviter = escapeHtml(input.inviterName);
  const role = ROLE_LABELS_FR[input.role] ?? "utilisateur";
  const url = escapeHtml(input.acceptUrl);

  return {
    subject: `Invitation à rejoindre ${input.clubName.replace(/[\r\n]+/g, " ")}`,
    html: `<p>Bonjour,</p><p><strong>${inviter}</strong> vous a invité à rejoindre <strong>${club}</strong> en tant que ${role}.</p><p>Cliquez sur le lien ci-dessous pour choisir votre mot de passe et activer votre compte :</p><p><a href="${url}">${url}</a></p><p>Ce lien expire dans ${input.expiresInDays} jours et ne peut être utilisé qu'une seule fois. Si vous n'attendiez pas cette invitation, ignorez cet email.</p>`,
  };
}