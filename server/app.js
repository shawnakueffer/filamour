// Der Webserver: liefert den Shop aus public/ und stellt die API bereit.
//   POST /api/checkout    Warenkorb prüfen, Stripe Checkout starten
//   GET  /api/order       Zusammenfassung für die Danke-Seite
//   POST /api/newsletter  Newsletter-Anmeldung
//   POST /api/contact     Kontaktanfrage aus dem Chat
//   GET  /admin           Anmeldungen und Anfragen ansehen (ADMIN_PASSWORD)
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import { validateCart, buildSession, summarizeSession, SESSION_ID } from "./checkout.js";
import { validateNewsletter, validateContact, isBot } from "./forms.js";
import { adminRouter } from "./admin.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const PAGES = { "/": "index.html", "/index.html": "index.html", "/success.html": "success.html", "/rechtliches.html": "rechtliches.html" };

export function createApp({ stripe = null, store = null, mailer = null, adminPassword = "", siteUrl = "", production = false } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Railway steht vor der App; nötig für die echte IP beim Rate-Limit

  const origin = (req) => siteUrl || `${req.protocol}://${req.get("host")}`;

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        "font-src": ["'self'"],
        "connect-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
        ...(production ? { "upgrade-insecure-requests": [] } : {}),
      },
    },
    hsts: production ? { maxAge: 15552000, includeSubDomains: false } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());

  app.get("/healthz", (req, res) => res.set("cache-control", "no-store").json({ ok: true }));

  /* ---------- API ---------- */
  const api = express.Router();
  api.use(express.json({ limit: "64kb" }));
  api.use((req, res, next) => { res.set("cache-control", "no-store"); next(); });
  const limit = (windowMin, max) => rateLimit({
    windowMs: windowMin * 60_000, limit: max, standardHeaders: "draft-8", legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: "Zu viele Anfragen. Bitte warte einen Moment und versuche es dann nochmals." }),
  });

  api.post("/checkout", limit(10, 30), async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Der Shop ist noch nicht mit Stripe verbunden." });
    const cart = validateCart(req.body);
    if (cart.error) return res.status(400).json({ error: cart.error });
    try {
      const session = await stripe.checkout.sessions.create(buildSession(cart.items, origin(req)));
      res.json({ url: session.url });
    } catch (err) {
      console.error("Stripe-Fehler (checkout):", err?.message);
      res.status(502).json({ error: "Die Zahlung konnte gerade nicht gestartet werden. Bitte versuche es in einer Minute nochmals." });
    }
  });

  api.get("/order", limit(10, 60), async (req, res) => {
    const id = String(req.query.session_id || "");
    if (!SESSION_ID.test(id)) return res.status(400).json({ error: "Unbekannte Bestellung." });
    if (!stripe) return res.status(503).json({ error: "Der Shop ist noch nicht mit Stripe verbunden." });
    try {
      res.json(summarizeSession(await stripe.checkout.sessions.retrieve(id, { expand: ["line_items"] })));
    } catch (err) {
      console.error("Stripe-Fehler (order):", err?.message);
      res.status(404).json({ error: "Bestellung nicht gefunden." });
    }
  });

  api.post("/newsletter", limit(10, 8), async (req, res) => {
    if (isBot(req.body)) return res.json({ ok: true });
    const v = validateNewsletter(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    if (!store) return res.status(503).json({ error: "Die Anmeldung ist gerade nicht möglich. Bitte versuch es später nochmals." });
    try {
      await store.addNewsletter(v.email);
      res.json({ ok: true });
    } catch (err) {
      console.error("Newsletter speichern:", err?.message);
      res.status(500).json({ error: "Das hat leider nicht geklappt. Bitte versuch es nochmals." });
    }
  });

  api.post("/contact", limit(10, 8), async (req, res) => {
    if (isBot(req.body)) return res.json({ ok: true });
    const v = validateContact(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const m = v.message;
    // Gespeichert ODER per Mail verschickt reicht – Hauptsache, die Anfrage geht nicht verloren
    let delivered = false;
    if (store) {
      try { await store.addContact(m); delivered = true; } catch (err) { console.error("Kontakt speichern:", err?.message); }
    }
    if (mailer) {
      try {
        await mailer.send({
          subject: `Neue Anfrage von ${m.name || m.email}`,
          replyTo: m.email,
          text: `${m.name ? `Name: ${m.name}\n` : ""}E-Mail: ${m.email}\n\nFrage:\n${m.question || "–"}\n\n--- Chatverlauf ---\n${m.history || "–"}`,
        });
        delivered = true;
      } catch (err) { console.error("Kontakt-Mail:", err?.message); }
    }
    if (!delivered) return res.status(503).json({ error: "Das hat leider nicht geklappt." });
    res.json({ ok: true });
  });

  api.use((req, res) => res.status(404).json({ error: "Nicht gefunden." }));
  api.use((err, req, res, next) => {
    if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") return res.status(400).json({ error: "Ungültige Anfrage." });
    next(err);
  });
  app.use("/api", api);

  app.use("/admin", limit(15, 60), adminRouter({ store, password: adminPassword }));

  /* ---------- Seiten ---------- */
  const raw = new Map();
  async function page(file, req) {
    let html = production ? raw.get(file) : undefined;
    if (!html) { html = await fs.readFile(path.join(PUBLIC, file), "utf8"); raw.set(file, html); }
    return html.replaceAll("{{SITE_URL}}", origin(req));
  }
  app.get(Object.keys(PAGES), async (req, res, next) => {
    try { res.set("cache-control", "no-cache").type("html").send(await page(PAGES[req.path], req)); } catch (e) { next(e); }
  });
  app.get("/robots.txt", (req, res) => res.type("text/plain").send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /success.html\n\nSitemap: ${origin(req)}/sitemap.xml\n`));
  app.get("/sitemap.xml", (req, res) => res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin(req)}/</loc></url>\n  <url><loc>${origin(req)}/rechtliches.html</loc></url>\n</urlset>\n`));

  app.use(express.static(PUBLIC, {
    index: false,
    dotfiles: "ignore",
    setHeaders(res, file) {
      // Schriften und Bilder ändern sich selten; JS/CSS immer frisch prüfen, damit Preise sofort stimmen
      res.set("cache-control", /\.(woff2|jpe?g|png|webp|svg|ico)$/.test(file) ? "public, max-age=2592000" : "no-cache");
    },
  }));

  app.use(async (req, res, next) => {
    try { res.status(404).set("cache-control", "no-cache").type("html").send(await page("404.html", req)); } catch (e) { next(e); }
  });
  app.use((err, req, res, next) => {
    console.error("Serverfehler:", err);
    if (res.headersSent) return next(err);
    res.status(500).type("text/plain").send("Da ist etwas schiefgelaufen. Bitte lade die Seite neu.");
  });

  return app;
}
