// /admin – Bestellungen als verschickt melden, Newsletter-Anmeldungen und Kontaktanfragen ansehen und als CSV herunterladen.
// Geschützt mit ADMIN_PASSWORD (Benutzername beliebig). Ohne Passwort ist der Bereich aus.
// Bestellungen kommen direkt aus Stripe; gespeichert wird nur, wann eine Bestellung verschickt oder abgeholt wurde.
// Reiter über ?tab=offen|erledigt|anfragen|newsletter, damit die Seite ohne JavaScript auskommt.
import crypto from "node:crypto";
import express from "express";
import { chf } from "../public/catalog.js";
import { articles, addressLines, letterColors, shippingEmail, TRACKING } from "./orders.js";
import { SESSION_ID } from "./checkout.js";

const ORDER_DAYS = 60; // so weit zurück werden Bestellungen angezeigt
const LATE_DAYS = 4;   // ab so vielen Tagen offen wird die Bestellung markiert (Lieferzeit 5–7 Tage)
const TABS = ["offen", "erledigt", "anfragen", "newsletter"];
const MESSAGES = {
  "schon": "Diese Bestellung war schon erledigt. Es ging keine weitere Mail raus.",
  "nummer": "Die Sendungsnummer sieht nicht richtig aus (nur Buchstaben, Zahlen, Leerzeichen, Punkt und Bindestrich).",
  "unbekannt": "Diese Bestellung wurde nicht gefunden.",
  "abholung": "Diese Bestellung wird abgeholt, dafür gibt es keine Versandbestätigung.",
  "versand": "Diese Bestellung wird verschickt, nicht abgeholt.",
  "mail": "Die Mail konnte nicht verschickt werden. Bitte versuche es in einer Minute nochmals.",
  "aus": "Stripe oder der Mailversand ist nicht eingerichtet.",
};

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = (d) => new Date(d).toLocaleString("de-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" });
const day = (d) => new Date(d).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "long" });

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
const isPickup = (s) => s.metadata?.lieferung === "Abholung";

async function recentOrders(stripe) {
  const since = Math.floor(Date.now() / 1000) - ORDER_DAYS * 24 * 60 * 60;
  const page = await stripe.checkout.sessions.list({ status: "complete", created: { gte: since }, limit: 100 });
  return page.data.filter(paid);
}

/* ---------- Bausteine ---------- */

function itemHtml(a) {
  const letters = letterColors(a.description);
  return `<li><div class="item-name">${a.qty > 1 ? `<b>${a.qty}×</b> ` : ""}${esc(a.name)}</div>${letters
    ? `<div class="chips">${letters.map((l) => `<span class="chip" style="background:${l.hex};color:${l.ink}">${esc(l.ch)}</span>`).join("")}</div><div class="item-desc">${esc(a.description)}</div>`
    : a.description ? `<div class="item-desc">${esc(a.description)}</div>` : ""}</li>`;
}

