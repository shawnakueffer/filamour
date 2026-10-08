// E-Mail-Benachrichtigung bei neuen Kontaktanfragen, über Resend (resend.com).
// Railway blockiert SMTP auf den günstigen Plänen, deshalb ein HTTP-Dienst statt SMTP.
// Ohne RESEND_API_KEY wird nichts verschickt; die Anfragen stehen trotzdem im Admin-Bereich.

export function createMailer({ apiKey, from, to, fetchImpl = fetch } = {}) {
  if (!apiKey || !from || !to) return null;
  return {
    async send({ subject, text, replyTo }) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}
