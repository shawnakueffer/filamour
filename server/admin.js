// /admin – Newsletter-Anmeldungen und Kontaktanfragen ansehen und als CSV herunterladen.
// Geschützt mit ADMIN_PASSWORD (Benutzername beliebig). Ohne Passwort ist der Bereich aus.
import crypto from "node:crypto";
import express from "express";

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

export function adminRouter({ store, password }) {
  const r = express.Router();

  r.use((req, res, next) => {
    if (!password) return res.status(404).send("Nicht gefunden.");
    const [scheme, encoded] = (req.get("authorization") || "").split(" ");
    const pass = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":") : "";
    if (pass && sameSecret(pass, password)) return next();
    res.set("WWW-Authenticate", 'Basic realm="Filamour Admin", charset="UTF-8"').status(401).send("Anmeldung nötig.");
  });
  r.use((req, res, next) => { res.set("cache-control", "no-store").set("x-robots-tag", "noindex"); next(); });

  r.get("/newsletter.csv", async (req, res) => {
    res.type("text/csv").attachment("newsletter.csv").send(csv(await store.listNewsletter(), ["email", "created_at"]));
  });
  r.get("/kontakt.csv", async (req, res) => {
    res.type("text/csv").attachment("kontakt.csv").send(csv(await store.listContacts(), ["created_at", "name", "email", "question", "history"]));
  });

  r.get("/", async (req, res) => {
    const [news, contacts] = await Promise.all([store.listNewsletter(), store.listContacts()]);
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
</style></head><body>
<h1>Filamour Admin</h1>
<p class="store">Speicher: ${esc(store.kind)}${store.kind === "postgres" ? "" : " (nicht dauerhaft – DATABASE_URL setzen)"}</p>
<h2>Kontaktanfragen (${contacts.length}) <a href="/admin/kontakt.csv">CSV herunterladen</a></h2>
${contacts.length ? `<table><thead><tr><th>Datum</th><th>Von</th><th>Frage</th></tr></thead><tbody>${contacts.map((c) => `<tr>
  <td class="nowrap">${esc(when(c.created_at))}</td>
  <td>${esc(c.name)}<br><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td>
  <td><div class="q">${esc(c.question) || '<span class="empty">–</span>'}</div>${c.history ? `<details><summary>Chatverlauf</summary><pre>${esc(c.history)}</pre></details>` : ""}</td>
</tr>`).join("")}</tbody></table>` : `<p class="empty">Noch keine Anfragen.</p>`}
<h2>Newsletter (${news.length}) <a href="/admin/newsletter.csv">CSV herunterladen</a></h2>
${news.length ? `<table><thead><tr><th>E-Mail</th><th>Angemeldet</th></tr></thead><tbody>${news.map((n) => `<tr><td>${esc(n.email)}</td><td class="nowrap">${esc(when(n.created_at))}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">Noch keine Anmeldungen.</p>`}
</body></html>`);
  });

  return r;
}
