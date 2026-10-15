// /admin – Bestellungen als verschickt melden, Newsletter-Anmeldungen und Kontaktanfragen ansehen und als CSV herunterladen.
// Geschützt mit ADMIN_PASSWORD (Benutzername beliebig). Ohne Passwort ist der Bereich aus.
// Bestellungen kommen direkt aus Stripe; gespeichert wird nur, wann die Versandbestätigung rausging.
import crypto from "node:crypto";
import express from "express";
import { chf } from "../public/catalog.js";
import { articles, addressLines, shippingEmail, TRACKING } from "./orders.js";
import { SESSION_ID } from "./checkout.js";

const ORDER_DAYS = 60; // so weit zurück werden Bestellungen angezeigt
const MESSAGES = {
  "schon": "Diese Bestellung war schon als verschickt gemeldet. Es ging keine weitere Mail raus.",
  "nummer": "Die Sendungsnummer sieht nicht richtig aus (nur Buchstaben, Zahlen, Leerzeichen, Punkt und Bindestrich).",
  "unbekannt": "Diese Bestellung wurde nicht gefunden.",
  "abholung": "Diese Bestellung wird abgeholt, dafür gibt es keine Versandbestätigung.",
  "mail": "Die Mail konnte nicht verschickt werden. Bitte versuche es in einer Minute nochmals.",
  "aus": "Stripe oder der Mailversand ist nicht eingerichtet.",
};

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = (d) => new Date(d).toLocaleString("de-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" });

// Excel führt Zellen mit = + - @ als Formel aus, deshalb ein ' davor
const cell = (v) => {
  let s = v instanceof Date ? v.toISOString() : String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
const csv = (rows, cols) => "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\r\n");

