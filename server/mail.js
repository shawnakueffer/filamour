// E-Mails über Resend (resend.com): Kontaktanfragen und Bestellungen an den Shop, Bestätigungen an die Kundschaft.
// Railway blockiert SMTP auf den günstigen Plänen, deshalb ein HTTP-Dienst statt SMTP.
// Ohne RESEND_API_KEY wird nichts verschickt; Anfragen stehen trotzdem im Admin-Bereich, Bestellungen in Stripe.

export function createMailer({ apiKey, from, to, fetchImpl = fetch } = {}) {
  if (!apiKey || !from || !to) return null;
  return {
    // ohne «to» geht die Mail an den Shop (NOTIFY_EMAIL); Antworten der Kundschaft landen ebenfalls dort
    async send({ subject, text, html, replyTo, to: recipient = to }) {
      const reply = replyTo || (recipient !== to ? to : "");
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [recipient], subject, text, ...(html ? { html } : {}), ...(reply ? { reply_to: reply } : {}) }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}
