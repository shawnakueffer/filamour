// Prüft Warenkorb-Validierung und die Anfrage an Stripe, ohne echtes Stripe-Konto: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCart, buildSession, summarizeSession } from "../server/checkout.js";
import { isPickup, PRODUCTS, ALPHABET, alphabetSinglePrice, CHARS } from "../public/catalog.js";
import { withServer } from "./helpers.js";

const HALLO_MIA = ["pt-sakura", "bm-ice", "pt-white", "pt-peanut", "bm-ice", "pt-sakura", "pt-white", "pt-peanut", "bl-magenta"];

test("Ausgeblendete Produkte lassen sich nicht bestellen", () => {
  const before = [PRODUCTS.poster.active, PRODUCTS.frame.active];
  PRODUCTS.poster.active = PRODUCTS.frame.active = false;
  try {
    assert.match(validateCart({ items: [{ type: "poster", variant: "happy", qty: 1 }] }).error, /Wandbilder gibt es im Moment nicht/);
    assert.match(validateCart({ items: [{ type: "frame", style: "wave", color: "bl-red", qty: 1 }] }).error, /Fotorahmen gibt es im Moment nicht/);
    assert.equal(validateCart({ items: [{ text: "AB", colors: ["bl-red", "bl-red"], qty: 1 }] }).error, undefined, "Buchstaben gehen weiter");
  } finally { [PRODUCTS.poster.active, PRODUCTS.frame.active] = before; }
});

// Die übrigen Tests prüfen Wandbild und Fotorahmen eingeblendet, damit sie beim Wiedereinblenden funktionieren
PRODUCTS.poster.active = PRODUCTS.frame.active = true;

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

test("Eingeschleuste Namen wie __proto__ gelten nicht als Farbe oder Produkt", () => {
  for (const bad of ["__proto__", "constructor", "toString"]) {
    assert.match(validateCart({ items: [{ text: "AB", colors: [bad, "bl-red"], qty: 1 }] }).error, /Farbe/, bad);
    assert.match(validateCart({ items: [{ type: "poster", variant: bad, qty: 1 }] }).error, /Wandbild/, bad);
    assert.match(validateCart({ items: [{ type: "frame", style: bad, color: "bl-red", qty: 1 }] }).error, /Fotorahmen/, bad);
    assert.match(validateCart({ items: [{ type: "frame", style: "wave", color: bad, qty: 1 }] }).error, /Fotorahmen/, bad);
  }
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
  assert.equal(big.name, "Bubble Letters «MIA» (3 Teile, Gross 6,5 cm, matt)");
  assert.equal(validateCart({ items: [{ ...item, size: "gross" }] }).items[0].unit, 3 * 490);
  const small = validateCart({ items: [{ ...item, size: "klein", price: 1 }] }).items[0];
  assert.equal(small.unit, 3 * 290);
  assert.equal(small.name, "Bubble Letters «MIA» (3 Teile, Klein 3 cm, matt)");
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
  assert.equal(ok.items[0].name, "Bubble Letters «LEO B» (4 Teile, Gross 6,5 cm, matt)");
});

test("Gratisversand ab der Grenze, sonst Versandkosten", () => {
  const small = buildSession(validateCart({ items: [{ text: "AB", colors: ["bl-red", "bl-red"], qty: 1 }] }).items, "https://x.ch");
  assert.equal(small.shipping_options[0].shipping_rate_data.fixed_amount.amount, 650, "Versand CHF 6.50");
  assert.deepEqual(small.shipping_address_collection.allowed_countries, ["CH", "LI"], "nur Schweiz und Liechtenstein");
  assert.match(small.custom_text.shipping_address.message, /nur in die Schweiz und nach Liechtenstein/);
  assert.equal(small.custom_text.submit.message, "Mit deiner Bestellung akzeptierst du unsere AGB: https://x.ch/rechtliches.html#agb");
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
  assert.match(s.custom_text.submit.message, /Abholung.*AGB: https:\/\/x\.ch\/rechtliches\.html#agb$/);
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
    id, payment_status: id.endsWith("GRATIS") ? "no_payment_required" : "paid", amount_total: 4850, shipping_cost: { amount_total: 900 },
    total_details: { amount_discount: 150 },
    customer_details: { name: "Mia Muster" },
    line_items: { data: [{ description: "Bubble Letters «MIA» (3 Teile)", quantity: 1, amount_total: 1350 }] },
  }) } } };
  await withServer({ stripe }, async (base) => {
    assert.equal((await fetch(`${base}/api/order?session_id=../../etc`)).status, 400);
    const d = await (await fetch(`${base}/api/order?session_id=cs_test_abcDEF12345678`)).json();
    assert.equal(d.paid, true);
    assert.equal(d.discount, 150);
    const gratis = await (await fetch(`${base}/api/order?session_id=cs_test_abcGRATIS`)).json();
    assert.equal(gratis.paid, true, "mit 100-%-Gutschein gilt die Bestellung als bezahlt");
    assert.equal(d.firstName, "Mia");
    assert.equal(d.number, "12345678");
    assert.equal(d.items[0].qty, 1);
  });
});

test("Alphabet: ausgeblendet nicht bestellbar", () => {
  const was = ALPHABET.active;
  ALPHABET.active = false;
  assert.match(validateCart({ items: [{ type: "alphabet", size: "gross", variant: "weiss", qty: 1 }] }).error, /gibt es im Moment nicht/);
  ALPHABET.active = was;
});

