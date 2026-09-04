import { Resend } from "resend";

let cached: Resend | undefined;

/** Lazy singleton — see src/lib/stripe.ts for why. */
function getResend(): Resend {
  if (cached) return cached;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }

  cached = new Resend(apiKey);
  return cached;
}

/**
 * "Your panel just got outgrown" notification — opt-in via
 * `panels.notify_on_outgrown`. Best-effort: a failed send must never
 * fail the purchase/boost flow that triggered it.
 */
export async function sendOutgrownNotification(params: {
  to: string;
  panelUrl: string;
  outgrownByAmountCents: number;
}): Promise<void> {
  const fromAddress = process.env.RESEND_FROM_EMAIL;
  if (!fromAddress) {
    console.warn("[email] RESEND_FROM_EMAIL is not set — skipping notification");
    return;
  }

  try {
    const resend = getResend();
    const amountEuros = (params.outgrownByAmountCents / 100).toFixed(2);
    await resend.emails.send({
      from: fromAddress,
      to: params.to,
      subject: "Votre panneau vient d'être dépassé",
      html: `
        <p>Bonjour,</p>
        <p>
          Un autre panneau vient de dépasser en taille celui de
          <strong>${escapeHtml(params.panelUrl)}</strong>
          (nouveau montant : ${amountEuros} €).
        </p>
        <p>Vous pouvez agrandir votre panneau à tout moment en le rachetant sur le site.</p>
      `,
    });
  } catch (error) {
    console.error("[email] failed to send outgrown notification", error);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
