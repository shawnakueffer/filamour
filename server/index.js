// Startpunkt: liest die Umgebungsvariablen und startet den Server (npm start).
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { createApp } from "./app.js";
import { createPgStore, createFileStore } from "./store.js";
import { createMailer } from "./mail.js";
import { createBrevo } from "./brevo.js";

const env = process.env;
const production = env.NODE_ENV === "production" || Boolean(env.RAILWAY_ENVIRONMENT);
const port = Number(env.PORT) || 3000;

// Öffentliche Adresse: eigene Domain (PUBLIC_URL) > Railway-Domain > aus der Anfrage
const siteUrl = (env.PUBLIC_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : "")).replace(/\/+$/, "");
// Ohne feste Adresse würden Rücksprung-Links zu Stripe und Brevo aus der Anfrage gebaut – online nicht zulassen
if (production && !siteUrl) {
  console.error("✗ PUBLIC_URL fehlt. In Railway PUBLIC_URL=https://filamour.ch setzen.");
  process.exit(1);
}
if (production && (env.ADMIN_PASSWORD || "").length > 0 && env.ADMIN_PASSWORD.length < 16) console.warn("⚠ ADMIN_PASSWORD ist kurz. Besser mindestens 16 Zeichen.");

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20_000 }) : null;
if (!stripe) console.warn("⚠ STRIPE_SECRET_KEY fehlt – die Kasse ist ausgeschaltet.");
else if (production && env.STRIPE_SECRET_KEY.startsWith("sk_test_")) console.warn("ℹ Stripe läuft im Testmodus (sk_test_…).");

let store = null;
if (env.DATABASE_URL) {
  store = await createPgStore(env.DATABASE_URL);
  console.log("✓ Datenbank verbunden.");
} else if (!production) {
  store = await createFileStore(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data"));
  console.log("ℹ Keine DATABASE_URL – Formulare werden lokal in data/ gespeichert.");
} else {
  console.warn("⚠ DATABASE_URL fehlt – Newsletter-Anmeldungen sind ausgeschaltet. Auf Railway eine PostgreSQL-Datenbank hinzufügen.");
}

const mailer = createMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM, to: env.NOTIFY_EMAIL });
if (!mailer) console.log("ℹ Keine E-Mail-Benachrichtigung (RESEND_API_KEY, MAIL_FROM, NOTIFY_EMAIL).");
if (!env.ADMIN_PASSWORD) console.log("ℹ ADMIN_PASSWORD fehlt – /admin ist ausgeschaltet.");

const brevo = createBrevo({ apiKey: env.BREVO_API_KEY, listId: env.BREVO_LIST_ID, templateId: env.BREVO_DOI_TEMPLATE_ID });
console.log(brevo ? "✓ Newsletter über Brevo (Double-Opt-in)." : "ℹ Kein Brevo (BREVO_API_KEY, BREVO_LIST_ID, BREVO_DOI_TEMPLATE_ID) – Newsletter-Anmeldungen landen in der Datenbank.");

const webhookSecret = env.STRIPE_WEBHOOK_SECRET || "";
if (stripe && !webhookSecret) console.log("ℹ STRIPE_WEBHOOK_SECRET fehlt – nach Bestellungen gehen keine E-Mails raus.");

// Löschfrist: beim Start und danach täglich alte Kontaktanfragen und Mail-Einträge entfernen
async function purge() {
  try {
    const r = await store?.purgeOld();
    if (r && (r.contacts || r.orderMails)) console.log(`Gelöscht (älter als 12 Monate): ${r.contacts} Kontaktanfragen, ${r.orderMails} Mail-Einträge.`);
  } catch (err) { console.error("Löschen alter Daten:", err?.message); }
}
purge();
setInterval(purge, 24 * 60 * 60_000).unref();

const app = createApp({ stripe, store, mailer, brevo, webhookSecret, adminPassword: env.ADMIN_PASSWORD || "", siteUrl, production, redirectToSiteUrl: production && Boolean(env.PUBLIC_URL) });
const server = app.listen(port, () => console.log(`Filamour läuft auf ${siteUrl || `http://localhost:${port}`}`));

// Railway beendet alte Versionen mit SIGTERM: laufende Anfragen fertig machen, dann schliessen
let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  server.close(async () => { await store?.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 8000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
