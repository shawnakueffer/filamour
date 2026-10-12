// Newsletter-Anmeldung über Brevo (brevo.com) mit Double-Opt-in:
// Brevo schickt die Bestätigungsmail, trägt erst nach dem Klick in die Liste ein und leitet dann zurück auf den Shop.
// Ohne BREVO_API_KEY, BREVO_LIST_ID und BREVO_DOI_TEMPLATE_ID landen Anmeldungen wie bisher in der eigenen Datenbank.

export function createBrevo({ apiKey, listId, templateId, fetchImpl = fetch } = {}) {
  const list = Number(listId), template = Number(templateId);
  if (!apiKey || !(list > 0) || !(template > 0)) return null;
  return {
    async subscribe(email, redirectionUrl) {
      const res = await fetchImpl("https://api.brevo.com/v3/contacts/doubleOptinConfirmation", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ email, includeListIds: [list], templateId: template, redirectionUrl }),
      });
      if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}
