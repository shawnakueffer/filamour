// Filamour – Sortiment und Preise
// Diese Datei wird vom Shop (Browser) UND von der Checkout-Funktion (Server) gelesen.
// Preise immer hier ändern: Der Server rechnet mit diesen Werten, nicht mit dem, was der Browser schickt.

export const SHOP = {
  name: "Filamour",
  currency: "chf",
  shipping: 650,              // Rappen Versand pro Bestellung (CHF 6.50)
  freeShippingFrom: 6000,     // ab diesem Warenwert gratis Versand (0 = nie)
  shippingCountries: ["CH", "LI"],
  maxLettersPerDesign: 40,
  maxQuantity: 20,
  maxDesignsPerOrder: 20,
};

// Buchstaben-Grössen, die erste ist der Standard. price = Rappen pro Buchstabe/Zeichen (490 = CHF 4.90)
export const LETTER_SIZES = [
  { id: "gross", name: "Gross", heightCm: 6.5, depthCm: 2.2, price: 490 },
  { id: "klein", name: "Klein", heightCm: 3,   depthCm: 1,   price: 290 },
];
// Nachschlage-Tabellen ohne Prototyp: «__proto__» oder «constructor» aus dem Browser finden so nichts
const byId = (list) => Object.assign(Object.create(null), Object.fromEntries(list.map((x) => [x.id, x])));

export const SIZE_BY_ID = byId(LETTER_SIZES);
// Oberfläche der Buchstaben (nicht beim Alphabet: das gibt es nur matt). surcharge = Aufpreis in Rappen pro Buchstabe
export const LETTER_FINISHES = [
  { id: "matt", name: "Matt", surcharge: 0 },
  { id: "glaenzend", name: "Glänzend", surcharge: 50,
    note: "Glänzende Buchstaben werden von Hand mit Klarlack lackiert. Der Lack kann in den ersten Tagen noch leicht riechen, lass sie am besten kurz auslüften." },
];
export const FINISH_BY_ID = byId(LETTER_FINISHES);
// Oberfläche eines Designs; ältere Warenkörbe ohne Angabe sind matt. Unbekannt → null
export function letterFinish(id) {
  const key = id || LETTER_FINISHES[0].id;
  return Object.hasOwn(FINISH_BY_ID, key) ? FINISH_BY_ID[key] : null;
}
// Preis pro Buchstabe je Grösse und Oberfläche
export const letterPrice = (size, finish) => size.price + finish.surcharge;

// Grösse eines Designs; ältere Warenkörbe ohne Grösse sind «gross». Unbekannt → null
export function letterSize(id) {
  const key = id || LETTER_SIZES[0].id;
  return Object.hasOwn(SIZE_BY_ID, key) ? SIZE_BY_ID[key] : null;
}

// Newsletter: Rabattcode für die erste Bestellung.
// Den gleichen Code in Stripe als Aktionscode anlegen (Produkte → Gutscheine), siehe README.
export const NEWSLETTER = { code: "GIFT10", percent: 10 };

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
  // Reihenfolge und Farbtöne genau nach der Farbkarte (Oktober 2026), Black dazu
  { id: "pt-white",   name: "Cotton White",    hex: "#FFFFFF" },
  { id: "sp-lemon",   name: "Lemon Cream",     hex: "#F7E484" },
  { id: "bl-yellow",  name: "Yellow",          hex: "#F5DD32" },
  { id: "es-apricot", name: "Apricot",         hex: "#F3B572" },
  { id: "bl-orange",  name: "Orange",          hex: "#F67931" },
  { id: "bl-red",     name: "Red",             hex: "#BD2C38" },
  { id: "sp-flamingo",name: "Flamingo Red",    hex: "#F28E88" },
  { id: "pt-sakura",  name: "Sakura Pink",     hex: "#EDBFCB" },
  { id: "bl-magenta", name: "Magenta",         hex: "#E35ABC" },
  { id: "sp-mauve",   name: "Mauve",           hex: "#E3CDE0" },
  { id: "pm-purple",  name: "Muted Purple",    hex: "#987292" },
  { id: "bm-ice",     name: "Ice Blue",        hex: "#A7E1EB" },
  { id: "pt-sapph",   name: "Sapphire Blue",   hex: "#1F70A4" },
  { id: "bl-bluegrey",name: "Blue Grey",       hex: "#616C76" },
  { id: "bl-gray",    name: "Grey",            hex: "#B0AFAA" },
  { id: "es-matcha",  name: "Matcha Green",    hex: "#C9DD86" },
  { id: "bl-green",   name: "Green",           hex: "#23BE65" },
  { id: "bl-mistle",  name: "Mistletoe Green", hex: "#00825C" },
  { id: "bl-cocoa",   name: "Cocoa Brown",     hex: "#755240" },
  { id: "pt-peanut",  name: "Peanut",          hex: "#D7B892" },
  { id: "bl-black",   name: "Black",           hex: "#000000" },
];

export const COLOR_BY_ID = byId(COLORS);

// Alphabet-Set: alle Buchstaben A–Z in einer Grösse, ganz weiss oder farbig.
// Farbig: bis zu 5 Farben, die sich in der gewählten Reihenfolge abwechseln (A = Farbe 1, B = Farbe 2 …).
export const ALPHABET = {
  active: true,
  letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  white: "pt-white",
  maxColors: 5,
  price: { gross: { farbig: 9900, weiss: 8900 }, klein: { farbig: 5900, weiss: 4900 } }, // Rappen
};
// Vergleichspreis (durchgestrichen): was die 26 Buchstaben einzeln im Studio kosten. Muss ein echter Preis sein (PBV).
export const alphabetSinglePrice = (sizeId) => [...ALPHABET.letters].length * (letterSize(sizeId)?.price ?? 0);
// Farbe pro Buchstabe (Liste von Farb-IDs in der Reihenfolge von ALPHABET.letters)
export function alphabetColors(variant, colors) {
  const palette = variant === "weiss" ? [ALPHABET.white] : colors;
  return [...ALPHABET.letters].map((_, i) => palette[i % palette.length]);
}