test("Alphabet: Preis je Grösse, ganz weiss oder bis zu 5 Farben im Wechsel", (t) => {
  const was = ALPHABET.active;
  ALPHABET.active = true; // auch wenn es gerade ausgeblendet ist, sollen die Preise stimmen
  t.after(() => { ALPHABET.active = was; });
  const five = ["pt-sakura", "bm-ice", "es-matcha", "sp-lemon", "pm-purple"];
  const weiss = validateCart({ items: [{ type: "alphabet", size: "gross", variant: "weiss", colors: ["bl-red"], qty: 1, price: 1 }] }).items[0];
  assert.equal(weiss.unit, 6300, "gross weiss CHF 63, Preis vom Server");
  assert.equal(weiss.name, "Alphabet A–Z (26 Teile, Gross 6,5 cm, matt)");
  assert.match(weiss.description, /^A Cotton White · B Cotton White .* Z Cotton White$/, "weiss ignoriert mitgeschickte Farben");
  const bunt = validateCart({ items: [{ type: "alphabet", size: "klein", variant: "farbig", colors: five, qty: 2 }] }).items[0];
  assert.equal(bunt.unit, 4900, "klein farbig CHF 49");
  assert.equal(validateCart({ items: [{ type: "alphabet", size: "gross", variant: "farbig", colors: five, qty: 1 }] }).items[0].unit, 6900);
  assert.equal(validateCart({ items: [{ type: "alphabet", size: "klein", variant: "weiss", qty: 1 }] }).items[0].unit, 4300);
  assert.equal(alphabetSinglePrice("gross"), 26 * 490, "Vergleichspreis = echte Einzelpreise");
  assert.equal(alphabetSinglePrice("klein"), 26 * 290);
  for (const size of ["gross", "klein"]) for (const v of ["farbig", "weiss"]) assert.ok(ALPHABET.price[size][v] < alphabetSinglePrice(size), "Set günstiger als einzeln");
  assert.equal(bunt.name, "Alphabet A–Z (26 Teile, Klein 3 cm, matt)");
  assert.match(bunt.description, /^A Sakura Pink · B Ice Blue · C Matcha Green · D Lemon Cream · E Muted Purple · F Sakura Pink/);
  assert.match(bunt.description, /Z Sakura Pink$/, "26. Buchstabe = Farbe 1 (26 = 5 × 5 + 1)");
  assert.equal(validateCart({ items: [{ type: "alphabet", size: "klein", variant: "farbig", colors: ["bl-red"], qty: 1 }] }).items[0].meta, "Klein, 1 Farbe im Wechsel");
  for (const colors of [[], [...five, "bl-red"], ["bl-red", "bl-red"], ["gibtsnicht"], ["__proto__"], "bl-red"]) {
    assert.match(validateCart({ items: [{ type: "alphabet", size: "gross", variant: "farbig", colors, qty: 1 }] }).error, /1 bis 5 verschiedene Farben/, JSON.stringify(colors));
  }
  assert.match(validateCart({ items: [{ type: "alphabet", size: "riesig", variant: "weiss", qty: 1 }] }).error, /Grösse/);
  assert.match(validateCart({ items: [{ type: "alphabet", size: "gross", variant: "regenbogen", qty: 1 }] }).error, /Variante/);
  ALPHABET.active = false;
  try { assert.match(validateCart({ items: [{ type: "alphabet", size: "gross", variant: "weiss", qty: 1 }] }).error, /im Moment nicht/); }
  finally { ALPHABET.active = true; }
});

test("Glänzend kostet 50 Rappen mehr pro Buchstabe, matt ist Standard", () => {
  const item = { text: "MIA", colors: ["bl-red", "bl-red", "bl-red"], qty: 1 };
  assert.equal(validateCart({ items: [item] }).items[0].unit, 3 * 490, "ohne Angabe matt");
  const glanz = validateCart({ items: [{ ...item, finish: "glaenzend" }] }).items[0];
  assert.equal(glanz.unit, 3 * 540);
  assert.equal(glanz.name, "Bubble Letters «MIA» (3 Teile, Gross 6,5 cm, glänzend)");
  assert.equal(glanz.meta, "Gross, glänzend, 3 Buchstaben à CHF 5.40");
  assert.equal(validateCart({ items: [{ ...item, size: "klein", finish: "glaenzend" }] }).items[0].unit, 3 * 340);
  assert.equal(validateCart({ items: [{ ...item, finish: "matt" }] }).items[0].unit, 3 * 490);
  for (const bad of ["seidenmatt", "__proto__"]) assert.match(validateCart({ items: [{ ...item, finish: bad }] }).error, /Oberfläche/, bad);
  // Alphabet gibt es nur matt: eine mitgeschickte Oberfläche ändert nichts
  const was = ALPHABET.active;
  ALPHABET.active = true;
  const abc = validateCart({ items: [{ type: "alphabet", size: "gross", variant: "weiss", finish: "glaenzend", qty: 1 }] }).items[0];
  ALPHABET.active = was;
  assert.equal(abc.unit, 6300);
  assert.match(abc.name, /, matt\)$/);
});

test("Akzente: aigu, grave, Punkte und Tilde werden gedruckt, auch als e + Akzent (macOS)", () => {
  const nfd = "Léa Zoë Àñç".normalize("NFD"); // so tippt der Mac manchmal
  const colors = [...nfd.normalize("NFC")].map(() => "bl-red");
  const d = validateCart({ items: [{ text: nfd, colors, qty: 1 }] }).items[0];
  assert.equal(d.unit, 8 * 490, "8 Buchstaben, Leerzeichen gratis, Ç gibt es nicht");
  assert.match(d.name, /«LÉA ZOË ÀÑ»/);
  assert.match(d.description, /^L Red · É Red · A Red · Z Red · O Red · Ë Red · À Red · Ñ Red$/);
  for (const ch of "ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÃÑÕ") assert.ok(CHARS.includes(ch), ch);
  for (const ch of "ÇÂÊÅØŠČ") assert.ok(!CHARS.includes(ch), ch);
});