function orderCard(s, doneAt, canSend) {
  const number = s.id.slice(-8).toUpperCase();
  const customer = s.customer_details || {};
  const ship = s.collected_information?.shipping_details;
  const pickup = isPickup(s);
  const note = (s.custom_fields || []).find((f) => f.key === "bemerkung")?.text?.value;
  const address = [ship?.name, ...addressLines(ship?.address)].filter(Boolean);
  const dashboard = `https://dashboard.stripe.com/${s.livemode ? "" : "test/"}checkout/sessions/${encodeURIComponent(s.id)}`;
  const age = Math.floor((Date.now() - s.created * 1000) / 86_400_000);
  const action = `/admin/bestellungen/${encodeURIComponent(s.id)}`;

  let foot;
  if (doneAt) foot = `<p class="pill done">✓ ${pickup ? "Abgeholt" : "Verschickt"} am ${esc(when(doneAt))}</p>`;
  else if (pickup) foot = `<form method="post" action="${action}/abgeholt" class="act"><button type="submit" class="btn">Abgeholt – erledigt</button></form>`;
  else if (!canSend) foot = `<p class="pill">Versandbestätigung braucht Stripe und Resend</p>`;
  else foot = `<form method="post" action="${action}/verschickt" class="act">
      <label class="field"><span>Sendungsnummer (freiwillig)</span><input name="tracking" maxlength="40" autocomplete="off" placeholder="z. B. 99.00.123456.12345678"></label>
      <button type="submit" class="btn">Verschickt – Kunde benachrichtigen</button>
    </form>`;

  return `<article class="card order${doneAt ? " is-done" : ""}">
  <header class="order-head">
    <div><div class="num">Nr. ${esc(number)}${s.livemode ? "" : ' <span class="badge test">TEST</span>'}</div>
    <div class="meta">${esc(day(s.created * 1000))}${!doneAt ? ` · <span class="${age >= LATE_DAYS ? "late" : ""}">${age === 0 ? "heute" : age === 1 ? "seit gestern" : `seit ${age} Tagen`}</span>` : ""}</div></div>
    <div class="total">${esc(chf(s.amount_total ?? 0))}</div>
  </header>
  <div class="order-body">
    <div class="who"><b>${esc(customer.name || ship?.name || "–")}</b>${customer.email ? `<a href="mailto:${esc(customer.email)}">${esc(customer.email)}</a>` : ""}${customer.phone ? `<span>${esc(customer.phone)}</span>` : ""}</div>
    <ul class="items">${articles(s).map(itemHtml).join("")}</ul>
    <div class="ship-to">${pickup ? `<span class="badge pickup">Abholung</span> Termin per E-Mail vereinbaren` : `<span class="lbl">Lieferadresse</span>${address.map(esc).join("<br>") || "–"}`}</div>
    ${note ? `<div class="note"><span class="lbl">Bemerkung</span>${esc(note)}</div>` : ""}
  </div>
  <footer class="order-foot">${foot}<a class="stripe" href="${esc(dashboard)}">In Stripe öffnen ↗</a></footer>
</article>`;
}

