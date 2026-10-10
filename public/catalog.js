// Filamour – Sortiment und Preise
// Diese Datei wird vom Shop (Browser) UND von der Checkout-Funktion (Server) gelesen.
// Preise immer hier ändern: Der Server rechnet mit diesen Werten, nicht mit dem, was der Browser schickt.

export const SHOP = {
  name: "Filamour",
  currency: "chf",
  shipping: 700,              // Rappen Versand pro Bestellung (CHF 7.00)
  freeShippingFrom: 6000,     // ab diesem Warenwert gratis Versand (0 = nie)
  shippingCountries: ["CH", "LI"],
  maxLettersPerDesign: 40,
  maxQuantity: 20,
  maxDesignsPerOrder: 20,
};

// Buchstaben-Grössen, die erste ist der Standard. price = Rappen pro Buchstabe/Zeichen (490 = CHF 4.90)
export const LETTER_SIZES = [
  { id: "gross", name: "Gross", heightCm: 6.5, depthCm: 2.5, price: 490 },
  { id: "klein", name: "Klein", heightCm: 2.5, depthCm: 1,   price: 290 },
];
export const SIZE_BY_ID = Object.fromEntries(LETTER_SIZES.map((s) => [s.id, s]));
// Grösse eines Designs; ältere Warenkörbe ohne Grösse sind «gross». Unbekannt → null
export function letterSize(id) {
  const key = id || LETTER_SIZES[0].id;
  return Object.hasOwn(SIZE_BY_ID, key) ? SIZE_BY_ID[key] : null;
}

// Newsletter: Rabattcode für die erste Bestellung.
// Den gleichen Code in Stripe als Aktionscode anlegen (Produkte → Gutscheine), siehe README.
export const NEWSLETTER = { code: "WILLKOMMEN10", percent: 10 };

// Hinweise: die ersten drei stehen in der schwarzen Leiste ganz oben
export const ANNOUNCEMENTS = [
  "Personalisierbare Geschenke",
  "Gratisversand ab CHF 60",
  "Aus pflanzenbasiertem PLA",
  "Gedruckt in der Schweiz",
];
// Kurzfassungen der ersten drei für schmale Handy-Bildschirme
export const ANNOUNCEMENTS_SHORT = ["Personalisierbar", "Gratis ab CHF 60", "PLA aus Pflanzen"];

// Zeichen, die auf der Druckplatte vorhanden sind
export const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÃ&!?-.,:~";

// Filamente (Farbtöne sind Bildschirm-Annäherungen)
export const COLORS = [
  { id: "bl-green",   name: "Bambu Green",     hex: "#00AE42" },
  { id: "bl-mistle",  name: "Mistletoe Green", hex: "#3F8E43" },
  { id: "bl-yellow",  name: "Yellow",          hex: "#F4EE2A" },
  { id: "bl-orange",  name: "Orange",          hex: "#FF6A13" },
  { id: "bl-red",     name: "Red",             hex: "#C12E1F" },
  { id: "bl-magenta", name: "Magenta",         hex: "#EC008C" },
  { id: "bl-cocoa",   name: "Cocoa Brown",     hex: "#6F5034" },
  { id: "bl-gray",    name: "Gray",            hex: "#8E9089" },
  { id: "bl-bluegrey",name: "Blue Grey",       hex: "#5B6579" },
  { id: "bl-black",   name: "Black",           hex: "#1A1A1A" },
  { id: "pt-white",   name: "Cotton White",    hex: "#EEE8DF" },
  { id: "pt-peanut",  name: "Peanut",          hex: "#D1A574" },
  { id: "pt-sakura",  name: "Sakura Pink",     hex: "#F1B3C5" },
  { id: "pt-sapph",   name: "Sapphire Blue",   hex: "#22509F" },
  { id: "bm-ice",     name: "Ice Blue",        hex: "#A6D7E2" },
  { id: "es-matcha",  name: "Matcha Green",    hex: "#BFD080" },   // eSUN PLA-Matte
  { id: "es-apricot", name: "Apricot",         hex: "#EA9A45" },   // eSUN PLA+HS
  { id: "sp-lemon",   name: "Lemon Cream",     hex: "#FBEEB2" },   // Spectrum Pastello
  { id: "sp-mauve",   name: "Cosmetic Mauve",  hex: "#E3CFDF" },   // Spectrum Pastello
  { id: "sp-flamingo",name: "Flamingo Red",    hex: "#F6A49A" },   // Spectrum Pastello
  { id: "pm-purple",  name: "Muted Purple",    hex: "#9E88B2" },   // Polymaker PolyTerra
];

export const COLOR_BY_ID = Object.fromEntries(COLORS.map((c) => [c.id, c]));

// Weitere Produkte. Preise in Rappen.
export const PRODUCTS = {
  poster: { name: "Wandbild", price: 3950, size: "50 × 60 cm", pickupOnly: true }, // vorerst kein Versand
  frame:  { name: "Fotorahmen", price: 1900 },   // PLATZHALTER: Preis bestätigen
};

