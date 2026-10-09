import { SHOP, ANNOUNCEMENTS, ANNOUNCEMENTS_SHORT, CHARS, COLORS, COLOR_BY_ID, PRODUCTS, NEWSLETTER, POSTERS, POSTER_BY_ID, FRAME_STYLES, FRAME_BY_ID, describeItem, pieces, designPrice, shippingFor, isPickup, PICKUP_NOTE, chf } from "./catalog.js";
import { REVIEWS } from "./reviews.js";

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// JSON an den eigenen Server schicken; wirft einen Fehler mit verständlicher Meldung
async function postJSON(url, data) {
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  } catch {
    throw new Error("Keine Verbindung. Bitte prüfe dein Internet und versuche es nochmals.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Das hat leider nicht geklappt. Bitte versuch es nochmals.");
  return body;
}

/* ---------- Buchstaben zeichnen ---------- */
const widthCache = {};
let fontReady = false;
function measure(ch) {
  if (widthCache[ch]) return widthCache[ch];
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("style", "position:absolute;visibility:hidden");
  const t = document.createElementNS(ns, "text");
  t.setAttribute("font-family", "'Cherry Bomb One'");
  t.setAttribute("font-size", "100");
  t.textContent = ch;
  svg.appendChild(t); document.body.appendChild(svg);
  let b; try { b = t.getBBox(); } catch { b = { x: 0, width: 60 }; }
  svg.remove();
  const r = { x: b.x, w: Math.max(b.width, 18) };
  if (fontReady) widthCache[ch] = r;
  return r;
}
const PAD = 4, VB_Y = -100, VB_H = 124;
function glyphSVG(ch, color, px, filter = "puff") {
  const m = measure(ch), w = m.w + PAD * 2;
  const esc = ch === "&" ? "&amp;" : ch;
  return `<svg width="${(px * w / VB_H).toFixed(1)}" height="${px}" viewBox="${(m.x - PAD).toFixed(1)} ${VB_Y} ${w.toFixed(1)} ${VB_H}" aria-hidden="true"><text x="0" y="0" font-family="'Cherry Bomb One','Arial Rounded MT Bold',sans-serif" font-size="100" fill="${color.hex}" stroke="${color.hex}" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke" filter="url(#${filter})">${esc}</text></svg>`;
}
function wordsHTML(text, colors, px, opts = {}) {
  // kleine, nicht klickbare Vorschau (Warenkorb, Szenen)
  const up = opts.keepCase ? text : text.toUpperCase();
  let html = "", word = "";
  [...up].forEach((c, i) => {
    if (c === " ") { if (word) { html += `<span class="mini">${word}</span>`; word = ""; } return; }
    if (!opts.keepCase && !CHARS.includes(c)) return;
    const col = opts.hex ? { hex: opts.hex } : (COLOR_BY_ID[colors[i]] || COLORS[0]);
    word += glyphSVG(c, col, px, opts.filter);
  });
  if (word) html += `<span class="mini">${word}</span>`;
  return html;
}

/* ---------- Studio ---------- */
const EXAMPLE = ["pt-sakura", "bm-ice", "pt-peanut"]; // Startfarben für «MIA»
let state = store.get("filamour-studio", null) || { text: "MIA", colors: [], bg: "wand", fill: "pt-sakura" };
if (String(state.text).trim().toUpperCase() === "HALLO MIA") { state.text = "MIA"; state.colors = []; } // alter Standardtext → neuer Standard
if (!Array.isArray(state.colors) || !state.colors.length) state.colors = [...state.text].map((_, i) => EXAMPLE[i % EXAMPLE.length]);
state.colors = state.colors.map((id) => (COLOR_BY_ID[id] ? id : "pt-sakura"));
if (!COLOR_BY_ID[state.fill]) state.fill = "pt-sakura";
let sel = -1;         // gewählter Buchstabe
let qty = 1;
let editing = null;   // id eines Warenkorb-Eintrags, der gerade bearbeitet wird
let popIdx = -1;      // zuletzt eingefärbter Buchstabe (kleine Animation)

const validIdx = () => [...state.text.toUpperCase()].map((c, i) => (CHARS.includes(c) ? i : -1)).filter((i) => i >= 0);

function stageSize() {
  const stage = $("#stage");
  const avail = Math.max(240, stage.clientWidth - 56);
  const words = state.text.toUpperCase().split(" ").filter(Boolean);
  const longest = Math.max(3, ...words.map((w) => [...w].filter((c) => CHARS.includes(c)).length));
  return Math.round(Math.max(40, Math.min(112, avail / (longest * 0.74))));
}

