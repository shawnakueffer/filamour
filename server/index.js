// Startpunkt: liest die Umgebungsvariablen und startet den Server (npm start).
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { createApp } from "./app.js";
import { createPgStore, createFileStore } from "./store.js";
import { createMailer } from "./mail.js";

const env = process.env;
const production = env.NODE_ENV === "production" || Boolean(env.RAILWAY_ENVIRONMENT);
const port = Number(env.PORT) || 3000;

// Öffentliche Adresse: eigene Domain (PUBLIC_URL) > Railway-Domain > aus der Anfrage
const siteUrl = (env.PUBLIC_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : "")).replace(/\/+$/, "");

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

const app = createApp({ stripe, store, mailer, adminPassword: env.ADMIN_PASSWORD || "", siteUrl, production });
const server = app.listen(port, () => console.log(`Filamour läuft auf ${siteUrl || `http://localhost:${port}`}`));

// Railway beendet alte Versionen mit SIGTERM: laufende Anfragen fertig machen, dann schliessen
const shutdown = () => {
  server.close(async () => { await store?.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 8000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
