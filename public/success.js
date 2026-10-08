// Danke-Seite: leert den Warenkorb und zeigt die Bestellung an
import { chf } from "./catalog.js";
try { localStorage.removeItem("filamour-cart"); } catch {}
const id = new URLSearchParams(location.search).get("session_id");
if (id) {
  try {
    const r = await fetch("/api/order?session_id=" + encodeURIComponent(id));
    const d = await r.json();
    if (r.ok) {
      if (d.firstName) document.getElementById("title").textContent = `Danke, ${d.firstName}!`;
      if (!d.paid) document.getElementById("lead").textContent = "Deine Bestellung ist eingegangen. Sobald die Zahlung bestätigt ist, erhältst du eine E-Mail.";
      const el = document.getElementById("order");
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      el.innerHTML = d.items.map((i) => `<div class="tline"><span>${i.qty}× ${esc(i.name)}</span><span>${chf(i.amount)}</span></div>`).join("")
        + `<div class="tline"><span>Versand</span><span>${d.shipping ? chf(d.shipping) : "gratis"}</span></div>`
        + `<div class="tline total"><span>Total</span><span>${chf(d.total)}</span></div>`
        + `<div class="tline"><span class="muted">Bestellnummer</span><span class="muted">${esc(d.number)}</span></div>`;
      el.hidden = false;
    }
  } catch {}
}