function render() {
  const up = state.text.toUpperCase();
  while (state.colors.length < up.length) state.colors.push(state.fill);
  state.colors.length = up.length;
  if (sel >= 0 && !validIdx().includes(sel)) sel = -1;

  const px = stageSize();
  const line = $("#line");
  line.style.setProperty("--sz", px + "px");
  let html = "", word = "";
  [...up].forEach((c, i) => {
    if (c === " ") { if (word) { html += `<span class="word">${word}</span>`; word = ""; } return; }
    if (!CHARS.includes(c)) return;
    const col = COLOR_BY_ID[state.colors[i]];
    word += `<button class="glyph${i === sel ? " sel" : ""}${i === popIdx ? " pop" : ""}" data-i="${i}" aria-pressed="${i === sel}" aria-label="${c}, ${col.name}" title="${c} · ${col.name}">${glyphSVG(c, col, px)}</button>`;
  });
  if (word) html += `<span class="word">${word}</span>`;
  line.innerHTML = html || `<span class="empty-hint">Tippe unten ein Wort ein</span>`;

  const bad = new Set([...up].filter((c) => c !== " " && !CHARS.includes(c)));
  $("#warn").textContent = bad.size ? `Nicht im Sortiment: ${[...bad].join(" ")}. Diese Zeichen werden weggelassen.` : "";
  $("#stage").dataset.bg = state.bg;
  document.querySelectorAll(".bgbtn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.bg === state.bg));
  $("#stageHint").hidden = !validIdx().length;

  // Zusammenstellung nach Farbe
  const groups = {};
  validIdx().forEach((i) => (groups[state.colors[i]] ||= []).push(up[i]));
  $("#summary").innerHTML = Object.keys(groups).length
    ? Object.entries(groups).map(([id, chars]) => `<div class="srow"><span class="dot" style="background:${COLOR_BY_ID[id].hex}"></span><span>${COLOR_BY_ID[id].name} <code>${chars.join(" ")}</code></span><span class="n">${chars.length}×</span></div>`).join("")
    : `<span class="muted" style="font-size:14px">Noch keine Buchstaben.</span>`;

  // Preis
  const n = validIdx().length;
  const unit = designPrice(state.text, state.colors);
  $("#pieceInfo").textContent = n ? `${n} ${n === 1 ? "Buchstabe" : "Buchstaben"} à ${chf(SHOP.pricePerLetter)}${qty > 1 ? ` · ${qty}×` : ""}` : "";
  $("#price").textContent = chf(unit * qty);
  $("#qtyVal").textContent = qty;
  $("#qtyMinus").disabled = qty <= 1;
  $("#qtyPlus").disabled = qty >= SHOP.maxQuantity;
  const tooMany = n > SHOP.maxLettersPerDesign;
  $("#addToCart").disabled = n === 0 || tooMany;
  $("#addToCart").textContent = editing ? "Änderung speichern" : "In den Warenkorb";
  if (tooMany) $("#warn").textContent = `Maximal ${SHOP.maxLettersPerDesign} Buchstaben pro Design.`;

  // Farbwahl
  const t = $("#pickTitle");
  if (sel >= 0) { t.className = "pick-title"; t.innerHTML = `Farbe für <b>${up[sel] === "&" ? "&amp;" : up[sel]}</b>`; }
  else { t.className = "pick-title idle"; t.textContent = "Tippe oben auf einen Buchstaben, um ihn einzufärben."; }
  $("#toAll").hidden = sel < 0;
  document.querySelectorAll(".sw").forEach((b) => { b.disabled = sel < 0; b.setAttribute("aria-pressed", sel >= 0 && b.dataset.c === state.colors[sel]); });

  store.set("filamour-studio", state);
  popIdx = -1;
}

function buildShelf() {
  $("#shelf").innerHTML = COLORS.map((c) => `<button class="sw" data-c="${c.id}" aria-pressed="false" disabled><span class="spool" style="background-color:${c.hex}"></span><span class="nm">${c.name}</span></button>`).join("");
}

$("#txt").addEventListener("input", (e) => {
  const old = state.text.toUpperCase(), nu = e.target.value.toUpperCase();
  let p = 0; while (p < old.length && p < nu.length && old[p] === nu[p]) p++;
  let s = 0; while (s < old.length - p && s < nu.length - p && old[old.length - 1 - s] === nu[nu.length - 1 - s]) s++;
  state.colors = [...state.colors.slice(0, p), ...Array(nu.length - p - s).fill(state.fill), ...state.colors.slice(old.length - s)];
  state.text = e.target.value; sel = -1; $("#added").textContent = ""; render();
});
$("#stage").addEventListener("click", (e) => {
  if (e.target.closest(".bgbtn")) return;
  const g = e.target.closest(".glyph");
  if (!g) { if (sel >= 0) { sel = -1; render(); } return; }
  const i = +g.dataset.i; sel = i === sel ? -1 : i; render();
});
$("#shelf").addEventListener("click", (e) => {
  const b = e.target.closest(".sw"); if (!b || sel < 0) return;
  state.colors[sel] = b.dataset.c; state.fill = b.dataset.c; popIdx = sel;
  const v = validIdx(), k = v.indexOf(sel);
  sel = k >= 0 && k < v.length - 1 ? v[k + 1] : -1;   // weiter zum nächsten Buchstaben
  render();
});
$("#toAll").onclick = () => { if (sel < 0) return; const id = state.colors[sel]; validIdx().forEach((i) => (state.colors[i] = id)); state.fill = id; sel = -1; render(); $("#line").classList.remove("wave"); void $("#line").offsetWidth; $("#line").classList.add("wave"); };
document.querySelectorAll(".bgbtn").forEach((b) => (b.onclick = () => { state.bg = b.dataset.bg; render(); }));
$("#qtyMinus").onclick = () => { qty = Math.max(1, qty - 1); render(); };
$("#qtyPlus").onclick = () => { qty = Math.min(SHOP.maxQuantity, qty + 1); render(); };
let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { render(); renderArt(); }, 120); });

/* ---------- Warenkorb ---------- */
let cart = store.get("filamour-cart", []).filter((it) => it && it.id && !describeItem(it).error);
const saveCart = () => store.set("filamour-cart", cart);
const uid = () => Math.random().toString(36).slice(2, 10);

$("#addToCart").onclick = () => {
  const item = { type: "letters", text: state.text.toUpperCase().trim(), colors: [], qty };
  // führende Leerzeichen entfernen, damit Farben zum Text passen
  const lead = state.text.length - state.text.trimStart().length;
  item.colors = state.colors.slice(lead, lead + item.text.length);
  if (editing && cart.find((c) => c.id === editing)) {
    Object.assign(cart.find((c) => c.id === editing), item);
    $("#added").textContent = "Gespeichert.";
    editing = null;
  } else {
    cart.push({ id: uid(), ...item });
    $("#added").innerHTML = `Im Warenkorb. <button class="btn link" id="addedOpen">Ansehen</button>`;
    $("#addedOpen").onclick = openCart;
  }
  qty = 1; saveCart(); renderCart(); render();
};

function addProduct(item, msgEl) {
  // gleiche Variante schon im Warenkorb? Dann Menge erhöhen
  const same = cart.find((c) => c.type === item.type && c.variant === item.variant && c.style === item.style && c.color === item.color);
  if (same) same.qty = Math.min(SHOP.maxQuantity, same.qty + 1); else cart.push({ id: uid(), qty: 1, ...item });
  saveCart(); renderCart();
  msgEl.innerHTML = `Im Warenkorb. <button class="btn link">Ansehen</button>`;
  msgEl.querySelector("button").onclick = openCart;
}

function totals() {
  const sub = cart.reduce((s, it) => s + describeItem(it).unit * it.qty, 0);
  const pickup = isPickup(cart);
  const ship = shippingFor(sub, pickup);
  return { sub, ship, pickup, total: sub + ship };
}

