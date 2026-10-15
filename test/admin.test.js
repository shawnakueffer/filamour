// Admin: Bestellungen aus Stripe anzeigen und mit dem Knopf «Verschickt» die Versandbestätigung schicken: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { shippingEmail } from "../server/orders.js";
import { createMemoryStore } from "../server/store.js";
import { withServer } from "./helpers.js";

const SESSION = {
  id: "cs_live_a1b2c3d4e5f6g7h8",
  livemode: true,
  status: "complete",
  payment_status: "paid",
  created: 1791900000,
  amount_total: 2160,
  metadata: { shop: "filamour", artikel: "1", lieferung: "Versand", artikel_1: "1× Bubble Letters «MIA» (3 Teile, Klein 3 cm) – M Sakura Pink · I Ice Blue · A Peanut" },
  customer_details: { name: "Mia Muster", email: "mia@example.ch" },
  collected_information: { shipping_details: { name: "Mia Muster", address: { line1: "Bahnhofstrasse 1", postal_code: "8001", city: "Zürich", country: "CH" } } },
};
const PICKUP = { ...SESSION, id: "cs_live_abholungABHOLUNG", metadata: { ...SESSION.metadata, lieferung: "Abholung" } };
const OTHER = { ...SESSION, id: "cs_live_fremderSHOP0001", metadata: { shop: "anderer" } };

const AUTH = "Basic " + Buffer.from("admin:geheim").toString("base64");

function fakeStripe() {
  const all = [SESSION, PICKUP, OTHER];
  return {
    checkout: { sessions: {
      list: async () => ({ data: all }),
      retrieve: async (id) => { const s = all.find((x) => x.id === id); if (!s) throw new Error("No such checkout.session"); return s; },
    } },
  };
}

function setup() {
  const sent = [];
  const mailer = { fail: false, send: async (m) => { if (mailer.fail) throw new Error("Resend 500"); sent.push(m); } };
  return { sent, mailer, store: createMemoryStore(), stripe: fakeStripe(), adminPassword: "geheim" };
}

// Formular abschicken wie der Browser: mit Anmeldung und Origin der eigenen Seite
const ship = (base, id, tracking = "", origin = base) => fetch(`${base}/admin/bestellungen/${id}/verschickt`, {
  method: "POST", redirect: "manual",
  headers: { authorization: AUTH, origin, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ tracking }).toString(),
});

test("Versandbestätigung: mit und ohne Sendungsnummer, Eingaben werden nicht als HTML ausgeführt", () => {
  const m = shippingEmail(SESSION, { tracking: "99.00.123456.12345678" });
  assert.equal(m.to, "mia@example.ch");
  assert.equal(m.subject, "Deine Filamour-Bestellung ist unterwegs (Nr. E5F6G7H8)");
  assert.match(m.text, /^Hallo Mia/);
  assert.match(m.text, /Sendungsnummer: 99\.00\.123456\.12345678/);
  assert.match(m.text, /«MIA».*\n\nLieferadresse:\nMia Muster\nBahnhofstrasse 1\n8001 Zürich/s);
  assert.match(m.html, /Deine Bestellung ist unterwegs, Mia!/);
  assert.doesNotMatch(shippingEmail(SESSION).text, /Sendungsnummer/);
  const evil = shippingEmail({ ...SESSION, customer_details: { name: "<b>Mia</b>", email: "mia@example.ch" } });
  assert.doesNotMatch(evil.html, /<b>Mia/);
});

const page = async (base, q = "") => (await fetch(`${base}/admin${q}`, { headers: { authorization: AUTH } })).text();

