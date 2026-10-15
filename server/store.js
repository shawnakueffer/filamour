// Speicher für Newsletter-Anmeldungen, Kontaktanfragen und verschickte Bestellmails.
// Produktion: PostgreSQL (DATABASE_URL, auf Railway ein Klick). Lokal ohne DATABASE_URL: Datei in data/.
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

// Kontaktanfragen und Einträge zum Mailversand werden nach dieser Frist gelöscht (steht so in der Datenschutzerklärung)
export const RETENTION_MONTHS = 12;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS newsletter_signups (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contact_messages (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL,
  question   TEXT NOT NULL DEFAULT '',
  history    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_mails (
  session_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, kind)
);`;

export async function createPgStore(connectionString) {
  // Timeouts, damit eine hängende Datenbank keine Anfrage endlos blockiert
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  pool.on("error", (err) => console.error("Postgres:", err.message));
  // Railways internes Netzwerk ist direkt nach dem Start manchmal noch nicht bereit
  for (let attempt = 1; ; attempt++) {
    try { await pool.query(SCHEMA); break; } catch (err) {
      if (attempt >= 6) throw err;
      console.warn(`Datenbank noch nicht erreichbar (${err.message}), neuer Versuch …`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return {
    kind: "postgres",
    async addNewsletter(email) {
      const r = await pool.query("INSERT INTO newsletter_signups (email) VALUES ($1) ON CONFLICT (email) DO NOTHING", [email]);
      return { created: r.rowCount === 1 };
    },
    // Stripe kann ein Ereignis mehrfach schicken: true nur beim ersten Mal, dann wird die Mail verschickt
    async claimOrderMail(sessionId, kind) {
      const r = await pool.query("INSERT INTO order_mails (session_id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING", [sessionId, kind]);
      return r.rowCount === 1;
    },
    // Versand gescheitert: wieder freigeben, damit der nächste Versuch von Stripe die Mail schickt
    async releaseOrderMail(sessionId, kind) {
      await pool.query("DELETE FROM order_mails WHERE session_id = $1 AND kind = $2", [sessionId, kind]);
    },
    // Zeitpunkt pro Bestellung, z. B. kind «versand» → wann die Versandbestätigung rausging
    async orderMailTimes(kind) {
      const r = await pool.query("SELECT session_id, sent_at FROM order_mails WHERE kind = $1", [kind]);
      return new Map(r.rows.map((row) => [row.session_id, row.sent_at]));
    },
    async addContact(m) {
      await pool.query("INSERT INTO contact_messages (name, email, question, history) VALUES ($1, $2, $3, $4)", [m.name, m.email, m.question, m.history]);
    },
    async purgeOld() {
      const cutoff = `${RETENTION_MONTHS} months`;
      const c = await pool.query("DELETE FROM contact_messages WHERE created_at < now() - $1::interval", [cutoff]);
      const o = await pool.query("DELETE FROM order_mails WHERE sent_at < now() - $1::interval", [cutoff]);
      return { contacts: c.rowCount, orderMails: o.rowCount };
    },
    async listNewsletter() {
      return (await pool.query("SELECT email, created_at FROM newsletter_signups ORDER BY created_at DESC")).rows;
    },
    async listContacts() {
      return (await pool.query("SELECT name, email, question, history, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 500")).rows;
    },
    async ping() { await pool.query("SELECT 1"); },
    close: () => pool.end(),
  };
}

// Nur für Tests und lokales Ausprobieren
export function createMemoryStore() {
  const newsletter = [], contacts = [], orderMails = new Map(); // Schlüssel → Zeitpunkt
  const cutoff = () => { const d = new Date(); d.setMonth(d.getMonth() - RETENTION_MONTHS); return d; };
  return {
    kind: "memory",
    async addNewsletter(email) {
      if (newsletter.some((n) => n.email === email)) return { created: false };
      newsletter.unshift({ email, created_at: new Date() });
      return { created: true };
    },
    async claimOrderMail(sessionId, kind, at = new Date()) {
      const key = `${sessionId} ${kind}`;
      if (orderMails.has(key)) return false;
      orderMails.set(key, at);
      return true;
    },
    async releaseOrderMail(sessionId, kind) { orderMails.delete(`${sessionId} ${kind}`); },
    async orderMailTimes(kind) {
      const out = new Map();
      for (const [key, at] of orderMails) { const [id, k] = key.split(" "); if (k === kind) out.set(id, at); }
      return out;
    },
    async addContact(m) { contacts.unshift({ ...m, created_at: m.created_at || new Date() }); },
    async purgeOld() {
      const limit = cutoff();
      const before = contacts.length;
      contacts.splice(0, contacts.length, ...contacts.filter((c) => c.created_at >= limit));
      let orderMailsRemoved = 0;
      for (const [key, at] of orderMails) if (at < limit) { orderMails.delete(key); orderMailsRemoved++; }
      return { contacts: before - contacts.length, orderMails: orderMailsRemoved };
    },
    async listNewsletter() { return newsletter; },
    async listContacts() { return contacts; },
    async ping() {},
    async close() {},
  };
}

// Lokal: übersteht Neustarts, damit man Formulare ausprobieren kann
export async function createFileStore(dir) {
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "submissions.json");
  const mem = createMemoryStore();
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    for (const n of saved.newsletter.reverse()) await mem.addNewsletter(n.email);
    for (const c of saved.contacts.reverse()) await mem.addContact({ ...c, created_at: new Date(c.created_at) });
  } catch {}
  const save = async () => fs.writeFile(file, JSON.stringify({ newsletter: await mem.listNewsletter(), contacts: await mem.listContacts() }, null, 2));
  return {
    ...mem,
    kind: "file",
    async addNewsletter(email) { const r = await mem.addNewsletter(email); await save(); return r; },
    async addContact(m) { await mem.addContact(m); await save(); },
    async purgeOld() { const r = await mem.purgeOld(); await save(); return r; },
  };
}
