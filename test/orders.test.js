// E-Mails nach einer bezahlten Bestellung (Stripe-Webhook), ohne echtes Stripe- oder Resend-Konto: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { orderEmails } from "../server/orders.js";
import { createMailer } from "../server/mail.js";
import { createMemoryStore } from "../server/store.js";
import { withServer } from "./helpers.js";

const SECRET = "whsec_test_geheim";
const { webhooks } = new Stripe("sk_test_x");

const SESSION = {
  id: "cs_test_a1b2c3d4e5f6g7h8",
  livemode: false,
  payment_status: "paid",
  amount_subtotal: 1460,
  amount_total: 2160,
  shipping_cost: { amount_total: 700 },
  total_details: { amount_discount: 0 },
  metadata: {
    shop: "filamour", artikel: "2", lieferung: "Versand",
    artikel_1: "1× Bubble Letters «MIA» (3 Teile, Klein 2,5 cm) – M Sakura Pink · I Ice Blue · A Peanut",
    artikel_2: "1× Fotorahmen Wellen – Sakura Pink",
  },
  customer_details: { name: "Mia Muster", email: "mia@example.ch", phone: null },
  collected_information: { shipping_details: { name: "Mia Muster", address: { line1: "Bahnhofstrasse 1", line2: null, postal_code: "8001", city: "Zürich", country: "CH" } } },
  custom_fields: [{ key: "bemerkung", text: { value: "Bitte als Geschenk verpacken" } }],
  line_items: { data: [{ amount_total: 870, quantity: 1 }, { amount_total: 1900, quantity: 1 }] },
};

test("Mit Rabatt: Artikel zum vollen Preis, Rabatt als eigene Zeile", () => {
  const { toCustomer } = orderEmails({
    ...SESSION, amount_subtotal: 2770, amount_total: 3193, total_details: { amount_discount: 277 },
    line_items: { data: [{ amount_subtotal: 870, amount_total: 783 }, { amount_subtotal: 1900, amount_total: 1710 }] },
  });
  assert.match(toCustomer.text, /Klein 2,5 cm\) – M Sakura Pink · I Ice Blue · A Peanut\n  CHF 8\.70/);
  assert.match(toCustomer.text, /Zwischensumme: CHF 27\.70\nRabatt: −CHF 2\.77/);
});

