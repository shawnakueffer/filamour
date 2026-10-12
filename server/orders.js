// E-Mails nach einer bezahlten Bestellung: Bestätigung an die Kundschaft (gestaltet + Text), Bestellung an den Shop (nur Text).
// Grundlage ist die Stripe-Checkout-Session (mit line_items), die der Webhook nachlädt.
import { COLORS, POSTERS, PICKUP_NOTE, chf } from "../public/catalog.js";

// Artikel aus den Metadaten (siehe buildSession): «2× Name – Beschreibung», lange Werte sind auf artikel_1_1, artikel_1_2 … verteilt
function articles(s) {
  const meta = s.metadata || {}, prices = s.line_items?.data || [];
  const count = Number(meta.artikel) || prices.length;
  const list = [];
  for (let n = 1; n <= count; n++) {
    let text = meta[`artikel_${n}`];
    if (text === undefined) {
      const parts = [];
      for (let i = 1; meta[`artikel_${n}_${i}`] !== undefined; i++) parts.push(meta[`artikel_${n}_${i}`]);
      text = parts.join("") || `${prices[n - 1]?.quantity ?? 1}× ${prices[n - 1]?.description ?? "Artikel"}`;
    }
    const m = /^(\d+)× (.*?)(?: – (.*))?$/s.exec(text);
    list.push({ text, qty: m ? Number(m[1]) : 1, name: m ? m[2] : text, description: m?.[3] || "", amount: prices[n - 1]?.amount_total ?? null });
  }
  return list;
}

function addressLines(a) {
  if (!a) return [];
  return [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country !== "CH" ? a.country : ""].filter(Boolean);
}

function totalRows(s) {
  const shipping = s.shipping_cost?.amount_total ?? 0, discount = s.total_details?.amount_discount ?? 0;
  return [
    ["Zwischensumme", chf(s.amount_subtotal ?? 0)],
    ...(discount ? [["Rabatt", `−${chf(discount)}`]] : []),
    s.metadata?.lieferung === "Abholung" ? ["Lieferung", "Abholung"] : ["Versand", shipping ? chf(shipping) : "gratis"],
    ["Total", chf(s.amount_total ?? 0)],
  ];
}

export function orderEmails(s, { siteUrl = "" } = {}) {
  const number = s.id.slice(-8).toUpperCase();
  const pickup = s.metadata?.lieferung === "Abholung";
  const customer = s.customer_details || {};
  const ship = s.collected_information?.shipping_details;
  const firstName = (customer.name || ship?.name || "").split(" ")[0];
  const note = (s.custom_fields || []).find((f) => f.key === "bemerkung")?.text?.value;
  const list = articles(s), rows = totalRows(s);
  const address = [ship?.name, ...addressLines(ship?.address)].filter(Boolean);

  const items = list.map((a) => `- ${a.text}${a.amount != null ? `\n  ${chf(a.amount)}` : ""}`).join("\n");
  const sums = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  const delivery = pickup ? PICKUP_NOTE : `Lieferadresse:\n${address.join("\n")}`;

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
      `Liebe Grüsse\nLynn von Filamour`,
    ].filter(Boolean).join("\n\n"),
    html: customerHtml({ number, firstName, list, rows, pickup, address, note, siteUrl }),
  } : null;

  // Bewusst nur Text: die gestaltete Version sortierte der Spamfilter von Hostinger (Cloudmark) aus, die Textversion kommt an
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

/* ---------- Gestaltete Bestätigung ----------
   E-Mail-Programme können wenig: nur Tabellen, Stile direkt am Element, keine eigenen Schriften, kein SVG. */

const C = { bg: "#f4f0ef", card: "#ffffff", fg: "#1c191a", muted: "#736b6d", line: "#ebe6e7", accent: "#d6406a", soft: "#f8f5f5" };
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const ROUND = "'Arial Rounded MT Bold', 'Helvetica Rounded', Arial, sans-serif";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const HEX_BY_NAME = new Map([...COLORS.map((c) => [c.name, c.hex]), ...POSTERS.map((p) => [p.colorName, p.bg])]);

// dunkle Schrift auf hellen Farben, weisse auf dunklen
function ink(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? C.fg : "#ffffff";
}