// Weitere Produkte. Preise in Rappen.
// active: false blendet ein Produkt im Shop aus und der Server nimmt keine Bestellungen dafür an.
// Zum Wiedereinblenden auf true setzen (und in rechtliches.html den Satz zur Abholung von Wandbildern ergänzen).
export const PRODUCTS = {
  poster: { name: "Wandbild", price: 3950, size: "50 × 60 cm", pickupOnly: true, active: false }, // vorerst kein Versand
  frame:  { name: "Fotorahmen", price: 1900, active: false },   // PLATZHALTER: Preis bestätigen
};

// Wandbild-Sujets: Hintergrund (bg) und Buchstaben (fg) in einem Farbton
export const POSTERS = [
  { id: "positive", title: "ONLY POSITIVE VIBES", lines: ["ONLY", "POSITIVE", "VIBES"], colorName: "Rosa",     bg: "#f2c4d1", fg: "#fbe1e8" },
  { id: "happy",    title: "MY HAPPY PLACE",      lines: ["MY", "HAPPY", "PLACE"],      colorName: "Bordeaux", bg: "#6b1f2d", fg: "#a1404f" },
  { id: "no",       title: "HOW ABOUT NO",        lines: ["HOW", "ABOUT", "NO"],        colorName: "Gelb",     bg: "#eccc5c", fg: "#f8e59a" },
];
export const POSTER_BY_ID = byId(POSTERS);

// Fotorahmen: Form, Farbe aus der Filament-Liste
export const FRAME_STYLES = [
  { id: "wave", title: "Wellen" },
  { id: "dots", title: "Punkte" },
];
export const FRAME_BY_ID = byId(FRAME_STYLES);

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
    const finish = letterFinish(it.finish);
    if (!finish) return { error: "Diese Oberfläche gibt es nicht mehr." };
    const each = letterPrice(size, finish);
    // nur, was auch gedruckt wird (z. B. «HALLO 123» → «HALLO»)
    const text = [...String(it.text).toUpperCase()].filter((c) => c === " " || CHARS.includes(c)).join("").replace(/\s+/g, " ").trim();
    return {
      type, unit: list.length * each,
      name: `Bubble Letters «${text}» (${list.length} Teile, ${size.name} ${cm(size.heightCm)}, ${finish.name.toLowerCase()})`,
      description: list.map((p) => `${p.ch} ${COLOR_BY_ID[p.color].name}`).join(" · "),
      meta: `${size.name}, ${finish.name.toLowerCase()}, ${list.length} Buchstaben à ${chf(each)}`,
    };
  }
  if (type === "alphabet") {
    if (!ALPHABET.active) return { error: "Das Alphabet gibt es im Moment nicht." };
    const size = letterSize(it.size);
    if (!size) return { error: "Diese Buchstaben-Grösse gibt es nicht mehr." };
    let palette;
    if (it.variant === "weiss") palette = [ALPHABET.white];
    else if (it.variant === "farbig") {
      palette = Array.isArray(it.colors) ? it.colors.map(String) : [];
      if (!palette.length || palette.length > ALPHABET.maxColors || new Set(palette).size !== palette.length || palette.some((id) => !COLOR_BY_ID[id])) {
        return { error: `Bitte wähle für das Alphabet 1 bis ${ALPHABET.maxColors} verschiedene Farben.` };
      }
    } else return { error: "Diese Alphabet-Variante gibt es nicht." };
    const letters = [...ALPHABET.letters], perLetter = alphabetColors(it.variant, palette);
    return {
      type, unit: ALPHABET.price[size.id][it.variant],
      name: `Alphabet A–Z (${letters.length} Teile, ${size.name} ${cm(size.heightCm)}, matt)`,
      description: letters.map((ch, i) => `${ch} ${COLOR_BY_ID[perLetter[i]].name}`).join(" · "),
      meta: it.variant === "weiss" ? `${size.name}, ganz weiss` : `${size.name}, ${palette.length} ${palette.length === 1 ? "Farbe" : "Farben"} im Wechsel`,
    };
  }
  if (type === "poster") {
    if (!PRODUCTS.poster.active) return { error: "Wandbilder gibt es im Moment nicht." };
    const p = POSTER_BY_ID[it.variant];
    if (!p) return { error: "Dieses Wandbild gibt es nicht mehr." };
    return { type, unit: PRODUCTS.poster.price, name: `Wandbild «${p.title}»`, description: p.colorName, meta: `Farbe ${p.colorName}` };
  }
  if (type === "frame") {
    if (!PRODUCTS.frame.active) return { error: "Fotorahmen gibt es im Moment nicht." };
    const s = FRAME_BY_ID[it.style], col = COLOR_BY_ID[it.color];
    if (!s || !col) return { error: "Dieser Fotorahmen ist nicht mehr verfügbar." };
    return { type, unit: PRODUCTS.frame.price, name: `Fotorahmen ${s.title}`, description: col.name, meta: `Farbe ${col.name}` };
  }
  return { error: "Unbekannter Artikel." };
}

export function designPrice(text, colors, sizeId, finishId) {
  const size = letterSize(sizeId), finish = letterFinish(finishId);
  return size && finish ? pieces(text, colors).length * letterPrice(size, finish) : 0;
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
