// Prüft Warenkorb-Validierung und die Anfrage an Stripe, ohne echtes Stripe-Konto: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCart, buildSession, summarizeSession } from "../server/checkout.js";
import { isPickup } from "../public/catalog.js";
import { withServer } from "./helpers.js";

const HALLO_MIA = ["pt-sakura", "bm-ice", "pt-white", "pt-peanut", "bm-ice", "pt-sakura", "pt-white", "pt-peanut", "bl-magenta"];

test("Warenkorb wird geprüft", () => {
  assert.equal(validateCart({ items: [] }).error, "Der Warenkorb ist leer.");
  assert.equal(validateCart({}).error, "Der Warenkorb ist leer.");
  assert.match(validateCart({ items: [{ text: "AB", colors: ["x", "y"], qty: 1 }] }).error, /Farbe/);
  assert.match(validateCart({ items: [{ text: "AB", colors: ["bl-red", "bl-red"], qty: 99 }] }).error, /Menge/);
  assert.match(validateCart({ items: [{ text: "AB", colors: ["bl-red", "bl-red"], qty: 0 }] }).error, /Menge/);
  assert.match(validateCart({ items: [{ text: "123", colors: [], qty: 1 }] }).error, /keine bestellbaren/);
  assert.match(validateCart({ items: [{ type: "poster", variant: "gibtsnicht", qty: 1 }] }).error, /Wandbild/);
  assert.match(validateCart({ items: [{ type: "frame", style: "wave", color: "x", qty: 1 }] }).error, /Fotorahmen/);
  assert.match(validateCart({ items: [{ type: "gutschein", qty: 1 }] }).error, /Unbekannt/);
  assert.match(validateCart({ items: Array(21).fill({ type: "poster", variant: "happy", qty: 1 }) }).error, /Maximal/);
});