// Wandbild-Sujets: Hintergrund (bg) und Buchstaben (fg) in einem Farbton
export const POSTERS = [
  { id: "positive", title: "ONLY POSITIVE VIBES", lines: ["ONLY", "POSITIVE", "VIBES"], colorName: "Rosa",     bg: "#f2c4d1", fg: "#fbe1e8" },
  { id: "happy",    title: "MY HAPPY PLACE",      lines: ["MY", "HAPPY", "PLACE"],      colorName: "Bordeaux", bg: "#6b1f2d", fg: "#a1404f" },
  { id: "no",       title: "HOW ABOUT NO",        lines: ["HOW", "ABOUT", "NO"],        colorName: "Gelb",     bg: "#eccc5c", fg: "#f8e59a" },
];
export const POSTER_BY_ID = Object.fromEntries(POSTERS.map((p) => [p.id, p]));

// Fotorahmen: Form, Farbe aus der Filament-Liste
export const FRAME_STYLES = [
  { id: "wave", title: "Wellen" },
  { id: "dots", title: "Punkte" },
];
export const FRAME_BY_ID = Object.fromEntries(FRAME_STYLES.map((s) => [s.id, s]));

// Nur druckbare Zeichen zählen (Leerzeichen und unbekannte Zeichen nicht)
export function pieces(text, colors) {
  const up = String(text || "").toUpperCase();
  const out = [];
  [...up].forEach((ch, i) => {
    if (CHARS.includes(ch)) out.push({ ch, color: colors?.[i] });
  });
  return out;
}

// Ein Warenkorb-Eintrag → Preis und Beschreibung. Wird von Shop und Server gleich verwendet.
// Gibt { error } zurück, wenn der Eintrag ungültig ist.
export function describeItem(it) {
  const type = it?.type || "letters";
  if (type === "letters") {
    const list = pieces(it.text, it.colors);
    if (!list.length) return { error: "Ein Design enthält keine bestellbaren Buchstaben." };
    if (list.length > SHOP.maxLettersPerDesign) return { error: `Maximal ${SHOP.maxLettersPerDesign} Buchstaben pro Design.` };
    if (list.some((p) => !COLOR_BY_ID[p.color])) return { error: "Eine gewählte Farbe ist nicht mehr verfügbar. Bitte das Design neu einfärben." };
    const size = letterSize(it.size);
    if (!size) return { error: "Diese Buchstaben-Grösse gibt es nicht mehr." };
    // nur, was auch gedruckt wird (z. B. «HALLO 123» → «HALLO»)
    const text = [...String(it.text).toUpperCase()].filter((c) => c === " " || CHARS.includes(c)).join("").replace(/\s+/g, " ").trim();
    return {
      type, unit: list.length * size.price,
      name: `Bubble Letters «${text}» (${list.length} Teile, ${size.name} ${cm(size.heightCm)})`,
      description: list.map((p) => `${p.ch} ${COLOR_BY_ID[p.color].name}`).join(" · "),
      meta: `${size.name}, ${list.length} Buchstaben à ${chf(size.price)}`,
    };
  }
  if (type === "poster") {
    const p = POSTER_BY_ID[it.variant];
    if (!p) return { error: "Dieses Wandbild gibt es nicht mehr." };
    return { type, unit: PRODUCTS.poster.price, name: `Wandbild «${p.title}»`, description: p.colorName, meta: `Farbe ${p.colorName}` };
  }
  if (type === "frame") {
    const s = FRAME_BY_ID[it.style], col = COLOR_BY_ID[it.color];
    if (!s || !col) return { error: "Dieser Fotorahmen ist nicht mehr verfügbar." };
    return { type, unit: PRODUCTS.frame.price, name: `Fotorahmen ${s.title}`, description: col.name, meta: `Farbe ${col.name}` };
  }
  return { error: "Unbekannter Artikel." };
}

export function designPrice(text, colors, sizeId) {
  return pieces(text, colors).length * (letterSize(sizeId)?.price ?? 0);
}

// Enthält die Bestellung einen Artikel, der nur abgeholt werden kann, wird die ganze Bestellung abgeholt
export const PICKUP_NOTE = "Wandbilder gibt es vorerst nur zur Abholung. Wir melden uns nach der Bestellung per E-Mail für einen Termin.";
export function isPickup(items) {
  return (items || []).some((it) => Object.hasOwn(PRODUCTS, it?.type) && PRODUCTS[it.type].pickupOnly);
}

export function shippingFor(subtotal, pickup = false) {
  if (pickup || subtotal <= 0) return 0;
  if (SHOP.freeShippingFrom && subtotal >= SHOP.freeShippingFrom) return 0;
  return SHOP.shipping;
}

export function chf(rappen) {
  return "CHF " + (rappen / 100).toFixed(2);
}

export function cm(value) {
  return String(value).replace(".", ",") + " cm";
}
