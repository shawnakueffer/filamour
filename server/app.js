// Der Webserver: liefert den Shop aus public/ und stellt die API bereit.
//   POST /api/checkout    Warenkorb prüfen, Stripe Checkout starten
//   GET  /api/order       Zusammenfassung für die Danke-Seite
//   POST /api/stripe-webhook  Stripe meldet bezahlte Bestellungen → E-Mails an Kundschaft und Shop
//   POST /api/newsletter  Newsletter-Anmeldung (mit Brevo: Double-Opt-in, sonst eigene Datenbank)
//   POST /api/contact     Kontaktanfrage aus dem Chat
//   GET  /admin           Bestellungen (Knopf «Verschickt»), Anmeldungen und Anfragen (ADMIN_PASSWORD)
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import { validateCart, buildSession, summarizeSession, SESSION_ID } from "./checkout.js";
import { validateNewsletter, validateContact, isBot } from "./forms.js";
import { orderEmails } from "./orders.js";
import { adminRouter } from "./admin.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const PAGES = { "/": "index.html", "/index.html": "index.html", "/success.html": "success.html", "/rechtliches.html": "rechtliches.html" };

export function createApp({ stripe = null, store = null, mailer = null, brevo = null, webhookSecret = "", adminPassword = "", siteUrl = "", production = false, redirectToSiteUrl = false } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Railway steht vor der App; nötig für die echte IP beim Rate-Limit

  const origin = (req) => siteUrl || `${req.protocol}://${req.get("host")}`;

  // Nur eine Adresse: www.filamour.ch und die Railway-Adresse leiten auf siteUrl um.
  // Sonst hätte jede Adresse ihren eigenen Warenkorb (localStorage). Healthcheck und Stripe-Webhook nie umleiten.
  if (redirectToSiteUrl && siteUrl) {
    const host = new URL(siteUrl).host;
    app.use((req, res, next) => {
      if (req.get("host") === host || req.path === "/healthz" || req.path === "/api/stripe-webhook") return next();
      res.redirect(301, siteUrl + req.originalUrl);
    });
  }

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
  // Stripe-Webhook: braucht den unveränderten Body für die Signaturprüfung, darum vor express.json()
  api.post("/stripe-webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    if (!stripe || !webhookSecret) return res.status(503).json({ error: "Webhook ist nicht eingerichtet." });
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature") || "", webhookSecret);
    } catch (err) {
      console.warn("Stripe-Webhook mit ungültiger Signatur:", err?.message);
      return res.status(400).json({ error: "Ungültige Signatur." });
    }
    const obj = event.data?.object;
    // «no_payment_required» = mit Gutschein ganz gratis, gilt ebenfalls als bezahlt
    const paid = (event.type === "checkout.session.completed" && obj?.payment_status && obj.payment_status !== "unpaid")
      || event.type === "checkout.session.async_payment_succeeded";
    if (!paid || obj?.metadata?.shop !== "filamour") return res.json({ received: true });

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(obj.id, { expand: ["line_items"] });
    } catch (err) {
      console.error("Stripe-Fehler (webhook):", err?.message);
      return res.status(500).json({ error: "Bestellung nicht lesbar." }); // Stripe versucht es später nochmals
    }
    if (!mailer) {
      console.warn(`Bestellung ${obj.id} bezahlt, aber keine E-Mail verschickt (RESEND_API_KEY, MAIL_FROM, NOTIFY_EMAIL fehlen).`);
      return res.json({ received: true });
    }
    // Jede Mail für sich: scheitert eine, kommt die andere trotzdem an.
    // Mit Datenbank wird jede Mail nur einmal verschickt; eine gescheiterte schickt der nächste Versuch von Stripe.
    const { toCustomer, toShop } = orderEmails(session, { siteUrl: origin(req) });
    let retry = false;
    for (const [kind, mail] of [["shop", toShop], ["kundschaft", toCustomer]]) {
      if (!mail) continue;
      try {
        if (store && !(await store.claimOrderMail(session.id, kind))) continue;
      } catch (err) {
        console.error(`Bestell-Mail (${obj.id}): Datenbank nicht erreichbar:`, err?.message);
        retry = true; continue;
      }
      try {
        await mailer.send(mail);
      } catch (err) {
        console.error(`Bestell-Mail an ${kind} (${obj.id}):`, err?.message);
        if (store) { retry = true; await store.releaseOrderMail(session.id, kind).catch(() => {}); }
      }
    }
    if (retry) return res.status(500).json({ error: "Nicht alle Mails verschickt." }); // Stripe versucht es später nochmals
    res.json({ received: true });
  });

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
    if (isBot(req.body)) return res.json({ ok: true, confirm: Boolean(brevo) });
    const v = validateNewsletter(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    // Brevo schickt die Bestätigungsmail; nach dem Klick geht es zurück auf den Shop, dort erscheint der Code
    if (brevo) {
      try {
        await brevo.subscribe(v.email, `${origin(req)}/?newsletter=bestaetigt#newsletter`);
        return res.json({ ok: true, confirm: true });
      } catch (err) {
        console.error("Brevo-Fehler (newsletter):", err?.message);
        return res.status(502).json({ error: "Das hat leider nicht geklappt. Bitte versuch es in einer Minute nochmals." });
      }
    }
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
          subject: `Neue Anfrage von ${(m.name || m.email).replace(/[\r\n]+/g, " ")}`,
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

  // Admin: höchstens 10 falsche Passwörter pro 15 Minuten und IP, erfolgreiche Aufrufe zählen nicht
  const adminLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true, standardHeaders: "draft-8", legacyHeaders: false });
  app.use("/admin", limit(15, 60), adminLimit, adminRouter({ store, password: adminPassword, newsletterInBrevo: Boolean(brevo), stripe, mailer, siteUrl }));

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
      res.set("cache-control", /\.(woff2|jpe?g|png|webp|svg|ico|mp4)$/.test(file) ? "public, max-age=2592000" : "no-cache");
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