function renderCart() {
  const count = cart.reduce((s, it) => s + it.qty, 0);
  const cc = $("#cartCount");
  if (+cc.textContent < count) { cc.classList.remove("bump"); void cc.offsetWidth; cc.classList.add("bump"); }
  cc.textContent = count; cc.dataset.n = count;
  const body = $("#cartBody");
  if (!cart.length) {
    body.innerHTML = `<div class="empty-cart"><p>Dein Warenkorb ist leer.</p><button class="btn" id="toStudio">Zum Studio</button></div>`;
    $("#toStudio").onclick = () => { closeCart(); $("#studio").scrollIntoView(); };
    $("#cartFoot").hidden = true; return;
  }
  $("#cartFoot").hidden = false;
  body.innerHTML = cart.map((it) => {
    const d = describeItem(it), letters = d.type === "letters";
    const prev = letters ? wordsHTML(it.text, it.colors, 30)
      : d.type === "poster" ? posterMini(POSTER_BY_ID[it.variant])
      : `<div class="mini-frame">${frameSVG(it.style, COLOR_BY_ID[it.color].hex)}</div>`;
    return `<div class="citem" data-id="${it.id}">
      <div class="citem-prev">${prev}</div>
      ${letters ? "" : `<div class="citem-title">${d.name.replace(/[<>]/g, "")}</div>`}
      <div class="citem-row"><span class="citem-meta">${d.meta}</span><span class="citem-price">${chf(d.unit * it.qty)}</span></div>
      <div class="citem-row">
        <div class="qty" role="group" aria-label="Anzahl"><button data-act="minus" aria-label="Weniger" ${it.qty <= 1 ? "disabled" : ""}>−</button><span>${it.qty}</span><button data-act="plus" aria-label="Mehr" ${it.qty >= SHOP.maxQuantity ? "disabled" : ""}>+</button></div>
        <div class="citem-actions">${letters ? `<button class="btn link" data-act="edit">Bearbeiten</button>` : ""}<button class="btn link" data-act="remove">Entfernen</button></div>
      </div>
    </div>`;
  }).join("");
  const t = totals();
  $("#tSub").textContent = chf(t.sub);
  $("#tShip").textContent = t.pickup ? "Abholung" : t.ship ? chf(t.ship) : "gratis";
  $("#pickupNote").hidden = !t.pickup;
  $("#pickupNote").textContent = PICKUP_NOTE;
  $("#payNote").textContent = t.pickup ? "Zahlung im nächsten Schritt, sicher über Stripe." : "Lieferadresse und Zahlung im nächsten Schritt, sicher über Stripe.";
  const fs = $("#freeship");
  fs.hidden = !SHOP.freeShippingFrom || t.pickup;
  if (SHOP.freeShippingFrom && !t.pickup) {
    const left = SHOP.freeShippingFrom - t.sub;
    $("#freeshipText").textContent = left > 0 ? `Noch ${chf(left)} bis zum Gratisversand` : "Du hast Gratisversand.";
    $("#freeshipBar").style.width = Math.min(100, (t.sub / SHOP.freeShippingFrom) * 100) + "%";
  }
  $("#tTotal").textContent = chf(t.total);
}

$("#cartBody").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const it = cart.find((c) => c.id === b.closest(".citem").dataset.id); if (!it) return;
  const act = b.dataset.act;
  if (act === "plus") it.qty = Math.min(SHOP.maxQuantity, it.qty + 1);
  if (act === "minus") it.qty = Math.max(1, it.qty - 1);
  if (act === "remove") cart = cart.filter((c) => c !== it);
  if (act === "edit") {
    state.text = it.text; state.colors = it.colors.slice(); editing = it.id; qty = it.qty; sel = -1;
    $("#txt").value = it.text; $("#added").textContent = "Du bearbeitest ein Design aus dem Warenkorb.";
    closeCart(); render(); $("#studio").scrollIntoView(); return;
  }
  if (act === "remove" && editing === it.id) { editing = null; render(); }
  $("#checkoutMsg").textContent = "";
  saveCart(); renderCart();
});

let lastFocus = null;
const background = () => document.querySelectorAll("body > header, body > main, body > footer, body > .announce, #chatFab, #chat");
function openCart() {
  lastFocus = document.activeElement;
  background().forEach((el) => (el.inert = true));
  $("#scrim").hidden = false; $("#drawer").hidden = false;
  requestAnimationFrame(() => { $("#scrim").classList.add("on"); $("#drawer").classList.add("on"); $("#closeCart").focus(); });
}
function closeCart() {
  background().forEach((el) => (el.inert = false));
  $("#scrim").classList.remove("on"); $("#drawer").classList.remove("on");
  setTimeout(() => { $("#scrim").hidden = true; $("#drawer").hidden = true; }, 220);
  lastFocus?.focus?.();
}
$("#openCart").onclick = openCart;
$("#closeCart").onclick = closeCart;
$("#scrim").onclick = closeCart;
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#drawer").hidden) closeCart(); });

/* ---------- Kasse ---------- */
$("#checkout").onclick = async () => {
  const btn = $("#checkout"), msg = $("#checkoutMsg");
  msg.textContent = "";
  btn.disabled = true; btn.textContent = "Einen Moment …";
  try {
    const data = await postJSON("/api/checkout", { items: cart.map(({ type, text, colors, variant, style, color, qty }) => ({ type, text, colors, variant, style, color, qty })) });
    if (!data.url) throw new Error("Die Zahlung konnte nicht gestartet werden. Bitte versuche es nochmals.");
    location.href = data.url;
  } catch (err) {
    msg.textContent = err.message;
    btn.disabled = false; btn.textContent = "Zur Kasse";
  }
};

/* ---------- Dezente Animationen ---------- */
function motion() {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("anim-ready");
  if (reduce || !("IntersectionObserver" in window)) return;
  // nur Elemente unterhalb des sichtbaren Bereichs werden versteckt und beim Scrollen eingeblendet
  const targets = document.querySelectorAll(".news-card, .block-head, .studio-card .stage, .controls .panel, .size-photo, .dims, .specs, .idea, .facts li, .material-visual, .product, .review, .faq details");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  const fold = innerHeight;
  targets.forEach((el) => {
    if (el.getBoundingClientRect().top < fold) return;
    // Geschwister in Rastern leicht versetzt
    const sel = el.tagName.toLowerCase() + [...el.classList].map((c) => "." + c).join("");
    const sibs = [...el.parentElement.children].filter((c) => c.matches(sel));
    const k = Math.max(0, sibs.indexOf(el));
    el.style.setProperty("--d", `${Math.min(k, 5) * 70}ms`);
    el.classList.add("pre");
    io.observe(el);
  });
}

/* ---------- Seite ---------- */
function renderArt() {
  document.querySelectorAll(".art").forEach((el) => {
    const scene = el.closest(".poster, .scene, .hero-visual") || el.parentElement;
    const fit = +el.dataset.fit || 0.5, max = +el.dataset.max || 60;
    if (el.dataset.lines) {
      const lines = el.dataset.lines.split("|");
      const longest = Math.max(...lines.map((l) => l.length));
      const hFit = scene.classList.contains("poster") ? 0.8 : 0.64;
      const px = Math.round(Math.min(max, (scene.clientWidth * fit) / (longest * 0.62), (scene.clientHeight * hFit) / lines.length));
      const opts = { keepCase: true, hex: el.dataset.colors ? null : el.dataset.hex, filter: el.dataset.gloss ? "puff-gloss" : "puff" };
      const cols = el.dataset.colors ? el.dataset.colors.split(",") : [];
      el.style.rowGap = `${-px * 0.18}px`;
      el.innerHTML = lines.map((l) => wordsHTML(l, cols, px, opts)).join("");
    } else {
      const w = el.dataset.word, cols = el.dataset.colors.split(",");
      const px = Math.round(Math.min(max, (scene.clientWidth * fit) / (w.length * 0.74)));
      el.innerHTML = wordsHTML(w, cols, px);
    }
  });
  renderFrame();
  renderDims();
}

