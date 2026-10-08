// GET /api/order?session_id=cs_...
// Liefert der Danke-Seite eine kurze Zusammenfassung der bezahlten Bestellung.
import Stripe from "stripe";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const id = new URL(req.url).searchParams.get("session_id") || "";
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json({ error: "Unbekannte Bestellung." }, 400);
  if (!process.env.STRIPE_SECRET_KEY) return json({ error: "Der Shop ist noch nicht mit Stripe verbunden." }, 500);

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
    const s = await stripe.checkout.sessions.retrieve(id, { expand: ["line_items"] });
    return json({
      paid: s.payment_status === "paid",
      number: s.id.slice(-8).toUpperCase(),
      firstName: (s.customer_details?.name || "").split(" ")[0],
      total: s.amount_total,
      shipping: s.shipping_cost?.amount_total ?? 0,
      items: (s.line_items?.data || []).map((li) => ({ name: li.description, qty: li.quantity, amount: li.amount_total })),
    });
  } catch (err) {
    console.error("Stripe-Fehler:", err?.message);
    return json({ error: "Bestellung nicht gefunden." }, 404);
  }
};

export const config = { path: "/api/order" };
