// Formulare, Admin-Bereich, Seiten und Sicherheits-Header
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../server/store.js";
import { withServer } from "./helpers.js";

const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("Newsletter: speichert gültige Adressen einmal, lehnt ungültige ab", async () => {
  const store = createMemoryStore();
  await withServer({ store }, async (base) => {
    assert.equal((await post(`${base}/api/newsletter`, { email: "keine-mail" })).status, 400);
    assert.equal((await post(`${base}/api/newsletter`, { email: "Mia@Example.ch " })).status, 200);
    assert.equal((await post(`${base}/api/newsletter`, { email: "mia@example.ch" })).status, 200, "doppelt ist ok");
    assert.equal((await post(`${base}/api/newsletter`, { email: "bot@example.ch", website: "http://spam" })).status, 200, "Bot bekommt ok …");
  });
  const list = await store.listNewsletter();
  assert.deepEqual(list.map((n) => n.email), ["mia@example.ch"], "… wird aber nicht gespeichert");
});

test("Newsletter ohne Datenbank meldet sich sauber", async () => {
  await withServer({}, async (base) => {
    const res = await post(`${base}/api/newsletter`, { email: "mia@example.ch" });
    assert.equal(res.status, 503);
    assert.ok((await res.json()).error);
  });
});

test("Kontakt: speichert und schickt eine Mail mit Antwortadresse", async () => {
  const store = createMemoryStore(), mails = [];
  const mailer = { send: async (m) => { mails.push(m); } };
  await withServer({ store, mailer }, async (base) => {
    assert.equal((await post(`${base}/api/contact`, { email: "" })).status, 400);
    const res = await post(`${base}/api/contact`, { name: "Mia", email: "mia@example.ch", question: "Passt ein Foto 10×15?", history: "Kunde: Hallo" });
    assert.equal(res.status, 200);
  });
  const [c] = await store.listContacts();
  assert.equal(c.question, "Passt ein Foto 10×15?");
  assert.equal(mails[0].replyTo, "mia@example.ch");
  assert.match(mails[0].text, /Passt ein Foto/);
});

test("Kontakt: Mail-Fehler ist egal, solange gespeichert wurde", async () => {
  const store = createMemoryStore();
  const mailer = { send: async () => { throw new Error("down"); } };
  await withServer({ store, mailer }, async (base) => {
    assert.equal((await post(`${base}/api/contact`, { email: "mia@example.ch" })).status, 200);
  });
  await withServer({}, async (base) => {
    assert.equal((await post(`${base}/api/contact`, { email: "mia@example.ch" })).status, 503, "weder Speicher noch Mail");
  });
});

test("Admin: aus ohne Passwort, sonst geschützt, CSV ohne Formel-Injection", async () => {
  await withServer({ store: createMemoryStore() }, async (base) => {
    assert.equal((await fetch(`${base}/admin`)).status, 404);
  });
  const store = createMemoryStore();
  await store.addNewsletter("mia@example.ch");
  await store.addContact({ name: "=HYPERLINK(\"x\")", email: "a@b.ch", question: "<script>alert(1)</script>", history: "" });
  await withServer({ store, adminPassword: "geheim" }, async (base) => {
    const auth = (pw) => ({ headers: { authorization: "Basic " + Buffer.from(`admin:${pw}`).toString("base64") } });
    assert.equal((await fetch(`${base}/admin`)).status, 401);
    assert.equal((await fetch(`${base}/admin`, auth("falsch"))).status, 401);
    const page = await fetch(`${base}/admin`, auth("geheim"));
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /mia@example\.ch/);
    assert.ok(!html.includes("<script>alert"), "HTML wird escaped");
    const csv = await (await fetch(`${base}/admin/kontakt.csv`, auth("geheim"))).text();
    assert.match(csv, /"'=HYPERLINK/);
  });
});

test("Seiten, 404, Sicherheits-Header und SITE_URL", async () => {
  await withServer({ siteUrl: "https://filamour.ch", production: true }, async (base) => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<link rel="canonical" href="https:\/\/filamour\.ch\/">/);
    assert.ok(!html.includes("{{SITE_URL}}"));
    assert.match(html, /<meta name="color-scheme" content="only light">/, "Shop bleibt immer hell");
    assert.match(home.headers.get("content-security-policy"), /script-src 'self'/);
    assert.match(home.headers.get("strict-transport-security"), /max-age/);
    assert.equal(home.headers.get("x-powered-by"), null);

    assert.equal((await fetch(`${base}/catalog.js`)).headers.get("cache-control"), "no-cache");
    assert.match((await fetch(`${base}/fonts/figtree-latin-400-normal.woff2`)).headers.get("cache-control"), /max-age/);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Sitemap: https:\/\/filamour\.ch\/sitemap\.xml/);

    const lost = await fetch(`${base}/gibts/nicht`);
    assert.equal(lost.status, 404);
    assert.match(await lost.text(), /Diese Seite gibt es nicht/);
    assert.equal((await fetch(`${base}/api/gibtsnicht`)).status, 404);
    assert.equal((await fetch(`${base}/../package.json`)).status, 404);
  });
});
