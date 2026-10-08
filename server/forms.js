// Prüft die Eingaben aus Newsletter- und Kontaktformular.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v, n) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, n);

export function cleanEmail(v) {
  const email = clip(v, 254).toLowerCase();
  return EMAIL.test(email) ? email : null;
}

// Verstecktes Feld, das nur Bots ausfüllen
export const isBot = (body) => Boolean(body?.website);

export function validateNewsletter(body) {
  const email = cleanEmail(body?.email);
  if (!email) return { error: "Bitte gib eine gültige E-Mail-Adresse ein." };
  return { email };
}

export function validateContact(body) {
  const email = cleanEmail(body?.email);
  if (!email) return { error: "Bitte gib eine gültige E-Mail-Adresse ein." };
  return {
    message: {
      name: clip(body?.name, 100),
      email,
      question: clip(body?.question, 2000),
      history: clip(body?.history, 4000),
    },
  };
}