const STYLE = `
  @font-face { font-family: "Figtree"; font-weight: 400; src: url("/fonts/figtree-latin-400-normal.woff2") format("woff2"); }
  @font-face { font-family: "Figtree"; font-weight: 600; src: url("/fonts/figtree-latin-600-normal.woff2") format("woff2"); }
  @font-face { font-family: "Cormorant Garamond"; font-weight: 600; src: url("/fonts/cormorant-garamond-latin-600-normal.woff2") format("woff2"); }
  @font-face { font-family: "Cherry Bomb One"; src: url("/fonts/cherry-bomb-one-latin-400-normal.woff2") format("woff2"); }
  :root { --bg: #f4f0ef; --card: #fff; --fg: #1c191a; --muted: #736b6d; --line: #ebe6e7; --accent: #d6406a; --soft: #f8f5f5; --ok: #2e7d45; color-scheme: only light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 "Figtree", system-ui, sans-serif; }
  a { color: inherit; }
  .top { background: var(--card); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 2; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 16px; }
  .top .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 14px; }
  .brand { font: 600 24px/1 "Cormorant Garamond", Georgia, serif; letter-spacing: .14em; }
  .brand small { font: 600 11px/1 "Figtree", sans-serif; letter-spacing: .12em; color: var(--accent); margin-left: 8px; text-transform: uppercase; }
  .store { font-size: 12px; color: var(--muted); }
  .tabs { display: flex; gap: 4px; overflow-x: auto; padding-top: 10px; scrollbar-width: none; }
  .tabs a { text-decoration: none; padding: 10px 14px; border-bottom: 2px solid transparent; color: var(--muted); font-weight: 600; white-space: nowrap; }
  .tabs a.on { color: var(--fg); border-color: var(--fg); }
  .tabs .count { display: inline-block; min-width: 22px; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: var(--soft); color: var(--muted); font-size: 12px; text-align: center; }
  .tabs a.on .count { background: var(--fg); color: #fff; }
  .tabs .count.hot { background: var(--accent); color: #fff; }
  main.wrap { padding-top: 22px; padding-bottom: 64px; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 6px; }
  @media (max-width: 640px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .stats-note { font-size: 12px; color: var(--muted); margin: 0 0 22px; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; }
  .stat .v { font: 600 22px/1.2 "Figtree", sans-serif; } .stat .k { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
  .flash { padding: 12px 16px; border-radius: 12px; margin: 0 0 16px; } .flash.ok { background: #e4f3e8; } .flash.err { background: #fbe4e8; }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 4px 0 14px; }
  h1 { font: 600 28px/1.2 "Cormorant Garamond", Georgia, serif; margin: 0; }
  .head a { color: var(--accent); font-weight: 600; font-size: 14px; }
  .hint { color: var(--muted); font-size: 14px; margin: -6px 0 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; align-items: start; }
  @media (max-width: 420px) { .grid { grid-template-columns: 1fr; } }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; }
  .order { display: flex; flex-direction: column; }
  .order.is-done { opacity: .85; }
  .order-head { display: flex; justify-content: space-between; gap: 10px; padding: 14px 16px 10px; border-bottom: 1px solid var(--line); }
  .num { font-weight: 600; font-size: 16px; } .meta { color: var(--muted); font-size: 13px; } .late { color: var(--accent); font-weight: 600; }
  .total { font-weight: 600; font-size: 17px; white-space: nowrap; }
  .order-body { padding: 12px 16px; display: grid; gap: 12px; }
  .who { display: flex; flex-direction: column; } .who a, .who span { color: var(--muted); font-size: 14px; text-decoration: none; overflow-wrap: anywhere; }
  .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .item-name { font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 4px; }
  .chip { display: inline-grid; place-items: center; min-width: 28px; height: 30px; padding: 0 6px; border-radius: 9px; border: 1px solid rgba(0,0,0,.08); font: 17px/1 "Cherry Bomb One", "Arial Rounded MT Bold", sans-serif; }
  .item-desc { color: var(--muted); font-size: 13px; }
  .ship-to, .note { background: var(--soft); border-radius: 12px; padding: 10px 12px; font-size: 14px; }
  .note { background: #fff6dc; }
  .lbl { display: block; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: .04em; vertical-align: 2px; }
  .badge.test { background: #fff0b8; } .badge.pickup { background: #e8e0f4; margin-right: 6px; }
  .order-foot { margin-top: auto; padding: 12px 16px 14px; border-top: 1px solid var(--line); display: grid; gap: 8px; }
  .act { display: grid; gap: 8px; }
  .field { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
  .field input { font: inherit; font-size: 15px; color: var(--fg); padding: 10px 12px; border: 1px solid #d9d2d4; border-radius: 10px; background: #fff; }
  .btn { font: inherit; font-weight: 600; padding: 11px 16px; border: 0; border-radius: 999px; background: var(--fg); color: #fff; cursor: pointer; }
  .btn:hover { background: #3a3436; }
  .pill { margin: 0; font-size: 14px; color: var(--muted); } .pill.done { color: var(--ok); font-weight: 600; }
  .stripe { font-size: 13px; color: var(--muted); text-decoration: none; } .stripe:hover { text-decoration: underline; }
  .empty { background: var(--card); border: 1px dashed #d9d2d4; border-radius: 16px; padding: 28px 16px; text-align: center; color: var(--muted); }
  .msg { padding: 14px 16px; display: grid; gap: 6px; }
  .msg .from { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; } .msg .from span { color: var(--muted); font-size: 13px; }
  .msg .q { white-space: pre-wrap; overflow-wrap: anywhere; }
  details summary { cursor: pointer; color: var(--muted); font-size: 14px; } details pre { white-space: pre-wrap; font: 13px/1.45 ui-monospace, monospace; margin: 6px 0 0; }
  table { width: 100%; border-collapse: collapse; } td { padding: 10px 16px; border-bottom: 1px solid var(--line); } tr:last-child td { border-bottom: 0; } td.d { color: var(--muted); text-align: right; white-space: nowrap; }
`;

