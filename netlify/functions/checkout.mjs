// POST /api/checkout
// Nimmt den Warenkorb entgegen, prüft ihn gegen den Katalog und erstellt eine Stripe-Checkout-Session.
// Preise kommen ausschliesslich aus public/catalog.js – Werte aus dem Browser werden ignoriert.
import Stripe from "stripe";
import { SHOP, describeItem, shippingFor } from "../../public/catalog.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// Stripe-Metadaten: max. 50 Schlüssel, je Wert max. 500 Zeichen
function addMeta(meta, key, value) {
  const parts = value.match(/[\s\S]{1,490}/g) || [""];
  parts.forEach((p, i) => { meta[parts.length > 1 ? `${key}_${i + 1}` : key] = p; });
}

export function validateCart(body) {
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || items.length === 0) return { error: "Der Warenkorb ist leer." };
  if (items.length > SHOP.maxDesignsPerOrder) return { error: `Maximal ${SHOP.maxDesignsPerOrder} Artikel pro Bestellung.` };

  const clean = [];
  for (const raw of items) {
    const qty = Math.floor(Number(raw?.qty));
    if (!(qty >= 1 && qty <= SHOP.maxQuantity)) return { error: `Die Menge muss zwischen 1 und ${SHOP.maxQuantity} liegen.` };
    const item = {
      type: String(raw?.type || "letters"),
      text: String(raw?.text ?? "").slice(0, 80),
      colors: Array.isArray(raw?.colors) ? raw.colors.map(String) : [],
      variant: String(raw?.variant ?? ""),
      style: String(raw?.style ?? ""),
      color: String(raw?.color ?? ""),
    };
    const d = describeItem(item);
    if (d.error) return { error: d.error };
    clean.push({ ...d, qty });
  }
  return { items: clean };
}

export function buildSession(items, origin) {
  const subtotal = items.reduce((s, it) => s + it.unit * it.qty, 0);
  const shipping = shippingFor(subtotal);
  const metadata = { shop: "filamour", artikel: String(items.length) };

  const line_items = items.map((it, n) => {
    addMeta(metadata, `artikel_${n + 1}`, `${it.qty}× ${it.name} – ${it.description}`);
    return {
      quantity: it.qty,
      price_data: {
        currency: SHOP.currency,
        unit_amount: it.unit,
        product_data: { name: it.name, description: it.description },
      },
    };
  });

  return {
    mode: "payment",
    locale: "de",
    line_items,
    allow_promotion_codes: true, // Feld für Rabattcodes (z. B. Newsletter) im Checkout
    metadata,
    payment_intent_data: { metadata },
    shipping_address_collection: { allowed_countries: SHOP.shippingCountries },
    shipping_options: [{
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: shipping === 0 ? "Gratis Versand" : "Versand mit der Post",
        fixed_amount: { amount: shipping, currency: SHOP.currency },
      },
    }],
    custom_fields: [{
      key: "bemerkung",
      label: { type: "custom", custom: "Bemerkung (optional)" },
      type: "text",
      optional: true,
      text: { maximum_length: 255 },
    }],
    success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#warenkorb`,
  };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Nur POST erlaubt." }, 405);
  if (!process.env.STRIPE_SECRET_KEY) return json({ error: "Der Shop ist noch nicht mit Stripe verbunden." }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Ungültige Anfrage." }, 400); }

  const cart = validateCart(body);
  if (cart.error) return json({ error: cart.error }, 400);

  const origin = process.env.URL || new URL(req.url).origin;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
    const session = await stripe.checkout.sessions.create(buildSession(cart.items, origin));
    return json({ url: session.url });
  } catch (err) {
    console.error("Stripe-Fehler:", err?.message);
    return json({ error: "Die Zahlung konnte gerade nicht gestartet werden. Bitte versuche es in einer Minute nochmals." }, 502);
  }
};

export const config = { path: "/api/checkout" };
