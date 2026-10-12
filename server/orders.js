// E-Mails nach einer bezahlten Bestellung: Bestätigung an die Kundschaft, Bestellung an den Shop.
// Grundlage ist die Stripe-Checkout-Session (mit line_items), die der Webhook nachlädt.
import { PICKUP_NOTE, chf } from "../public/catalog.js";

// Artikelzeilen aus den Metadaten (siehe buildSession), lange Werte sind auf artikel_1_1, artikel_1_2 … verteilt
function articleLines(s) {
  const meta = s.metadata || {}, prices = s.line_items?.data || [];
  const count = Number(meta.artikel) || prices.length;
  const lines = [];
  for (let n = 1; n <= count; n++) {
    let text = meta[`artikel_${n}`];
    if (text === undefined) {
      const parts = [];
      for (let i = 1; meta[`artikel_${n}_${i}`] !== undefined; i++) parts.push(meta[`artikel_${n}_${i}`]);
      text = parts.join("") || `${prices[n - 1]?.quantity ?? 1}× ${prices[n - 1]?.description ?? "Artikel"}`;
    }
    const amount = prices[n - 1]?.amount_total;
    lines.push(`- ${text}${amount != null ? `\n  ${chf(amount)}` : ""}`);
  }
  return lines.join("\n");
}

function addressLines(a) {
  if (!a) return "";
  return [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country !== "CH" ? a.country : ""].filter(Boolean).join("\n");
}

function totals(s) {
  const shipping = s.shipping_cost?.amount_total ?? 0, discount = s.total_details?.amount_discount ?? 0;
  return [
    `Zwischensumme: ${chf(s.amount_subtotal ?? 0)}`,
    discount ? `Rabatt: −${chf(discount)}` : "",
    s.metadata?.lieferung === "Abholung" ? "Lieferung: Abholung" : `Versand: ${shipping ? chf(shipping) : "gratis"}`,
    `Total: ${chf(s.amount_total ?? 0)}`,
  ].filter(Boolean).join("\n");
}

export function orderEmails(s) {
  const number = s.id.slice(-8).toUpperCase();
  const pickup = s.metadata?.lieferung === "Abholung";
  const customer = s.customer_details || {};
  const ship = s.collected_information?.shipping_details;
  const firstName = (customer.name || ship?.name || "").split(" ")[0];
  const note = (s.custom_fields || []).find((f) => f.key === "bemerkung")?.text?.value;
  const items = articleLines(s), sums = totals(s);
  const delivery = pickup
    ? PICKUP_NOTE
    : `Lieferadresse:\n${[ship?.name, addressLines(ship?.address)].filter(Boolean).join("\n")}`;

  const toCustomer = customer.email ? {
    to: customer.email,
    subject: `Danke für deine Bestellung bei Filamour (Nr. ${number})`,
    text: [
      `Hallo${firstName ? ` ${firstName}` : ""}`,
      `Danke für deine Bestellung! Wir haben deine Zahlung erhalten und machen uns an die Arbeit.`,
      `Bestellnummer: ${number}\n\n${items}`,
      sums,
      delivery,
      note ? `Deine Bemerkung:\n${note}` : "",
      `Hast du eine Frage? Antworte einfach auf diese E-Mail.`,
      `Liebe Grüsse\nFilamour`,
    ].filter(Boolean).join("\n\n"),
  } : null;

  const dashboard = `https://dashboard.stripe.com/${s.livemode ? "" : "test/"}checkout/sessions/${s.id}`;
  const toShop = {
    subject: `Neue Bestellung ${number}: ${chf(s.amount_total ?? 0)}${pickup ? " (Abholung)" : ""}${s.livemode ? "" : " [TEST]"}`,
    replyTo: customer.email || undefined,
    text: [
      `Bestellnummer: ${number}`,
      `Name: ${customer.name || ship?.name || "–"}\nE-Mail: ${customer.email || "–"}${customer.phone ? `\nTelefon: ${customer.phone}` : ""}`,
      items,
      sums,
      pickup ? "Abholung: Termin per E-Mail vereinbaren." : delivery,
      `Bemerkung: ${note || "–"}`,
      `In Stripe: ${dashboard}`,
    ].join("\n\n"),
  };

  return { toCustomer, toShop };
}
