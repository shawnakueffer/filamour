// Prüft die Checkout-Logik ohne echtes Stripe-Konto: npm test
import assert from "node:assert/strict";
import Stripe from "stripe";
import handler, { validateCart } from "../netlify/functions/checkout.mjs";

// 1) Validierung
assert.equal(validateCart({ items: [] }).error, "Der Warenkorb ist leer.");
assert.match(validateCart({ items: [{ text: "AB", colors: ["x", "y"], qty: 1 }] }).error, /Farbe/);
assert.match(validateCart({ items: [{ text: "AB", colors: ["bl-red", "bl-red"], qty: 99 }] }).error, /Menge/);
const ok = validateCart({ items: [{ text: "Hallo Mia", colors: ["pt-sakura", "bm-ice", "pt-white", "pt-peanut", "bm-ice", "pt-sakura", "pt-white", "pt-peanut", "bl-magenta"], qty: 2, price: 1 }] });
assert.match(ok.items[0].name, /\(8 Teile\)/, "Leerzeichen zählt nicht");
assert.equal(ok.items[0].unit, 8 * 450, "Preis kommt vom Server, nicht vom Browser");

// 2) Ganzer Ablauf: Anfrage an Stripe abfangen
let sent;
const fakeFetch = async (url, init) => {
  sent = { url: String(url), body: new URLSearchParams(init.body) };
  return new Response(JSON.stringify({ id: "cs_test_123", object: "checkout.session", url: "https://checkout.stripe.com/c/pay/cs_test_123" }), { status: 200, headers: { "content-type": "application/json" } });
};
const RealStripe = Stripe;
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.URL = "https://filamour.ch";
// Stripe-Client mit abgefangenem fetch verwenden
globalThis.fetch = fakeFetch;

const res = await handler(new Request("https://filamour.ch/api/checkout", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ items: [
    { text: "HALLO MIA", colors: ["pt-sakura", "bm-ice", "pt-white", "pt-peanut", "bm-ice", "pt-sakura", "pt-white", "pt-peanut", "bl-magenta"], qty: 2 },
    { text: "LEO!", colors: ["pt-sapph", "bl-yellow", "bl-green", "bl-red"], qty: 1 },
    { type: "poster", variant: "happy", qty: 1 },
    { type: "frame", style: "dots", color: "pt-sakura", qty: 2 },
  ] }),
}));
const data = await res.json();
assert.equal(res.status, 200, JSON.stringify(data));
assert.equal(data.url, "https://checkout.stripe.com/c/pay/cs_test_123");
const b = sent.body;
assert.ok(sent.url.endsWith("/v1/checkout/sessions"));
assert.equal(b.get("mode"), "payment");
assert.equal(b.get("allow_promotion_codes"), "true");
assert.equal(b.get("line_items[0][price_data][unit_amount]"), "3600");
assert.equal(b.get("line_items[0][quantity]"), "2");
assert.equal(b.get("line_items[1][price_data][unit_amount]"), "1800");
assert.equal(b.get("line_items[0][price_data][currency]"), "chf");
assert.equal(b.get("line_items[2][price_data][product_data][name]"), "Wandbild «MY HAPPY PLACE»");
assert.equal(b.get("line_items[2][price_data][unit_amount]"), "3950");
assert.equal(b.get("line_items[3][price_data][product_data][name]"), "Fotorahmen Punkte");
assert.equal(b.get("line_items[3][price_data][product_data][description]"), "Sakura Pink");
assert.equal(b.get("line_items[3][quantity]"), "2");
assert.match(validateCart({ items: [{ type: "poster", variant: "gibtsnicht", qty: 1 }] }).error, /Wandbild/);
assert.match(validateCart({ items: [{ type: "frame", style: "wave", color: "x", qty: 1 }] }).error, /Fotorahmen/);
assert.equal(b.get("shipping_options[0][shipping_rate_data][fixed_amount][amount]"), "0", "9'000 Rappen > Gratisgrenze");
assert.equal(b.get("shipping_address_collection[allowed_countries][0]"), "CH");
assert.equal(b.get("success_url"), "https://filamour.ch/success.html?session_id={CHECKOUT_SESSION_ID}");
console.log("Produktname:", b.get("line_items[0][price_data][product_data][name]"));
console.log("Beschreibung:", b.get("line_items[0][price_data][product_data][description]"));
console.log("Metadaten:", b.get("metadata[artikel_1]"), "|", b.get("metadata[artikel_4]"));
console.log("Alle Tests bestanden.");
void RealStripe;