// Punkt + Aussen-Normale auf dem Umfang eines abgerundeten Rechtecks (s = Weg ab oben links)
function rrPerimeter(cx, cy, w, h, r) {
  const L = [w - 2 * r, h - 2 * r], q = (Math.PI * r) / 2, x0 = cx - w / 2, y0 = cy - h / 2;
  const arc = (ox, oy, a0) => (t) => { const a = a0 + t / r; return [ox + r * Math.cos(a), oy + r * Math.sin(a), Math.cos(a), Math.sin(a)]; };
  const parts = [
    [L[0], (t) => [x0 + r + t, y0, 0, -1]], [q, arc(x0 + w - r, y0 + r, -Math.PI / 2)],
    [L[1], (t) => [x0 + w, y0 + r + t, 1, 0]], [q, arc(x0 + w - r, y0 + h - r, 0)],
    [L[0], (t) => [x0 + w - r - t, y0 + h, 0, 1]], [q, arc(x0 + r, y0 + h - r, Math.PI / 2)],
    [L[1], (t) => [x0, y0 + h - r - t, -1, 0]], [q, arc(x0 + r, y0 + r, Math.PI)],
  ];
  const per = parts.reduce((s, p) => s + p[0], 0);
  return { per, at(s) { s = ((s % per) + per) % per; for (const [len, f] of parts) { if (s <= len) return f(s); s -= len; } return parts[0][1](0); } };
}

// Fotorahmen als SVG: Wellen oder Punkte, in einer Filamentfarbe
function frameSVG(style, hex) {
  const cx = 70, cy = 90, W = 112, H = 150;
  const photo = `<rect x="${cx - 38}" y="${cy - 54}" width="76" height="108" rx="2" fill="#f4efe9"/><circle cx="${cx + 14}" cy="${cy - 26}" r="9" fill="#f6d9a8"/><path d="M${cx - 38} ${cy + 30} q 24 -26 46 -4 t 30 -6 v 34 h -76z" fill="#cfe0cf"/>`;
  let border;
  if (style === "dots") {
    const p = rrPerimeter(cx, cy, W - 8, H - 8, 14), n = 26, r = 9;
    border = Array.from({ length: n }, (_, i) => { const [x, y] = p.at((i / n) * p.per); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${hex}"/>`; }).join("");
    border = `<g filter="url(#puff)">${border}</g>`;
  } else {
    const p = rrPerimeter(cx, cy, W - 6, H - 6, 20), N = 260, waves = 24, amp = 4.5, pts = [];
    for (let i = 0; i <= N; i++) { const s = (i / N) * p.per, [x, y, nx, ny] = p.at(s), o = amp * Math.sin((s / p.per) * waves * 2 * Math.PI); pts.push(`${(x + nx * o).toFixed(1)},${(y + ny * o).toFixed(1)}`); }
    border = `<path d="M${pts.join("L")}Z" fill="none" stroke="${hex}" stroke-width="15" stroke-linejoin="round" filter="url(#puff)"/>`;
  }
  return `<svg viewBox="0 0 140 180" aria-hidden="true">${photo}${border}</svg>`;
}

function posterMini(p) {
  return `<div class="mini-poster" style="background:${p.bg}">${p.lines.map((l) => `<span style="color:${p.fg}">${l}</span>`).join("")}</div>`;
}

/* ---------- Wandbild & Fotorahmen ---------- */
let posterSel = POSTERS[0].id, frameStyle = FRAME_STYLES[0].id, frameColor = "pt-sakura";
function renderPoster() {
  const p = POSTER_BY_ID[posterSel];
  $("#posterPrev").style.background = p.bg;
  const art = $("#posterArt"); art.dataset.lines = p.lines.join("|"); art.dataset.hex = p.fg;
  $("#posterOpts").innerHTML = POSTERS.map((o) => `<button class="opt" role="radio" aria-checked="${o.id === posterSel}" data-id="${o.id}"><span class="dot" style="background:${o.bg}"></span>${o.title}</button>`).join("");
  $("#posterPrice").textContent = chf(PRODUCTS.poster.price);
  $("#posterSize").textContent = PRODUCTS.poster.size;
}
function renderFrame() {
  if (!$("#framePrev")) return;
  $("#framePrev").innerHTML = frameSVG(frameStyle, COLOR_BY_ID[frameColor].hex);
  $("#frameStyles").innerHTML = FRAME_STYLES.map((s) => `<button class="opt plain" role="radio" aria-checked="${s.id === frameStyle}" data-id="${s.id}">${s.title}</button>`).join("");
  $("#frameColors").innerHTML = COLORS.map((c) => `<button class="cdot" role="radio" aria-checked="${c.id === frameColor}" aria-label="${c.name}" title="${c.name}" data-id="${c.id}" style="background:${c.hex}"></button>`).join("");
  $("#frameColorName").textContent = COLOR_BY_ID[frameColor].name;
  $("#framePrice").textContent = chf(PRODUCTS.frame.price);
}
$("#posterOpts").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (!b) return; posterSel = b.dataset.id; $("#posterAdded").textContent = ""; renderPoster(); renderArt(); });
$("#frameStyles").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (!b) return; frameStyle = b.dataset.id; $("#frameAdded").textContent = ""; renderFrame(); });
$("#frameColors").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (!b) return; frameColor = b.dataset.id; $("#frameAdded").textContent = ""; renderFrame(); });
$("#posterAdd").onclick = () => addProduct({ type: "poster", variant: posterSel }, $("#posterAdded"));
$("#frameAdd").onclick = () => addProduct({ type: "frame", style: frameStyle, color: frameColor }, $("#frameAdded"));

