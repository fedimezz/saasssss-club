// src/lib/email.ts
//
// Minimal transactional email sender via Brevo's REST API (not SMTP —
// SMTP_URL was actually a Brevo API key, which nodemailer can't use).
// If BREVO_API_KEY isn't set (e.g. local dev without a mail provider
// configured), it logs the email to the server console instead of
// throwing, so the verify/reset flows are still testable end-to-end
// without real credentials.

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.SMTP_FROM ?? "no-reply@le-club-de-gammarth.com";

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      // Don't print the body in production: it contains verification links,
      // OTPs and reset tokens, which must never land in server logs.
      console.error(
        `[email] BREVO_API_KEY is not set — email to=${to} subject="${subject}" was NOT sent.`
      );
    } else {
      console.log(`[email:dev] to=${to} subject="${subject}"\n${html}`);
    }
    return;
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${body}`);
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