test("Preis kommt vom Server, nicht vom Browser", () => {
  const ok = validateCart({ items: [{ text: "Hallo Mia", colors: HALLO_MIA, qty: 2, price: 1, unit: 1 }] });
  assert.match(ok.items[0].name, /\(8 Teile, /, "Leerzeichen zählt nicht");
  assert.equal(ok.items[0].unit, 8 * 490, "CHF 4.90 pro Buchstabe");
});

test("Kleine Buchstaben kosten CHF 2.90, ohne Grösse gilt gross", () => {
  const item = { text: "MIA", colors: ["bl-red", "bl-red", "bl-red"], qty: 1 };
  const big = validateCart({ items: [item] }).items[0];
  assert.equal(big.unit, 3 * 490);
  assert.equal(big.name, "Bubble Letters «MIA» (3 Teile, Gross 6,5 cm)");
  assert.equal(validateCart({ items: [{ ...item, size: "gross" }] }).items[0].unit, 3 * 490);
  const small = validateCart({ items: [{ ...item, size: "klein", price: 1 }] }).items[0];
  assert.equal(small.unit, 3 * 290);
  assert.equal(small.name, "Bubble Letters «MIA» (3 Teile, Klein 2,5 cm)");
  assert.match(validateCart({ items: [{ ...item, size: "riesig" }] }).error, /Grösse/);
  assert.match(validateCart({ items: [{ ...item, size: "__proto__" }] }).error, /Grösse/);
});

test("Neue Farben sind bestellbar", () => {
  const ok = validateCart({ items: [{ text: "MIA", colors: ["es-matcha", "sp-flamingo", "pm-purple"], qty: 1 }] });
  assert.equal(ok.items[0].description, "M Matcha Green · I Flamingo Red · A Muted Purple");
  assert.equal(validateCart({ items: [{ type: "frame", style: "wave", color: "sp-lemon", qty: 1 }] }).items[0].description, "Lemon Cream");
});

test("Nicht druckbare Zeichen landen nicht im Produktnamen", () => {
  const ok = validateCart({ items: [{ text: "Leo 2<b>", colors: ["bl-red", "bl-red", "bl-red", "bl-red", "bl-red", "bl-red", "bl-red", "bl-red"], qty: 1 }] });
  assert.equal(ok.items[0].name, "Bubble Letters «LEO B» (4 Teile, Gross 6,5 cm)");
});

test("Gratisversand ab der Grenze, sonst Versandkosten", () => {
  const small = buildSession(validateCart({ items: [{ text: "AB", colors: ["bl-red", "bl-red"], qty: 1 }] }).items, "https://x.ch");
  assert.equal(small.shipping_options[0].shipping_rate_data.fixed_amount.amount, 700, "Versand CHF 7");
  const big = buildSession(validateCart({ items: [{ type: "frame", style: "wave", color: "bl-red", qty: 4 }] }).items, "https://x.ch");
  assert.equal(big.shipping_options[0].shipping_rate_data.fixed_amount.amount, 0, "ab CHF 60 gratis");
});

test("Wandbild: ganze Bestellung wird abgeholt, ohne Adresse und Versandkosten", () => {
  assert.equal(isPickup([{ type: "letters" }, { type: "frame" }]), false);
  assert.equal(isPickup([{ type: "letters" }, { type: "poster" }]), true);
  assert.equal(isPickup([{ type: "__proto__" }, { type: "constructor" }]), false);
  const s = buildSession(validateCart({ items: [
    { text: "AB", colors: ["bl-red", "bl-red"], qty: 1 },
    { type: "poster", variant: "happy", qty: 1 },
  ] }).items, "https://x.ch");
  assert.equal(s.line_items[1].price_data.unit_amount, 3950);
  assert.equal(s.shipping_address_collection, undefined, "keine Lieferadresse");
  assert.equal(s.shipping_options, undefined, "keine Versandkosten");
  assert.match(s.custom_text.submit.message, /Abholung/);
  assert.equal(s.metadata.lieferung, "Abholung");
  assert.equal(summarizeSession({ id: "cs_test_x", metadata: s.metadata }).pickup, true);
});

test("POST /api/checkout erstellt die Stripe-Session mit Server-Preisen", async () => {
  let sent;
  const stripe = { checkout: { sessions: { create: async (params) => { sent = params; return { url: "https://checkout.stripe.com/c/pay/cs_test_123" }; } } } };
  await withServer({ stripe, siteUrl: "https://filamour.ch" }, async (base) => {
    const res = await fetch(`${base}/api/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [
        { text: "HALLO MIA", colors: HALLO_MIA, qty: 2 },
        { text: "LEO!", colors: ["pt-sapph", "bl-yellow", "bl-green", "bl-red"], qty: 1 },
        { type: "frame", style: "dots", color: "pt-sakura", qty: 2 },
      ] }),
    });
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.equal(data.url, "https://checkout.stripe.com/c/pay/cs_test_123");
  });
  const li = sent.line_items;
  assert.equal(sent.mode, "payment");
  assert.equal(sent.allow_promotion_codes, true);
  assert.equal(li[0].price_data.unit_amount, 3920);
  assert.equal(li[0].quantity, 2);
  assert.equal(li[0].price_data.currency, "chf");
  assert.equal(li[0].price_data.product_data.description, "H Sakura Pink · A Ice Blue · L Cotton White · L Peanut · O Ice Blue · M Cotton White · I Peanut · A Magenta");
  assert.equal(li[1].price_data.unit_amount, 1960);
  assert.equal(li[2].price_data.product_data.name, "Fotorahmen Punkte");
  assert.equal(li[2].price_data.product_data.description, "Sakura Pink");
  assert.equal(li[2].quantity, 2);
  assert.equal(sent.metadata.lieferung, "Versand");
  assert.equal(sent.shipping_options[0].shipping_rate_data.fixed_amount.amount, 0, "über der Gratisgrenze");
  assert.deepEqual(sent.shipping_address_collection.allowed_countries, ["CH", "LI"]);
  assert.equal(sent.success_url, "https://filamour.ch/success.html?session_id={CHECKOUT_SESSION_ID}");
  assert.match(sent.metadata.artikel_1, /^2× Bubble Letters «HALLO MIA»/);
});

test("Checkout: Fehler werden verständlich gemeldet", async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 503, "ohne Stripe-Schlüssel");
  });
  const stripe = { checkout: { sessions: { create: async () => { throw new Error("boom"); } } } };
  await withServer({ stripe }, async (base) => {
    const post = (body) => fetch(`${base}/api/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal((await post("kein json")).status, 400);
    assert.equal((await post(JSON.stringify({ items: [] }))).status, 400);
    const res = await post(JSON.stringify({ items: [{ type: "poster", variant: "happy", qty: 1 }] }));
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /in einer Minute/);
  });
});

test("GET /api/order prüft die Session-ID und fasst zusammen", async () => {
  const stripe = { checkout: { sessions: { retrieve: async (id) => ({
    id, payment_status: "paid", amount_total: 4850, shipping_cost: { amount_total: 900 },
    customer_details: { name: "Mia Muster" },
    line_items: { data: [{ description: "Bubble Letters «MIA» (3 Teile)", quantity: 1, amount_total: 1350 }] },
  }) } } };
  await withServer({ stripe }, async (base) => {
    assert.equal((await fetch(`${base}/api/order?session_id=../../etc`)).status, 400);
    const d = await (await fetch(`${base}/api/order?session_id=cs_test_abcDEF12345678`)).json();
    assert.equal(d.paid, true);
    assert.equal(d.firstName, "Mia");
    assert.equal(d.number, "12345678");
    assert.equal(d.items[0].qty, 1);
  });
});
