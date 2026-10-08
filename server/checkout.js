// Warenkorb prüfen und daraus die Stripe-Checkout-Session bauen.
// Preise kommen ausschliesslich aus public/catalog.js – Werte aus dem Browser werden ignoriert.
import { SHOP, describeItem, shippingFor } from "../public/catalog.js";

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
      colors: Array.isArray(raw?.colors) ? raw.colors.slice(0, 80).map(String) : [],
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

// Kurzfassung einer bezahlten Session für die Danke-Seite
export function summarizeSession(s) {
  return {
    paid: s.payment_status === "paid",
    number: s.id.slice(-8).toUpperCase(),
    firstName: (s.customer_details?.name || "").split(" ")[0],
    total: s.amount_total,
    shipping: s.shipping_cost?.amount_total ?? 0,
    items: (s.line_items?.data || []).map((li) => ({ name: li.description, qty: li.quantity, amount: li.amount_total })),
  };
}

export const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]+$/;
