// Speicher für Newsletter-Anmeldungen und Kontaktanfragen.
// Produktion: PostgreSQL (DATABASE_URL, auf Railway ein Klick). Lokal ohne DATABASE_URL: Datei in data/.
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

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
);`;

export async function createPgStore(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5 });
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
    async addContact(m) {
      await pool.query("INSERT INTO contact_messages (name, email, question, history) VALUES ($1, $2, $3, $4)", [m.name, m.email, m.question, m.history]);
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
  const newsletter = [], contacts = [];
  return {
    kind: "memory",
    async addNewsletter(email) {
      if (newsletter.some((n) => n.email === email)) return { created: false };
      newsletter.unshift({ email, created_at: new Date() });
      return { created: true };
    },
    async addContact(m) { contacts.unshift({ ...m, created_at: new Date() }); },
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
    for (const c of saved.contacts.reverse()) await mem.addContact(c);
  } catch {}
  const save = async () => fs.writeFile(file, JSON.stringify({ newsletter: await mem.listNewsletter(), contacts: await mem.listContacts() }, null, 2));
  return {
    ...mem,
    kind: "file",
    async addNewsletter(email) { const r = await mem.addNewsletter(email); await save(); return r; },
    async addContact(m) { await mem.addContact(m); await save(); },
  };
}