function sameSecret(a, b) {
  const h = (s) => crypto.createHash("sha256").update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

const paid = (s) => s.metadata?.shop === "filamour" && s.status === "complete" && s.payment_status !== "unpaid";

async function recentOrders(stripe) {
  const since = Math.floor(Date.now() / 1000) - ORDER_DAYS * 24 * 60 * 60;
  const page = await stripe.checkout.sessions.list({ status: "complete", created: { gte: since }, limit: 100 });
  return page.data.filter(paid);
}

function orderCard(s, shippedAt, canSend) {
  const number = s.id.slice(-8).toUpperCase();
  const customer = s.customer_details || {};
  const ship = s.collected_information?.shipping_details;
  const pickup = s.metadata?.lieferung === "Abholung";
  const note = (s.custom_fields || []).find((f) => f.key === "bemerkung")?.text?.value;
  const address = [ship?.name, ...addressLines(ship?.address)].filter(Boolean);
  const dashboard = `https://dashboard.stripe.com/${s.livemode ? "" : "test/"}checkout/sessions/${encodeURIComponent(s.id)}`;
  let status;
  if (pickup) status = `<p class="tag">Abholung – Termin per E-Mail vereinbaren</p>`;
  else if (shippedAt) status = `<p class="tag done">✓ Verschickt am ${esc(when(shippedAt))}, Kundin/Kunde wurde benachrichtigt</p>`;
  else if (!canSend) status = `<p class="tag">Offen (Versandbestätigung braucht Stripe und Resend)</p>`;
  else status = `<form class="ship" method="post" action="/admin/bestellungen/${encodeURIComponent(s.id)}/verschickt">
      <label>Sendungsnummer (freiwillig)<input name="tracking" maxlength="40" autocomplete="off" placeholder="z. B. 99.00.123456.12345678"></label>
      <button type="submit">Verschickt – Kunde benachrichtigen</button>
    </form>`;
  return `<article class="order${shippedAt || pickup ? " closed" : ""}">
  <header><b>Nr. ${esc(number)}</b> <span>${esc(when(s.created * 1000))}</span> <span class="sum">${esc(chf(s.amount_total ?? 0))}</span>${s.livemode ? "" : ' <span class="test">TEST</span>'}</header>
  <p>${esc(customer.name || ship?.name || "–")} · <a href="mailto:${esc(customer.email)}">${esc(customer.email || "")}</a></p>
  <ul>${articles(s).map((a) => `<li>${esc(a.text)}</li>`).join("")}</ul>
  ${pickup ? "" : `<p class="addr">${address.map(esc).join("<br>") || "–"}</p>`}
  ${note ? `<p class="q">Bemerkung: ${esc(note)}</p>` : ""}
  ${status}
  <p class="small"><a href="${esc(dashboard)}">In Stripe öffnen</a></p>
</article>`;
}

export function adminRouter({ store, password, newsletterInBrevo = false, stripe = null, mailer = null, siteUrl = "" }) {
  const r = express.Router();

  r.use((req, res, next) => {
    if (!password) return res.status(404).send("Nicht gefunden.");
    const [scheme, encoded] = (req.get("authorization") || "").split(" ");
    const pass = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":") : "";
    if (pass && sameSecret(pass, password)) return next();
    res.set("WWW-Authenticate", 'Basic realm="Filamour Admin", charset="UTF-8"').status(401).send("Anmeldung nötig.");
  });
  r.use((req, res, next) => { res.set("cache-control", "no-store").set("x-robots-tag", "noindex"); next(); });
  r.use((req, res, next) => (store ? next() : res.status(503).type("text/plain").send("Keine Datenbank verbunden (DATABASE_URL fehlt).")));

  // Formulare nur von der eigenen Seite: der Browser schickt die Anmeldung sonst auch bei Anfragen fremder Seiten mit
  r.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    const from = req.get("origin") || "";
    let host = "";
    try { host = new URL(from).host; } catch {}
    if (host && host === req.get("host")) return next();
    res.status(403).type("text/plain").send("Nur aus dem Admin-Bereich erlaubt.");
  });

  r.post("/bestellungen/:id/verschickt", express.urlencoded({ extended: false, limit: "4kb" }), async (req, res) => {
    const back = (q) => res.redirect(303, `/admin?${q}#bestellungen`);
    const id = String(req.params.id || "");
    const tracking = String(req.body?.tracking || "").trim();
    if (!stripe || !mailer) return back("fehler=aus");
    if (!SESSION_ID.test(id)) return back("fehler=unbekannt");
    if (tracking && !TRACKING.test(tracking)) return back("fehler=nummer");
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(id);
    } catch (err) {
      console.error("Stripe-Fehler (Versand):", err?.message);
      return back("fehler=unbekannt");
    }
    if (!paid(session)) return back("fehler=unbekannt");
    if (session.metadata?.lieferung === "Abholung") return back("fehler=abholung");
    const mail = shippingEmail(session, { tracking, siteUrl });
    if (!mail) return back("fehler=unbekannt");
    if (!(await store.claimOrderMail(session.id, "versand"))) return back("fehler=schon");
    try {
      await mailer.send(mail);
    } catch (err) {
      console.error(`Versand-Mail (${session.id}):`, err?.message);
      await store.releaseOrderMail(session.id, "versand").catch(() => {});
      return back("fehler=mail");
    }
    back(`verschickt=${session.id.slice(-8).toUpperCase()}`);
  });

  r.get("/newsletter.csv", async (req, res) => {
    res.type("text/csv").attachment("newsletter.csv").send(csv(await store.listNewsletter(), ["email", "created_at"]));
  });
  r.get("/kontakt.csv", async (req, res) => {
    res.type("text/csv").attachment("kontakt.csv").send(csv(await store.listContacts(), ["created_at", "name", "email", "question", "history"]));
  });

  r.get("/", async (req, res) => {
    const [news, contacts, shipped] = await Promise.all([store.listNewsletter(), store.listContacts(), store.orderMailTimes("versand")]);
    let orders = [], ordersError = false;
    if (stripe) {
      try { orders = await recentOrders(stripe); } catch (err) { ordersError = true; console.error("Stripe-Fehler (Admin):", err?.message); }
    }
    const open = orders.filter((s) => !shipped.has(s.id) && s.metadata?.lieferung !== "Abholung").length;
    const done = /^[A-Z0-9]{8}$/.test(String(req.query.verschickt || "")) ? String(req.query.verschickt) : "";
    const flash = done ? `<p class="flash ok">✓ Bestellung ${esc(done)} ist als verschickt gemeldet, die Mail an die Kundschaft ist raus.</p>`
      : MESSAGES[req.query.fehler] ? `<p class="flash err">${esc(MESSAGES[req.query.fehler])}</p>` : "";
    res.type("html").send(`<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin – Filamour</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0 auto; padding: 24px 16px 64px; max-width: 980px; color: #1c191a; background: #fbfafa; }
  h1 { font-size: 24px; } h2 { font-size: 18px; margin-top: 36px; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  h2 a { font-size: 14px; font-weight: 500; color: #d6406a; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #ebe6e7; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid #ebe6e7; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #736b6d; }
  td.nowrap { white-space: nowrap; color: #736b6d; } .q { white-space: pre-wrap; overflow-wrap: anywhere; }
  details summary { cursor: pointer; color: #736b6d; } details pre { white-space: pre-wrap; font: 13px/1.45 ui-monospace, monospace; margin: 6px 0 0; }
  .empty { color: #736b6d; } .store { color: #736b6d; font-size: 13px; }
  .flash { padding: 12px 14px; border-radius: 10px; } .flash.ok { background: #e7f5ea; } .flash.err { background: #fbe7ea; }
  .orders { display: grid; gap: 12px; }
  .order { background: #fff; border: 1px solid #ebe6e7; border-radius: 12px; padding: 14px 16px; }
  .order.closed { opacity: .72; }
  .order header { display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; } .order header span { color: #736b6d; } .order .sum { margin-left: auto; color: #1c191a; font-weight: 600; }
  .order .test { background: #fff3c4; color: #1c191a; padding: 0 6px; border-radius: 6px; font-size: 12px; }
  .order p { margin: 6px 0; } .order ul { margin: 6px 0; padding-left: 18px; } .order .addr { color: #3d3739; } .order .small { font-size: 13px; }
  .tag { color: #736b6d; } .tag.done { color: #2e7d45; }
  .ship { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; margin-top: 10px; }
  .ship label { display: grid; gap: 4px; font-size: 13px; color: #736b6d; flex: 1 1 220px; }
  .ship input { font: inherit; padding: 9px 10px; border: 1px solid #d9d2d4; border-radius: 8px; }
  .ship button { font: inherit; font-weight: 600; padding: 10px 14px; border: 0; border-radius: 999px; background: #1c191a; color: #fff; cursor: pointer; }
</style></head><body>
<h1>Filamour Admin</h1>
<p class="store">Speicher: ${esc(store.kind)}${store.kind === "postgres" ? "" : " (nicht dauerhaft – DATABASE_URL setzen)"}</p>
${flash}
<h2 id="bestellungen">Bestellungen der letzten ${ORDER_DAYS} Tage (${orders.length}${open ? `, ${open} noch zu verschicken` : ""})</h2>
${!stripe ? `<p class="empty">Stripe ist nicht verbunden.</p>` : ordersError ? `<p class="flash err">Die Bestellungen konnten gerade nicht aus Stripe geladen werden. Bitte Seite neu laden.</p>`
  : orders.length ? `<div class="orders">${orders.map((s) => orderCard(s, shipped.get(s.id), Boolean(mailer))).join("")}</div>` : `<p class="empty">Noch keine Bestellungen.</p>`}
<h2>Kontaktanfragen (${contacts.length}) <a href="/admin/kontakt.csv">CSV herunterladen</a></h2>
${contacts.length ? `<table><thead><tr><th>Datum</th><th>Von</th><th>Frage</th></tr></thead><tbody>${contacts.map((c) => `<tr>
  <td class="nowrap">${esc(when(c.created_at))}</td>
  <td>${esc(c.name)}<br><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td>
  <td><div class="q">${esc(c.question) || '<span class="empty">–</span>'}</div>${c.history ? `<details><summary>Chatverlauf</summary><pre>${esc(c.history)}</pre></details>` : ""}</td>
</tr>`).join("")}</tbody></table>` : `<p class="empty">Noch keine Anfragen.</p>`}
<h2>Newsletter (${news.length}) <a href="/admin/newsletter.csv">CSV herunterladen</a></h2>
${newsletterInBrevo ? `<p class="store">Neue Anmeldungen gehen an Brevo (mit Bestätigung per E-Mail) und stehen dort unter Kontakte. Hier stehen nur ältere Anmeldungen.</p>` : ""}
${news.length ? `<table><thead><tr><th>E-Mail</th><th>Angemeldet</th></tr></thead><tbody>${news.map((n) => `<tr><td>${esc(n.email)}</td><td class="nowrap">${esc(when(n.created_at))}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">Noch keine Anmeldungen.</p>`}
</body></html>`);
  });

  return r;
}