function renderDims() {
  const el = $("#dims"); if (!el) return;
  const H = SHOP.letterHeightCm, D = SHOP.letterDepthCm, cm = (v) => `${String(v).replace(".", ",")} cm`;
  // tatsächliche Höhe des Buchstabens A in der Schrift messen
  let asc = 70, wA = 80;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = "100px 'Cherry Bomb One'";
    const m = ctx.measureText("A");
    if (m.actualBoundingBoxAscent) asc = m.actualBoundingBoxAscent + (m.actualBoundingBoxDescent || 0);
    wA = m.width;
  } catch {}
  const s = 120 / asc;              // A wird 120 Einheiten hoch gezeichnet
  const top = 30, base = top + 120, depth = 120 * (D / H);
  const col = COLOR_BY_ID["bm-ice"].hex;
  const ax = 70, sideX = ax + wA * s + 90;
  el.innerHTML = `<svg viewBox="0 0 ${sideX + depth + 70} ${base + 46}">
    <text class="sub" x="${ax}" y="14">Vorne</text>
    <text x="${ax}" y="${base}" font-family="'Cherry Bomb One'" font-size="${100 * s}" fill="${col}" stroke="${col}" stroke-width="2.5" paint-order="stroke" filter="url(#puff)">A</text>
    <line x1="${ax - 22}" y1="${top}" x2="${ax - 22}" y2="${base}"/>
    <line x1="${ax - 28}" y1="${top}" x2="${ax - 16}" y2="${top}"/><line x1="${ax - 28}" y1="${base}" x2="${ax - 16}" y2="${base}"/>
    <text class="cap" x="${ax - 30}" y="${(top + base) / 2 + 4}" text-anchor="end">${cm(H)}</text>
    <text class="sub" x="${sideX}" y="14">Seite</text>
    <path d="M${sideX} ${top} H${sideX + depth * 0.5} C ${sideX + depth * 1.1667} ${top}, ${sideX + depth * 1.1667} ${base}, ${sideX + depth * 0.5} ${base} H${sideX} Z" fill="${col}" filter="url(#puff)"/>
    <line x1="${sideX}" y1="${base + 18}" x2="${sideX + depth}" y2="${base + 18}"/>
    <line x1="${sideX}" y1="${base + 12}" x2="${sideX}" y2="${base + 24}"/><line x1="${sideX + depth}" y1="${base + 12}" x2="${sideX + depth}" y2="${base + 24}"/>
    <text class="cap" x="${sideX + depth * 0.5}" y="${base + 40}" text-anchor="middle">${cm(D)}</text>
  </svg>`;
}

/* ---------- Bewertungen ---------- */
function renderReviews() {
  const sec = $("#bewertungen"), list = REVIEWS.filter((r) => r && r.text);
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const stars = (n) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
  if (list.length) {
    const avg = list.reduce((s, r) => s + (r.stars || 5), 0) / list.length;
    $("#reviewSummary").textContent = `${avg.toFixed(1).replace(".0", "")} von 5 Sternen aus ${list.length} ${list.length === 1 ? "Bewertung" : "Bewertungen"}`;
    $("#reviews").innerHTML = list.map((r) => `<article class="review"><span class="stars" aria-label="${r.stars || 5} von 5 Sternen">${stars(r.stars || 5)}</span><blockquote>${esc(r.text)}</blockquote><div><div class="who">${esc(r.name)}${r.place ? ", " + esc(r.place) : ""}</div>${r.product ? `<div class="tag">${esc(r.product)}</div>` : ""}</div></article>`).join("");
    sec.hidden = false;
  }
}

/* Abschnitte abwechselnd hell und getönt, ausgeblendete werden übersprungen */
function stripeSections() {
  let k = 0;
  document.querySelectorAll("main > section.block:not(#newsletter)").forEach((s) => { if (s.hidden) return; s.classList.toggle("alt", k % 2 === 1); k++; });
}

/* ---------- Leiste & Hero ---------- */
function renderAnnounce() {
  $("#announceTrack").innerHTML = ANNOUNCEMENTS.slice(0, 3).map((t, i) => `<span><b class="long">${t}</b><b class="short">${ANNOUNCEMENTS_SHORT[i] || t}</b></span>`).join("");
}

$("#faqPrice").textContent = `${chf(SHOP.pricePerLetter)} pro Buchstabe oder Zeichen. Ein Name mit vier Buchstaben kostet also ${chf(SHOP.pricePerLetter * 4)}. Der Preis wird im Studio laufend angezeigt.`;
$("#faqShip").textContent = `In die Schweiz und nach Liechtenstein. Der Versand kostet ${chf(SHOP.shipping)}${SHOP.freeShippingFrom ? `, ab einem Bestellwert von ${chf(SHOP.freeShippingFrom)} ist er gratis` : ""}. Wandbilder gibt es vorerst nur zur Abholung.`;
$("#year").textContent = new Date().getFullYear();
$("#footShip").textContent = `Lieferung in die Schweiz und nach Liechtenstein. Versand ${chf(SHOP.shipping)}${SHOP.freeShippingFrom ? `, ab ${chf(SHOP.freeShippingFrom)} gratis` : ""}. Wandbilder vorerst nur zur Abholung.`;
$("#footChat").onclick = () => $("#chatFab").click();

/* ---------- Newsletter ---------- */
$("#newsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, email = f.email.value.trim(), note = $("#newsNote"), btn = f.querySelector("button");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { note.textContent = "Bitte gib eine gültige E-Mail-Adresse ein."; note.classList.add("err"); f.email.focus(); return; }
  note.classList.remove("err"); btn.disabled = true; btn.textContent = "Einen Moment …";
  try {
    await postJSON("/api/newsletter", { email, website: f.website.value });
    f.hidden = true;
    note.textContent = `Danke! ${email} ist angemeldet.`;
    $("#newsCodeValue").textContent = NEWSLETTER.code;
    $("#newsCodeHint").textContent = `Gib den Code beim Bezahlen im Feld «Aktionscode» ein. Er gilt für ${NEWSLETTER.percent} % auf deine erste Bestellung.`;
    $("#newsCode").hidden = false;
  } catch (err) {
    note.textContent = err.message || "Das hat leider nicht geklappt. Bitte versuch es nochmals."; note.classList.add("err");
    btn.disabled = false; btn.textContent = "Code erhalten";
  }
});
$("#newsCopy").onclick = async () => {
  const b = $("#newsCopy");
  try { await navigator.clipboard.writeText(NEWSLETTER.code); b.textContent = "Kopiert"; }
  catch { const r = document.createRange(); r.selectNodeContents($("#newsCodeValue")); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = "Markiert"; }
  setTimeout(() => (b.textContent = "Kopieren"), 1600);
};
const fmt = (v) => String(v).replace(".", ",");
$("#sizeLead").textContent = `Jeder Buchstabe ist ${fmt(SHOP.letterHeightCm)} cm hoch und ${fmt(SHOP.letterDepthCm)} cm dick. Gross genug für eine Tür oder die Wand, klein genug für einen Bilderrahmen.`;
$("#specH").textContent = `${fmt(SHOP.letterHeightCm)} cm`;
$("#specD").textContent = `${fmt(SHOP.letterDepthCm)} cm`;
$("#faqSize").textContent = `Jeder Buchstabe ist ${fmt(SHOP.letterHeightCm)} cm hoch und ${fmt(SHOP.letterDepthCm)} cm dick. Die Breite hängt vom Buchstaben ab: Ein I ist schmal, ein M oder W breiter.`;
$("#studioNote").textContent = `Jeder Buchstabe ist ${fmt(SHOP.letterHeightCm)} cm hoch. Die Farben am Bildschirm sind Annäherungen an das echte Filament.`;
$("#letterPrice").textContent = chf(SHOP.pricePerLetter);
renderAnnounce(); renderReviews(); stripeSections();
window.addEventListener("scroll", () => $("#top").classList.toggle("scrolled", scrollY > 8), { passive: true });