test("Admin: offene Bestellungen aus Stripe mit Knopf, ohne fremde Zahlungen", async () => {
  const opts = setup();
  await withServer(opts, async (base) => {
    const html = await page(base);
    assert.match(html, /Offen<span class="count hot">2<\/span>/);
    assert.match(html, /Nr\. E5F6G7H8/);
    assert.match(html, /action="\/admin\/bestellungen\/cs_live_a1b2c3d4e5f6g7h8\/verschickt"/);
    assert.match(html, /action="\/admin\/bestellungen\/cs_live_abholungABHOLUNG\/abgeholt"/);
    assert.match(html, /class="chip" style="background:#[0-9A-Fa-f]{6};color:#[0-9a-f]{6}">M<\/span>/, "Buchstaben farbig");
    assert.doesNotMatch(html, /SHOP0001/);
    assert.match(await page(base, "?tab=erledigt"), /Noch nichts erledigt/);
  });
});

test("Knopf «Verschickt»: Mail genau einmal, danach unter «Erledigt»", async () => {
  const opts = setup();
  await withServer(opts, async (base) => {
    const res = await ship(base, SESSION.id, "99.00.123456.12345678");
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/admin?verschickt=E5F6G7H8");
    assert.equal(opts.sent.length, 1);
    assert.equal(opts.sent[0].to, "mia@example.ch");
    assert.match(opts.sent[0].text, /99\.00\.123456\.12345678/);

    assert.equal((await ship(base, SESSION.id)).headers.get("location"), "/admin?fehler=schon");
    assert.equal(opts.sent.length, 1, "kein zweites Mal");

    const open = await page(base, "?verschickt=E5F6G7H8");
    assert.match(open, /✓ Bestellung E5F6G7H8 ist verschickt/);
    assert.doesNotMatch(open, /cs_live_a1b2c3d4e5f6g7h8\/verschickt/, "nicht mehr bei den offenen");
    const done = await page(base, "?tab=erledigt");
    assert.match(done, /Nr\. E5F6G7H8/);
    assert.match(done, /✓ Verschickt am/);
  });
});

test("Abholung: als abgeholt erledigen, ohne Mail", async () => {
  const opts = setup();
  await withServer(opts, async (base) => {
    const post = (id) => fetch(`${base}/admin/bestellungen/${id}/abgeholt`, { method: "POST", redirect: "manual", headers: { authorization: AUTH, origin: base } });
    assert.equal((await post(SESSION.id)).headers.get("location"), "/admin?fehler=versand");
    assert.equal((await post(PICKUP.id)).headers.get("location"), "/admin?abgeholt=ABHOLUNG");
    assert.equal((await post(PICKUP.id)).headers.get("location"), "/admin?fehler=schon");
    assert.equal(opts.sent.length, 0);
    assert.match(await page(base, "?tab=erledigt"), /✓ Abgeholt am/);
  });
});

test("Knopf «Verschickt»: Abholung, falsche Nummer, fremde Seite und Mailfehler", async () => {
  const opts = setup();
  await withServer(opts, async (base) => {
    assert.equal((await ship(base, PICKUP.id)).headers.get("location"), "/admin?fehler=abholung");
    assert.equal((await ship(base, OTHER.id)).headers.get("location"), "/admin?fehler=unbekannt");
    assert.equal((await ship(base, "cs_live_gibtsnicht")).headers.get("location"), "/admin?fehler=unbekannt");
    assert.equal((await ship(base, SESSION.id, "<script>")).headers.get("location"), "/admin?fehler=nummer");
    assert.equal((await ship(base, SESSION.id, "", "https://boese.example")).status, 403, "fremde Seite");
    assert.equal(opts.sent.length, 0);

    opts.mailer.fail = true;
    assert.equal((await ship(base, SESSION.id)).headers.get("location"), "/admin?fehler=mail");
    opts.mailer.fail = false;
    assert.equal((await ship(base, SESSION.id)).headers.get("location"), "/admin?verschickt=E5F6G7H8", "nach Fehler nochmals möglich");
    assert.equal(opts.sent.length, 1);

    const noAuth = await fetch(`${base}/admin/bestellungen/${SESSION.id}/verschickt`, { method: "POST", headers: { origin: base } });
    assert.equal(noAuth.status, 401);
  });
});
