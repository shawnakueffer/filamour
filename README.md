# Filamour Onlineshop

Minimalistischer Shop für 3D-gedruckte Bubble Letters, mit Studio, Warenkorb und Bezahlung über Stripe Checkout.

## Aufbau

```
public/                  die Website
  index.html             Shop: Hero, Studio, Grösse, Ideen, Material, weitere Produkte, Fragen, Warenkorb
  success.html           Danke-Seite nach der Zahlung
  rechtliches.html       Impressum & Datenschutz (Platzhalter ausfüllen!)
  catalog.js             Preise, Versand, Farben, Zeichen, Hinweise oben  ← hier anpassen
  reviews.js             Kundenbewertungen (leer = Bereich ausgeblendet)
  app.js, styles.css     Logik und Gestaltung
  images/                Logo (logo.svg) und Produktfoto
  fonts/                 Bubble-Schrift (Cherry Bomb One, nur benötigte Zeichen)
netlify/functions/
  checkout.mjs           /api/checkout – prüft den Warenkorb, startet Stripe Checkout
  order.mjs              /api/order – Zusammenfassung für die Danke-Seite
test/                    Tests ohne echte Konten (npm test)
```

**Sicherheit:** Der Browser schickt nur Text, Farben und Menge. Den Preis rechnet der Server mit `catalog.js` neu aus. Manipulierte Preise sind so nicht möglich. Der geheime Stripe-Schlüssel liegt nur auf dem Server.

## Online stellen (Netlify, ca. 15 Minuten)