$("#txt").value = state.text;
renderPoster(); renderFrame();
buildShelf(); render(); renderCart();
if (location.hash === "#warenkorb" && cart.length) openCart();
try { motion(); } catch (e) { console.warn(e); } // Animationen dürfen den Shop nie blockieren

if (document.fonts) {
  document.fonts.load("100px 'Cherry Bomb One'").then(() => document.fonts.ready).then(() => {
    fontReady = true; for (const k in widthCache) delete widthCache[k];
    render(); renderCart(); renderArt();
  }).catch(() => renderArt());
} else renderArt();

/* ---------- Chat: fragt zuerst nach dem Thema, beantwortet häufige Fragen, sonst Kontakt per E-Mail ---------- */
(function chat() {
  const fab = $("#chatFab"), box = $("#chat"), log = $("#chatLog"), chips = $("#chatChips"), form = $("#chatForm"), input = $("#chatText");
  if (!fab) return;
  const fmt = (v) => String(v).replace(".", ",");
  const free = SHOP.freeShippingFrom ? `, ab ${chf(SHOP.freeShippingFrom)} Bestellwert ist er gratis` : "";
  const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
  const history = [];
  const SAFETY = "Unsere Produkte sind Dekoration und kein Spielzeug. Wegen verschluckbarer Kleinteile gehören sie nicht in die Hände von Kindern unter 3 Jahren.";
  const colorSample = () => ["pt-sakura", "bm-ice", "es-matcha", "sp-lemon", "pm-purple"].map((id) => COLOR_BY_ID[id]?.name).filter(Boolean).join(", ");
  const PLA = "PLA ist ein Kunststoff aus nachwachsenden Rohstoffen wie Maisstärke oder Zuckerrohr und in industriellen Kompostieranlagen biologisch abbaubar. Jedes Stück wird erst gedruckt, wenn du bestellst.";

  // ---- Produkte und ihre Themen. lead: true = danach Kontaktformular anbieten
  const PRODUCTS_CHAT = {
    letters: {
      label: "Bubble Letters", keys: ["buchstab", "letter", "bubble", "name", "studio", "namen"],
      topics: {
        preis:     { label: "Preis", text: () => `Ein Buchstabe kostet ${chf(SHOP.pricePerLetter)}. Ein Name mit vier Buchstaben kommt also auf ${chf(SHOP.pricePerLetter * 4)}. Leerzeichen kosten nichts.`, actions: [["Zum Studio", "#studio"]] },
        varianten: { label: "Gestalten", text: () => "Im Studio tippst du deinen Text ein, tippst auf einen Buchstaben und wählst seine Farbe. Du siehst sofort, wie es aussieht, und legst es dann in den Warenkorb.", actions: [["Zum Studio", "#studio"]] },
        groesse:   { label: "Grösse", text: () => `Jeder Buchstabe ist ${fmt(SHOP.letterHeightCm)} cm hoch und ${fmt(SHOP.letterDepthCm)} cm dick. Die Breite hängt vom Buchstaben ab: Ein I ist schmal, ein M oder W breiter.`, actions: [["Grösse ansehen", "#groesse"]] },
        farben:    { label: "Farben", text: () => `Es gibt ${COLORS.length} Farben, zum Beispiel ${colorSample()}. Jeder Buchstabe kann eine eigene Farbe haben.`, actions: [["Farben im Studio", "#studio"]] },
        zeichen:   { label: "Zeichen", text: () => "Es gibt alle Buchstaben von A bis Z, Ä, Ã und die Zeichen & ! ? - . , : ~. Zahlen und Kleinbuchstaben haben wir noch nicht." },
        anbringen: { label: "Anbringen", text: () => "Die Rückseite ist flach. Am einfachsten halten die Buchstaben mit Klebepads oder doppelseitigem Klebeband an Tür und Wand. Für den Kühlschrank klebst du einen kleinen Magneten auf die Rückseite, im Bilderrahmen genügt ein Tropfen Leim.", actions: [["Ideen ansehen", "#ideen"]] },
        material:  { label: "Material", text: () => "Die Buchstaben sind aus PLA. " + PLA, actions: [["Mehr zum Material", "#material"]] },
        kinder:    { label: "Für Kinder?", text: () => SAFETY + " An der Tür, an der Wand oder im Rahmen sind die Buchstaben gut aufgehoben." },
      },
    },
    poster: {
      label: "Wandbild", keys: ["wandbild", "poster", "bild ", "bilder", "spruch", "positive", "happy", "how about", "vibes"],
      topics: {
        preis:     { label: "Preis", text: () => `Ein Wandbild (${PRODUCTS.poster.size}) kostet ${chf(PRODUCTS.poster.price)}. Wandbilder gibt es vorerst nur zur Abholung, den Termin vereinbaren wir nach der Bestellung per E-Mail.`, actions: [["Wandbilder ansehen", "#p-poster"]] },
        varianten: { label: "Sujets", text: () => `Es gibt drei Sujets: ${POSTERS.map((p) => `«${p.title}» in ${p.colorName}`).join(", ")}.`, actions: [["Wandbilder ansehen", "#p-poster"]] },
        farben:    { label: "Farben", text: () => `Jedes Sujet hat seinen eigenen Farbton: ${POSTERS.map((p) => `${p.colorName} für «${p.title}»`).join(", ")}. Hintergrund und Buchstaben sind Ton in Ton. Wünschst du eine andere Farbe, frag uns gern.` },
        groesse:   { label: "Grösse", text: () => `Das Wandbild ist ${PRODUCTS.poster.size} gross.`, actions: [["Wandbilder ansehen", "#p-poster"]] },
        anbringen: { label: "Aufhängen", text: () => "Das Wandbild kommt fertig zum Aufhängen. Wenn du wissen möchtest, wie genau es an deiner Wand hält, melden wir uns gern bei dir." },
        material:  { label: "Material", text: () => "Die Bubble Letters auf dem Wandbild sind aus dem gleichen PLA wie unsere Buchstaben. " + PLA },
        kinder:    { label: "Für Kinder?", text: () => SAFETY + " An der Wand ist das Wandbild gut aufgehoben." },
      },
    },
    frame: {
      label: "Fotorahmen", keys: ["rahmen", "fotorahmen", "welle", "punkte", "polaroid", "instax"],
      topics: {
        preis:     { label: "Preis", text: () => `Ein Fotorahmen kostet ${chf(PRODUCTS.frame.price)}.`, actions: [["Rahmen ansehen", "#p-frame"]] },
        varianten: { label: "Formen", text: () => `Den Fotorahmen gibt es mit ${FRAME_STYLES.map((s) => s.title).join(" oder mit ")}.`, actions: [["Rahmen ansehen", "#p-frame"]] },
        farben:    { label: "Farben", text: () => `Die Rahmen gibt es in allen ${COLORS.length} Filamentfarben, zum Beispiel ${colorSample()}.`, actions: [["Farbe wählen", "#p-frame"]] },
        groesse:   { label: "Fotogrösse", text: () => "Für welches Fotoformat der Rahmen passt und wie gross er ist, sagen wir dir gern persönlich. Hinterlass mir deine E-Mail-Adresse, dann melden wir uns.", lead: true },
        anbringen: { label: "Aufhängen", text: () => "Wie du den Rahmen aufhängst oder hinstellst, erklären wir dir gern persönlich. Hinterlass mir deine E-Mail, dann melden wir uns.", lead: true },
        material:  { label: "Material", text: () => "Die Rahmen sind aus PLA. " + PLA },
        kinder:    { label: "Für Kinder?", text: () => SAFETY },
      },
    },
  };

  // ---- Allgemeine Themen rund um Bestellung
  const ORDER_TOPICS = {
    versand:    { label: "Versand", text: () => `Wir liefern in die Schweiz und nach Liechtenstein. Der Versand kostet ${chf(SHOP.shipping)}${free}. Wandbilder gibt es vorerst nur zur Abholung, den Termin vereinbaren wir per E-Mail.` },
    dauer:      { label: "Lieferzeit", text: () => "Jede Bestellung wird nach Eingang für dich gedruckt und danach so schnell wie möglich verschickt. Brauchst du sie bis zu einem bestimmten Datum? Hinterlass mir deine E-Mail, dann sagen wir dir, ob es klappt.", lead: true },
    zahlung:    { label: "Zahlung", text: () => "Bezahlt wird nach dem Warenkorb auf der sicheren Zahlungsseite von Stripe. Dort siehst du alle verfügbaren Zahlungsarten. Danach bekommst du eine Bestätigung per E-Mail." },
    retour:     { label: "Rückgabe", text: () => "Personalisierte Artikel werden extra für dich gedruckt und sind deshalb vom Umtausch ausgeschlossen. Ist etwas beschädigt oder falsch angekommen, finden wir eine Lösung. Hinterlass mir deine E-Mail, dann melden wir uns.", lead: true },
    bestellung: { label: "Meine Bestellung", text: () => "Zu einer bestehenden Bestellung helfen wir dir gern persönlich. Hinterlass mir deine E-Mail und am besten die Bestellnummer, dann melden wir uns.", lead: true },
  };

  // ---- Stichwörter (Wortanfänge, ohne Umlaute)
  const TOPIC_KEYS = {
    preis: ["preis", "kost", "teuer", "chf", "franken", "gunstig"],
    groesse: ["gross", "grose", "mass", "cm", "zentimeter", "dick", "hoch", "breit", "dimension", "format", "fotogross"],
    farben: ["farb", "color", "rosa", "pink", "blau", "grun", "gelb", "rot", "pastell", "matt", "glanz", "bordeaux"],
    zeichen: ["zeichen", "umlaut", "zahlen", "ziffer", "sonderzeichen", "kleinbuchstab", "komma"],
    anbringen: ["anbring", "kleb", "befestig", "halt", "magnet", "wand ", "wande", "tur", "aufhang", "montier", "pads", "aufstell", "hinstell", "nagel"],
    material: ["material", "pla", "kunststoff", "plastik", "nachhalt", "abbau", "umwelt", "bio"],
    kinder: ["kind", "baby", "sicher", "spielzeug", "verschluck", "gefahr", "kleinkind", "giftig"],
    varianten: ["sujet", "spruch", "motiv", "auswahl", "form", "variante", "design", "gestalt", "welche gibt", "was gibt"],
    versand: ["versand", "liefer", "porto", "schick", "post", "paket", "ausland", "deutschland", "osterreich"],
    dauer: ["wie lange", "dauer", "wann", "lieferzeit", "schnell", "termin", "geburtstag", "rechtzeitig"],
    zahlung: ["zahlung", "bezahl", "twint", "karte", "kreditkarte", "rechnung", "apple pay", "google pay", "stripe", "paypal"],
    retour: ["ruckgab", "umtausch", "retour", "zuruck", "reklam", "kaputt", "defekt", "beschadigt", "falsch"],
    bestellung: ["meine bestellung", "bestellnummer", "status", "sendung", "tracking", "storn", "andern"],
    hallo: ["hallo", "hoi", "hi", "gruezi", "guten tag", "hey", "sali", "salut"],
    danke: ["danke", "merci", "super", "perfekt", "toll"],
  };

  const prep = (text) => " " + norm(text).replace(/[^a-z0-9& ]+/g, " ") + " ";
  const hits = (t, keys) => keys.reduce((n, k) => n + (t.includes(" " + norm(k)) ? (k.trim().includes(" ") ? 2 : 1) : 0), 0);
  function detectProduct(t) {
    let best = null, s = 0;
    for (const [id, p] of Object.entries(PRODUCTS_CHAT)) { const h = hits(t, p.keys); if (h > s) { s = h; best = id; } }
    return best;
  }
  function detectTopic(t) {
    let best = null, s = 0;
    for (const [id, keys] of Object.entries(TOPIC_KEYS)) { const h = hits(t, keys); if (h > s) { s = h; best = id; } }
    return best;
  }

  // ---- Darstellung
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function add(who, text, extra = "") {
    const el = document.createElement("div");
    el.className = `msg ${who}`;
    el.innerHTML = esc(text) + extra;
    log.appendChild(el); log.scrollTop = log.scrollHeight;
    history.push(`${who === "me" ? "Kunde" : "Chat"}: ${text}`);
    return el;
  }
  function botSay(text, opts = {}) {
    const t = document.createElement("div");
    t.className = "msg bot"; t.innerHTML = `<span class="typing" aria-label="schreibt"><i></i><i></i><i></i></span>`;
    log.appendChild(t); log.scrollTop = log.scrollHeight;
    setTimeout(() => {
      t.remove();
      const acts = (opts.actions || []).map(([l, h]) => `<button data-go="${h}">${esc(l)}</button>`).join("")
        + (opts.offerLead ? `<button data-lead="1">Jemand soll sich melden</button>` : "");
      add("bot", text, acts ? `<div class="actions">${acts}</div>` : "");
      if (opts.lead) showLead();
      if (opts.chips) setChips(opts.chips);
    }, 450);
  }
  function setChips(list) {
    chips.innerHTML = list.map(([label, kind, val]) => `<button data-kind="${kind}" data-val="${val || ""}">${esc(label)}</button>`).join("");
    chips.scrollLeft = 0;
  }

  // ---- Chip-Sätze
  const MAIN = () => [
    ...Object.entries(PRODUCTS_CHAT).map(([id, p]) => [p.label, "product", id]),
    ["Bestellung & Versand", "order"], ["Etwas anderes", "other"],
  ];
  const productChips = (id) => [
    ...Object.entries(PRODUCTS_CHAT[id].topics).map(([tid, tp]) => [tp.label, "topic", tid]),
    ["Anderes Thema", "main"], ["Persönlich fragen", "lead"],
  ];
  const orderChips = () => [...Object.entries(ORDER_TOPICS).map(([id, t]) => [t.label, "order-topic", id]), ["Anderes Thema", "main"], ["Persönlich fragen", "lead"]];

  let ctx = null;           // aktuelles Produkt
  let pendingTopic = null;  // Frage ohne Produkt, wartet auf Auswahl
  let lastQuestion = "";

  function sayTopic(productId, topicId) {
    const tp = PRODUCTS_CHAT[productId].topics[topicId];
    botSay(tp.text(), { actions: tp.actions, lead: tp.lead, offerLead: !tp.lead, chips: productChips(productId) });
  }
  function sayOrder(id) {
    const tp = ORDER_TOPICS[id];
    botSay(tp.text(), { lead: tp.lead, offerLead: !tp.lead, chips: orderChips() });
  }
  function chooseProduct(id) {
    ctx = id;
    if (pendingTopic && PRODUCTS_CHAT[id].topics[pendingTopic]) { const t = pendingTopic; pendingTopic = null; sayTopic(id, t); return; }
    pendingTopic = null;
    botSay(`Gern! Was möchtest du zum ${PRODUCTS_CHAT[id].label === "Bubble Letters" ? "Thema Bubble Letters" : PRODUCTS_CHAT[id].label} wissen? Tipp auf ein Thema oder schreib deine Frage.`, { chips: productChips(id) });
  }

  // ---- Freitext
  function answer(text) {
    const q = text.trim(); if (!q) return;
    add("me", q); lastQuestion = q;
    const t = prep(q);
    const prod = detectProduct(t);
    const topic = detectTopic(t);
    if (prod) ctx = prod;

    if (topic === "hallo" && !prod) return botSay("Hallo! Worum geht es bei deiner Frage?", { chips: MAIN() });
    if (topic === "danke") return botSay("Gern geschehen! Wenn noch etwas offen ist, frag einfach.", { chips: ctx ? productChips(ctx) : MAIN() });
    if (topic && ORDER_TOPICS[topic]) return sayOrder(topic);
    if (topic && ctx && PRODUCTS_CHAT[ctx].topics[topic]) return sayTopic(ctx, topic);
    if (topic && !ctx && ["preis", "groesse", "farben", "anbringen", "material", "kinder", "varianten"].includes(topic)) {
      pendingTopic = topic;
      return botSay("Zu welchem Produkt ist deine Frage?", { chips: MAIN().filter(([, k]) => k === "product") });
    }
    if (topic === "zeichen") { ctx = "letters"; return sayTopic("letters", "zeichen"); }
    if (prod && !topic) return chooseProduct(prod);
    botSay("Darauf habe ich leider keine passende Antwort. Hinterlass mir deine E-Mail-Adresse, dann meldet sich jemand von uns persönlich.", { lead: true });
  }

  // ---- Kontaktformular
  function showLead(question = lastQuestion) {
    const old = log.querySelector(".lead-wrap"); if (old) old.remove();
    const wrap = document.createElement("div");
    wrap.className = "msg bot lead-wrap";
    wrap.innerHTML = `<form class="lead-form" novalidate>
      <input type="text" name="name" placeholder="Vorname (optional)" autocomplete="given-name">
      <input type="email" name="email" placeholder="Deine E-Mail-Adresse" required autocomplete="email">
      <textarea name="frage" placeholder="Worum geht es?">${esc(question)}</textarea>
      <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn primary" type="submit">Absenden</button>
      <small>Wir verwenden deine E-Mail nur, um dir zu antworten.</small>
    </form>`;
    log.appendChild(wrap); log.scrollTop = log.scrollHeight;
    const f = wrap.querySelector("form");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(f));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email || "")) { f.email.focus(); f.email.style.borderColor = "var(--error)"; return; }
      const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Wird gesendet …";
      try {
        await postJSON("/api/contact", { name: data.name || "", email: data.email, question: data.frage || "", history: history.join("\n").slice(-4000), website: data.website || "" });
        wrap.remove();
        botSay(`Danke${data.name ? ", " + data.name : ""}! Deine Nachricht ist bei uns angekommen. Wir melden uns so bald wie möglich an ${data.email}.`, { chips: MAIN() });
      } catch {
        btn.disabled = false; btn.textContent = "Absenden";
        botSay("Das hat leider nicht geklappt. Bitte versuch es nochmals oder schreib uns direkt an hallo@filamour.ch.");
      }
    });
    f.email.focus({ preventScroll: true });
  }

  // ---- Klicks
  chips.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const { kind, val } = b.dataset;
    add("me", b.textContent);
    if (kind === "product") return chooseProduct(val);
    if (kind === "topic") return sayTopic(ctx, val);
    if (kind === "order") { ctx = null; return botSay("Was möchtest du zu Bestellung und Versand wissen?", { chips: orderChips() }); }
    if (kind === "order-topic") return sayOrder(val);
    if (kind === "main") { ctx = null; pendingTopic = null; return botSay("Worum geht es?", { chips: MAIN() }); }
    if (kind === "other") return botSay("Schreib mir deine Frage unten ins Feld. Wenn ich sie nicht beantworten kann, leite ich sie an uns weiter.", { offerLead: true, chips: MAIN() });
    if (kind === "lead") return botSay("Gern! Hinterlass mir deine E-Mail-Adresse und deine Frage, dann meldet sich jemand von uns.", { lead: true });
  });
  log.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || b.closest(".lead-form")) return;
    if (b.dataset.lead) { showLead(); return; }
    if (b.dataset.go) { const t = document.querySelector(b.dataset.go); if (t) { if (matchMedia("(max-width: 520px)").matches) toggle(false); t.scrollIntoView({ behavior: "smooth" }); } }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); answer(input.value); input.value = ""; });

  let started = false;
  function toggle(open) {
    box.hidden = !open; fab.setAttribute("aria-expanded", open);
    if (open) {
      if (!started) { started = true; botSay("Hallo! Schön, dass du da bist. Worum geht es bei deiner Frage?", { chips: MAIN() }); }
      setTimeout(() => input.focus({ preventScroll: true }), 50);
    } else fab.focus({ preventScroll: true });
  }
  fab.onclick = () => toggle(true);
  $("#chatClose").onclick = () => toggle(false);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden && $("#drawer").hidden) toggle(false); });
})();