// «M Sakura Pink · I Ice Blue» → farbige Buchstaben; andere Artikel → ein Farbpunkt mit Namen
function swatches(description) {
  const parts = description.split(" · ").map((p) => ({ ch: p.slice(0, p.indexOf(" ")), hex: HEX_BY_NAME.get(p.slice(p.indexOf(" ") + 1)) }));
  if (parts.length && parts.every((p) => p.ch.length === 1 && p.hex)) {
    return parts.map((p) => `<span style="display:inline-block;min-width:16px;margin:0 4px 6px 0;padding:6px 7px;border-radius:9px;border:1px solid rgba(0,0,0,.08);background:${p.hex};color:${ink(p.hex)};font:700 16px/1 ${ROUND};text-align:center">${esc(p.ch)}</span>`).join("")
      + `<div style="margin-top:2px;font:13px/1.5 ${SANS};color:${C.muted}">${esc(description)}</div>`;
  }
  const hex = HEX_BY_NAME.get(description);
  if (!description) return "";
  return `<div style="font:14px/1.5 ${SANS};color:${C.muted}">${hex ? `<span style="display:inline-block;width:12px;height:12px;margin-right:6px;border-radius:50%;border:1px solid rgba(0,0,0,.08);background:${hex};vertical-align:-1px"></span>` : ""}${esc(description)}</div>`;
}

const label = (t) => `<div style="font:600 13px/1.4 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${C.muted};margin-bottom:6px">${t}</div>`;
const box = (title, inner) => `<div style="margin-top:12px;padding:18px 20px;border-radius:14px;background:${C.soft}">${label(title)}<div style="font:15px/1.6 ${SANS};color:${C.fg}">${inner}</div></div>`;
const p = (html, top = 16) => `<p style="margin:${top}px 0 0;font:15px/1.6 ${SANS};color:${C.fg}">${html}</p>`;

// Artikel mit farbigen Buchstaben, darunter die Summen
function orderTable(list, rows) {
  const items = list.map((a) => `
          <tr><td style="padding:16px 0;border-bottom:1px solid ${C.line}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font:600 15px/1.4 ${SANS};color:${C.fg};padding-bottom:8px">${a.qty > 1 ? `${a.qty}× ` : ""}${esc(a.name)}</td>
              <td align="right" valign="top" style="font:600 15px/1.4 ${SANS};color:${C.fg};white-space:nowrap;padding-left:12px">${a.amount != null ? chf(a.amount) : ""}</td>
            </tr></table>
            ${swatches(a.description)}
          </td></tr>`).join("");
  const sums = rows.map(([k, v], i) => {
    const style = i === rows.length - 1 ? `font:700 17px/1.4 ${SANS};color:${C.fg};padding-top:10px` : `font:15px/1.4 ${SANS};color:${C.muted};padding-top:6px`;
    return `<tr><td style="${style}">${esc(k)}</td><td align="right" style="${style}">${esc(v)}</td></tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line}">${items}
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">${sums}</table>`;
}

// Grundgerüst beider Mails: Schriftzug, weisse Karte, Fusszeile
function layout({ title, preheader, eyebrow, heading, intro, body, home }) {
  return `<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td align="center" style="padding:4px 0 24px">
        <a href="${esc(home)}" style="font:500 26px/1 ${SERIF};letter-spacing:.14em;color:${C.fg};text-decoration:none">FILAMOUR</a>
      </td></tr>
      <tr><td style="background:${C.card};border-radius:18px;padding:36px 32px 28px">
        <div style="font:600 12px/1.4 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:${C.accent}">${eyebrow}</div>
        <h1 style="margin:10px 0 12px;font:500 30px/1.2 ${SERIF};color:${C.fg}">${heading}</h1>
        <p style="margin:0 0 20px;font:16px/1.6 ${SANS};color:${C.muted}">${intro}</p>
        ${body}
      </td></tr>
      <tr><td align="center" style="padding:20px 8px 0;font:13px/1.6 ${SANS};color:${C.muted}">
        Personalisierbare Geschenke, gedruckt in der Schweiz<br>
        <a href="${esc(home)}" style="color:${C.muted}">${esc(home.replace(/^https?:\/\//, ""))}</a> · <a href="mailto:hello@filamour.ch" style="color:${C.muted}">hello@filamour.ch</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function customerHtml({ number, firstName, list, rows, pickup, address, note, siteUrl }) {
  return layout({
    title: "Danke für deine Bestellung",
    preheader: `Bestellung ${number}: Wir haben deine Zahlung erhalten und machen uns an die Arbeit.`,
    eyebrow: `Bestellung ${number}`,
    heading: `Danke für deine Bestellung${firstName ? `, ${esc(firstName)}` : ""}!`,
    intro: "Wir haben deine Zahlung erhalten und machen uns an die Arbeit. Hier ist alles, was du bestellt hast.",
    home: siteUrl || "https://filamour.ch",
    body: orderTable(list, rows)
      + `<div style="margin-top:12px"></div>`
      + (pickup ? box("Abholung", esc(PICKUP_NOTE)) : box("Lieferadresse", address.map(esc).join("<br>")))
      + (note ? box("Deine Bemerkung", esc(note).replace(/\n/g, "<br>")) : "")
      + p("Hast du eine Frage? Antworte einfach auf diese E-Mail.", 24)
      + p("Liebe Grüsse<br>Lynn von Filamour"),
  });
}