1. Konto auf [netlify.com](https://netlify.com) erstellen (Gratis-Plan reicht).
2. Den Ordner auf GitHub hochladen und in Netlify **Add new site → Import an existing project** wählen.
   Netlify erkennt `netlify.toml` selbst, es braucht keine weiteren Einstellungen.
3. In Netlify unter **Site configuration → Environment variables** hinzufügen:
   - `STRIPE_SECRET_KEY` = dein Schlüssel aus dem Stripe-Dashboard → Entwickler → API-Schlüssel.
     Zum Testen zuerst den **Testschlüssel** `sk_test_…` nehmen.
4. **Deploy** auslösen. Fertig.
5. Eigene Domain (z. B. filamour.ch): Netlify → Domain management → Add domain.

## Testen

- Mit dem Testschlüssel eine Bestellung durchspielen. Testkarte: `4242 4242 4242 4242`, beliebiges Datum in der Zukunft, beliebige CVC.
- Wenn alles stimmt: in Netlify den Schlüssel durch `sk_live_…` ersetzen und neu deployen.

## Bestellungen bearbeiten

- Jede Bestellung erscheint im Stripe-Dashboard unter **Zahlungen**. Pro Design siehst du den Text und welche Farbe jeder Buchstabe hat, z. B.:
  `2× «HALLO MIA» – H Sakura Pink · A Ice Blue · L Cotton White …`
  Das steht in der Positionsbeschreibung und zusätzlich in den Metadaten (`design_1`, `design_2`, …). Eine Bemerkung des Kunden steht unter «Benutzerdefinierte Felder».
- Lieferadresse und E-Mail sammelt Stripe im Checkout.
- **E-Mail bei neuer Bestellung:** Stripe → Einstellungen → Kommunikationseinstellungen → «Erfolgreiche Zahlungen» aktivieren.
- **Quittung an Kunden:** Stripe → Einstellungen → Kunden-E-Mails → «Erfolgreiche Zahlungen» aktivieren.

## Chat und Kontaktanfragen

Unten rechts gibt es einen Chat. Er fragt zuerst, worum es geht (Bubble Letters, Wandbild, Fotorahmen, Bestellung & Versand), und bietet dann die passenden Themen an. Freie Fragen versteht er über Stichwörter. Weiss er keine Antwort, bittet er um die E-Mail-Adresse.

- Diese Anfragen landen in **Netlify → Forms → kontakt** (Name, E-Mail, Frage, Chatverlauf).
- Einmalig aktivieren: Netlify → Site configuration → Forms → **Enable form detection**, danach neu deployen.
- E-Mail bei neuer Anfrage: Netlify → Forms → Form notifications → Email notification an eure Adresse.
- Antworten anpassen: in `public/app.js` im Abschnitt «Chat»: `PRODUCTS_CHAT` (Antworten pro Produkt), `ORDER_TOPICS` (Bestellung & Versand), `TOPIC_KEYS` (Stichwörter). Masse von Wandbild und Fotorahmen fehlen noch, dort leitet der Chat aktuell an euch weiter. Preise, Masse und Versand kommen automatisch aus `catalog.js`.
- Der Gratis-Plan von Netlify erlaubt 100 Formular-Einträge pro Monat.

## Newsletter und 10 % Rabatt

Unten auf der Seite können sich Besucher für den Newsletter anmelden und bekommen sofort den Code **WILLKOMMEN10** angezeigt.

1. **Code in Stripe anlegen:** Stripe → Produktkatalog → Gutscheine → «Gutschein erstellen»: 10 % Rabatt, Dauer «Einmalig». Danach beim Gutschein einen **Aktionscode** `WILLKOMMEN10` hinzufügen und «Nur für Erstbestellungen» aktivieren. Der Checkout zeigt das Feld «Aktionscode» automatisch.
2. **Anmeldungen ansehen:** Netlify → Forms → **newsletter**. Dort könnt ihr die Adressen als CSV exportieren und z. B. in Brevo oder Mailchimp importieren, sobald ihr Newsletter verschickt.
3. Code oder Prozentsatz ändern: `public/catalog.js` → `NEWSLETTER` (und den Aktionscode in Stripe gleich nennen).

Hinweis: Der Code wird direkt auf der Seite angezeigt. Wer ihn weitergibt, kann ihn auch ohne Anmeldung nutzen. «Nur für Erstbestellungen» in Stripe begrenzt ihn auf eine Bestellung pro Kunde.

## Zahlungsmittel

Der Checkout zeigt automatisch alle Zahlungsmittel, die im Stripe-Dashboard aktiv sind (Einstellungen → Zahlungsmethoden). Für die Schweiz lohnt sich **TWINT** einzuschalten, dazu Karte, Apple Pay und Google Pay.

## Anpassen

- **Preis, Versand, Gratisversand-Grenze, Lieferländer:** `public/catalog.js` → `SHOP`
- **Farben hinzufügen/entfernen:** `public/catalog.js` → `COLORS`
- **Hinweise in der Leiste oben:** `public/catalog.js` → `ANNOUNCEMENTS`
- **Bewertungen:** in `public/reviews.js` eintragen. Nur echte Bewertungen, mit Einverständnis der Person. Solange die Liste leer ist, ist der Bereich unsichtbar.
- **Wandbild (Sujets) und Fotorahmen (Wellen/Punkte):** Preise und Sujets in `public/catalog.js` → `PRODUCTS`, `POSTERS`, `FRAME_STYLES`. Fotorahmen gibt es in allen Filamentfarben.
- **Verfügbare Zeichen:** `public/catalog.js` → `CHARS` (aktuell inkl. Ä und Ã, bitte prüfen, welches ihr wirklich druckt)
- Nach jeder Änderung neu deployen (bei GitHub-Anbindung passiert das automatisch).

## Vor dem Livegang

- [ ] `rechtliches.html`: Name, Adresse, MWST-Angabe, Reklamationsfrist ausfüllen
- [ ] E-Mail-Adresse `hallo@filamour.ch` prüfen (steht in index.html, success.html, rechtliches.html)
- [ ] Hinweise oben prüfen (z. B. «Gedruckt in der Schweiz»)
- [ ] Preise in `catalog.js` bestätigen: Buchstabe CHF 4.50 (bestätigt), Wandbild CHF 39.50 (bestätigt), Fotorahmen CHF 19 (Platzhalter), Versand CHF 9.00 und gratis ab CHF 60 (bestätigt)
- [ ] Aktionscode WILLKOMMEN10 in Stripe anlegen (Test- und Live-Modus)
- [ ] Testbestellung mit Testschlüssel, dann Live-Schlüssel setzen

## Lokal ausprobieren (optional)

```
npm install
npx netlify-cli dev      # Shop auf http://localhost:8888, STRIPE_SECRET_KEY aus .env
npm test                 # prüft die Checkout-Logik
```
