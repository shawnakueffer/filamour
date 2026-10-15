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

test("Admin zeigt Bestellungen aus Stripe mit Knopf, ohne fremde Zahlungen", async () => {
  const opts = setup();
  await withServer(opts, async (base) => {
    const html = await (await fetch(`${base}/admin`, { headers: { authorization: AUTH } })).text();
    assert.match(html, /Bestellungen der letzten 60 Tage \(2, 1 noch zu verschicken\)/);
    assert.match(html, /Nr\. E5F6G7H8/);
    assert.match(html, /action="\/admin\/bestellungen\/cs_live_a1b2c3d4e5f6g7h8\/verschickt"/);
    assert.match(html, /Abholung – Termin per E-Mail vereinbaren/);
    assert.doesNotMatch(html, /FREMDERS|0001/);
  });
});

test("Knopf «Verschickt»: Mail genau einmal, danach als verschickt angezeigt", async () => {
  const opts = setup();
  await withServer(opts, async (base) => {
    const res = await ship(base, SESSION.id, "99.00.123456.12345678");
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/admin?verschickt=E5F6G7H8#bestellungen");
    assert.equal(opts.sent.length, 1);
    assert.equal(opts.sent[0].to, "mia@example.ch");
    assert.match(opts.sent[0].text, /99\.00\.123456\.12345678/);

    assert.equal((await ship(base, SESSION.id)).headers.get("location"), "/admin?fehler=schon#bestellungen");
    assert.equal(opts.sent.length, 1, "kein zweites Mal");

    const html = await (await fetch(`${base}/admin?verschickt=E5F6G7H8`, { headers: { authorization: AUTH } })).text();
    assert.match(html, /✓ Bestellung E5F6G7H8 ist als verschickt gemeldet/);
    assert.match(html, /✓ Verschickt am/);
    assert.doesNotMatch(html, /noch zu verschicken/);
  });
});

test("Knopf «Verschickt»: Abholung, falsche Nummer, fremde Seite und Mailfehler", async () => {
  const opts = setup();
  await withServer(opts, async (base) => {
    assert.equal((await ship(base, PICKUP.id)).headers.get("location"), "/admin?fehler=abholung#bestellungen");
    assert.equal((await ship(base, OTHER.id)).headers.get("location"), "/admin?fehler=unbekannt#bestellungen");
    assert.equal((await ship(base, "cs_live_gibtsnicht")).headers.get("location"), "/admin?fehler=unbekannt#bestellungen");
    assert.equal((await ship(base, SESSION.id, "<script>")).headers.get("location"), "/admin?fehler=nummer#bestellungen");
    assert.equal((await ship(base, SESSION.id, "", "https://boese.example")).status, 403, "fremde Seite");
    assert.equal(opts.sent.length, 0);

    opts.mailer.fail = true;
    assert.equal((await ship(base, SESSION.id)).headers.get("location"), "/admin?fehler=mail#bestellungen");
    opts.mailer.fail = false;
    assert.equal((await ship(base, SESSION.id)).headers.get("location"), "/admin?verschickt=E5F6G7H8#bestellungen", "nach Fehler nochmals möglich");
    assert.equal(opts.sent.length, 1);

    const noAuth = await fetch(`${base}/admin/bestellungen/${SESSION.id}/verschickt`, { method: "POST", headers: { origin: base } });
    assert.equal(noAuth.status, 401);
  });
});