/* ---------- Router ---------- */

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

  // Bestellung aus Stripe holen und prüfen; bei Problemen zurück zur Liste mit Hinweis
  async function loadOrder(req, res) {
    const id = String(req.params.id || "");
    if (!SESSION_ID.test(id)) return void res.redirect(303, "/admin?fehler=unbekannt");
    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      if (paid(session)) return session;
    } catch (err) {
      console.error("Stripe-Fehler (Admin):", err?.message);
    }
    res.redirect(303, "/admin?fehler=unbekannt");
  }

  r.post("/bestellungen/:id/verschickt", express.urlencoded({ extended: false, limit: "4kb" }), async (req, res) => {
    const back = (q) => res.redirect(303, `/admin?${q}`);
    const tracking = String(req.body?.tracking || "").trim();
    if (!stripe || !mailer) return back("fehler=aus");
    if (tracking && !TRACKING.test(tracking)) return back("fehler=nummer");
    const session = await loadOrder(req, res);
    if (!session) return;
    if (isPickup(session)) return back("fehler=abholung");
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

  // Abholung: nur als erledigt markieren, keine Mail
  r.post("/bestellungen/:id/abgeholt", async (req, res) => {
    if (!stripe) return res.redirect(303, "/admin?fehler=aus");
    const session = await loadOrder(req, res);
    if (!session) return;
    if (!isPickup(session)) return res.redirect(303, "/admin?fehler=versand");
    if (!(await store.claimOrderMail(session.id, "abgeholt"))) return res.redirect(303, "/admin?fehler=schon");
    res.redirect(303, `/admin?abgeholt=${session.id.slice(-8).toUpperCase()}`);
  });

  r.get("/newsletter.csv", async (req, res) => {
    res.type("text/csv").attachment("newsletter.csv").send(csv(await store.listNewsletter(), ["email", "created_at"]));
  });
  r.get("/kontakt.csv", async (req, res) => {
    res.type("text/csv").attachment("kontakt.csv").send(csv(await store.listContacts(), ["created_at", "name", "email", "question", "history"]));
  });

  r.get("/", async (req, res) => {
    const tab = TABS.includes(req.query.tab) ? req.query.tab : "offen";
    const [news, contacts, shipped, collected] = await Promise.all([
      store.listNewsletter(), store.listContacts(), store.orderMailTimes("versand"), store.orderMailTimes("abgeholt"),
    ]);
    let orders = [], ordersError = false;
    if (stripe) {
      try { orders = await recentOrders(stripe); } catch (err) { ordersError = true; console.error("Stripe-Fehler (Admin):", err?.message); }
    }
    const doneAt = (s) => (isPickup(s) ? collected : shipped).get(s.id);
    const open = orders.filter((s) => !doneAt(s)).sort((a, b) => a.created - b.created); // älteste zuerst
    const done = orders.filter((s) => doneAt(s)).sort((a, b) => doneAt(b) - doneAt(a));  // zuletzt erledigte zuerst
    const live = orders.filter((s) => s.livemode);
    const revenue = live.reduce((sum, s) => sum + (s.amount_total ?? 0), 0);

    const code = (k) => (/^[A-Z0-9]{8}$/.test(String(req.query[k] || "")) ? String(req.query[k]) : "");
    const flash = code("verschickt") ? `<p class="flash ok">✓ Bestellung ${esc(code("verschickt"))} ist verschickt, die Mail an die Kundschaft ist raus. Du findest sie unter «Erledigt».</p>`
      : code("abgeholt") ? `<p class="flash ok">✓ Bestellung ${esc(code("abgeholt"))} ist als abgeholt erledigt.</p>`
      : MESSAGES[req.query.fehler] ? `<p class="flash err">${esc(MESSAGES[req.query.fehler])}</p>` : "";

    const ordersBlock = (list, emptyText) => !stripe ? `<p class="empty">Stripe ist nicht verbunden.</p>`
      : ordersError ? `<p class="flash err">Die Bestellungen konnten gerade nicht aus Stripe geladen werden. Bitte Seite neu laden.</p>`
      : list.length ? `<div class="grid">${list.map((s) => orderCard(s, doneAt(s), Boolean(mailer))).join("")}</div>` : `<p class="empty">${emptyText}</p>`;

    let content;
    if (tab === "offen") content = `<div class="head"><h1>Offene Bestellungen</h1></div>
<p class="hint">Älteste zuerst. Nach «Verschickt» bekommt die Kundschaft eine Mail und die Bestellung wandert zu «Erledigt».</p>
${ordersBlock(open, "Alles erledigt, keine offenen Bestellungen 🎉")}`;
    else if (tab === "erledigt") content = `<div class="head"><h1>Erledigt</h1></div>
<p class="hint">Verschickte und abgeholte Bestellungen der letzten ${ORDER_DAYS} Tage. Ältere findest du in Stripe.</p>
${ordersBlock(done, "Noch nichts erledigt.")}`;
    else if (tab === "anfragen") content = `<div class="head"><h1>Kontaktanfragen</h1><a href="/admin/kontakt.csv">CSV herunterladen</a></div>
${contacts.length ? `<div class="grid">${contacts.map((c) => `<article class="card msg">
  <div class="from"><b>${esc(c.name) || "–"}</b><span>${esc(when(c.created_at))}</span></div>
  <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>
  <div class="q">${esc(c.question) || '<span class="pill">–</span>'}</div>
  ${c.history ? `<details><summary>Chatverlauf</summary><pre>${esc(c.history)}</pre></details>` : ""}
</article>`).join("")}</div>` : `<p class="empty">Noch keine Anfragen.</p>`}`;
    else content = `<div class="head"><h1>Newsletter</h1><a href="/admin/newsletter.csv">CSV herunterladen</a></div>
${newsletterInBrevo ? `<p class="hint">Neue Anmeldungen gehen an Brevo (mit Bestätigung per E-Mail) und stehen dort unter Kontakte. Hier stehen nur ältere Anmeldungen.</p>` : ""}
${news.length ? `<div class="card"><table>${news.map((n) => `<tr><td>${esc(n.email)}</td><td class="d">${esc(when(n.created_at))}</td></tr>`).join("")}</table></div>` : `<p class="empty">Noch keine Anmeldungen.</p>`}`;

    const tabLink = (id, label, count, hot = false) =>
      `<a href="/admin?tab=${id}"${tab === id ? ' class="on" aria-current="page"' : ""}>${label}<span class="count${hot && count ? " hot" : ""}">${count}</span></a>`;

    res.type("html").send(`<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${open.length ? `(${open.length}) ` : ""}Admin – Filamour</title>
<style>${STYLE}</style></head><body>
<header class="top"><div class="wrap bar">
  <div class="brand">FILAMOUR<small>Admin</small></div>
  <div class="store">${store.kind === "postgres" ? "" : `Speicher: ${esc(store.kind)} (nicht dauerhaft)`}</div>
</div>
<nav class="wrap tabs" aria-label="Bereiche">
  ${tabLink("offen", "Offen", open.length, true)}${tabLink("erledigt", "Erledigt", done.length)}${tabLink("anfragen", "Anfragen", contacts.length)}${tabLink("newsletter", "Newsletter", news.length)}
</nav></header>
<main class="wrap">
${flash}
${tab === "offen" || tab === "erledigt" ? `<div class="stats">
  <div class="stat"><div class="v">${open.length}</div><div class="k">Offen</div></div>
  <div class="stat"><div class="v">${done.length}</div><div class="k">Erledigt</div></div>
  <div class="stat"><div class="v">${live.length}</div><div class="k">Bestellungen</div></div>
  <div class="stat"><div class="v">${esc(chf(revenue))}</div><div class="k">Umsatz</div></div>
</div>
<p class="stats-note">Letzte ${ORDER_DAYS} Tage, ohne Testbestellungen beim Umsatz.</p>` : ""}
${content}
</main>
</body></html>`);
  });

  return r;
}