test("Bestell-Mails enthalten Artikel, Farben, Adresse und Bemerkung", () => {
  const { toCustomer, toShop } = orderEmails(SESSION);
  assert.equal(toCustomer.to, "mia@example.ch");
  assert.equal(toCustomer.subject, "Danke für deine Bestellung bei Filamour (Nr. E5F6G7H8)");
  assert.match(toCustomer.text, /^Hallo Mia/);
  assert.match(toCustomer.text, /«MIA» \(3 Teile, Klein 2,5 cm\) – M Sakura Pink · I Ice Blue · A Peanut\n  CHF 8\.70/);
  assert.match(toCustomer.text, /Total: CHF 21\.60/);
  assert.match(toCustomer.text, /Bahnhofstrasse 1\n8001 Zürich/);
  assert.match(toCustomer.text, /Geschenk verpacken/);
  assert.match(toCustomer.html, /^<!doctype html>/);
  assert.match(toCustomer.html, /Danke für deine Bestellung, Mia!/);
  assert.match(toCustomer.html, /background:#F1B3C5;color:#1c191a;[^>]*>M<\/span>/, "M in Sakura Pink");
  assert.match(toCustomer.html, /Bahnhofstrasse 1<br>8001 Zürich/);

  assert.equal(toShop.to, undefined, "geht an NOTIFY_EMAIL");
  assert.equal(toShop.replyTo, "mia@example.ch");
  assert.equal(toShop.subject, "Neue Bestellung E5F6G7H8: CHF 21.60 [TEST]");
  assert.match(toShop.text, /Fotorahmen Wellen – Sakura Pink/);
  assert.match(toShop.text, /dashboard\.stripe\.com\/test\/checkout\/sessions\/cs_test_/);
  assert.equal(toShop.html, undefined, "nur Text, gestaltet landete sie bei Hostinger im Spam");
});

test("Gestaltete Mail: Eingaben der Kundschaft werden nicht als HTML ausgeführt", () => {
  const { toCustomer } = orderEmails({
    ...SESSION,
    customer_details: { name: "<b>Mia</b>", email: "mia@example.ch" },
    custom_fields: [{ key: "bemerkung", text: { value: "<script>alert(1)</script>" } }],
  });
  assert.doesNotMatch(toCustomer.html, /<script>|<b>Mia/);
  assert.match(toCustomer.html, /&lt;script&gt;/);
});

test("Abholung: Hinweis statt Adresse, lange Artikel werden wieder zusammengesetzt", () => {
  const { toCustomer, toShop } = orderEmails({
    ...SESSION, livemode: true, collected_information: null,
    metadata: { shop: "filamour", artikel: "1", lieferung: "Abholung", artikel_1_1: "1× Wandbild «MY ", artikel_1_2: "HAPPY PLACE» – Bordeaux" },
    line_items: { data: [{ amount_total: 3950, quantity: 1 }] },
  });
  assert.match(toCustomer.text, /Wandbild «MY HAPPY PLACE» – Bordeaux/);
  assert.match(toCustomer.text, /nur zur Abholung/);
  assert.doesNotMatch(toCustomer.text, /Lieferadresse/);
  assert.equal(toShop.subject, "Neue Bestellung E5F6G7H8: CHF 21.60 (Abholung)");
});

async function sendWebhook(base, event, secret = SECRET) {
  const payload = JSON.stringify(event);
  return fetch(`${base}/api/stripe-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": webhooks.generateTestHeaderString({ payload, secret }) },
    body: payload,
  });
}

test("Webhook: bezahlte Bestellung schickt je eine Mail an Shop und Kundschaft", async () => {
  const mails = [];
  const stripe = { webhooks, checkout: { sessions: { retrieve: async (id, opts) => { assert.deepEqual(opts, { expand: ["line_items"] }); return { ...SESSION, id }; } } } };
  const mailer = { send: async (m) => { mails.push(m); } };
  const event = (type, object) => ({ id: "evt_1", type, data: { object } });
  await withServer({ stripe, mailer, webhookSecret: SECRET }, async (base) => {
    assert.equal((await sendWebhook(base, event("checkout.session.completed", SESSION), "whsec_falsch")).status, 400, "falsche Signatur");
    assert.equal(mails.length, 0);

    assert.equal((await sendWebhook(base, event("checkout.session.completed", { ...SESSION, payment_status: "unpaid" }))).status, 200);
    assert.equal(mails.length, 0, "noch nicht bezahlt → keine Mail");

    assert.equal((await sendWebhook(base, event("checkout.session.completed", { ...SESSION, metadata: { shop: "anderer" } }))).status, 200);
    assert.equal(mails.length, 0, "fremde Zahlung → keine Mail");

    assert.equal((await sendWebhook(base, event("checkout.session.completed", SESSION))).status, 200);
    assert.deepEqual(mails.map((m) => m.to), [undefined, "mia@example.ch"]);
  });
});

test("Webhook ohne Schlüssel ist aus", async () => {
  await withServer({ stripe: { webhooks } }, async (base) => {
    assert.equal((await sendWebhook(base, { type: "checkout.session.completed", data: { object: SESSION } })).status, 503);
  });
});

test("Mails an die Kundschaft: Antworten gehen an den Shop", async () => {
  const sent = [];
  const fetchImpl = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true }; };
  const mailer = createMailer({ apiKey: "re_x", from: "Filamour <shop@filamour.ch>", to: "hello@filamour.ch", fetchImpl });
  await mailer.send({ to: "mia@example.ch", subject: "a", text: "b" });
  await mailer.send({ subject: "c", text: "d", replyTo: "mia@example.ch" });
  assert.deepEqual(sent.map((m) => [m.to[0], m.reply_to]), [["mia@example.ch", "hello@filamour.ch"], ["hello@filamour.ch", "mia@example.ch"]]);
});

test("Webhook: jede Mail nur einmal, gescheiterte beim nächsten Versuch von Stripe", async () => {
  const store = createMemoryStore(), sent = [];
  let failShop = true;
  const mailer = { send: async (m) => { if (!m.to && failShop) throw new Error("Resend 500"); sent.push(m.to || "shop"); } };
  const stripe = { webhooks, checkout: { sessions: { retrieve: async (id) => ({ ...SESSION, id }) } } };
  const event = { id: "evt_1", type: "checkout.session.completed", data: { object: SESSION } };
  await withServer({ stripe, mailer, store, webhookSecret: SECRET }, async (base) => {
    assert.equal((await sendWebhook(base, event)).status, 500, "Shop-Mail gescheitert → Stripe soll es nochmals versuchen");
    assert.deepEqual(sent, ["mia@example.ch"]);
    failShop = false;
    assert.equal((await sendWebhook(base, event)).status, 200);
    assert.deepEqual(sent, ["mia@example.ch", "shop"], "nur die fehlende Mail kommt dazu");
    assert.equal((await sendWebhook(base, event)).status, 200);
    assert.equal(sent.length, 2, "doppeltes Ereignis → keine weitere Mail");
  });
});

test("Webhook: Gratis-Bestellung und spät bestätigte Zahlung schicken Mails, Stripe-Fehler → 500", async () => {
  const sent = [];
  const mailer = { send: async (m) => { sent.push(m.to || "shop"); } };
  let failRetrieve = false;
  const stripe = { webhooks, checkout: { sessions: { retrieve: async (id) => { if (failRetrieve) throw new Error("down"); return { ...SESSION, id }; } } } };
  await withServer({ stripe, mailer, webhookSecret: SECRET }, async (base) => {
    await sendWebhook(base, { type: "checkout.session.completed", data: { object: { ...SESSION, id: "cs_test_gratis", payment_status: "no_payment_required" } } });
    assert.equal(sent.length, 2, "100-%-Gutschein");
    await sendWebhook(base, { type: "checkout.session.async_payment_succeeded", data: { object: { ...SESSION, id: "cs_test_spaet", payment_status: "paid" } } });
    assert.equal(sent.length, 4);
    failRetrieve = true;
    assert.equal((await sendWebhook(base, { type: "checkout.session.completed", data: { object: SESSION } })).status, 500);
  });
});
