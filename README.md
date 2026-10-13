# Filamour Onlineshop

Minimalistischer Shop für 3D-gedruckte Bubble Letters, Wandbilder und Fotorahmen: Studio zum Gestalten, Warenkorb, Bezahlung über Stripe Checkout. Läuft als kleiner Node-Server auf [Railway](https://railway.com).

## Aufbau

```
public/                  die Website (wird so ausgeliefert, kein Build-Schritt)
  index.html             Shop: Hero, Studio, Grösse, Ideen, Material, weitere Produkte, Fragen, Newsletter
  success.html/.js       Danke-Seite nach der Zahlung
  rechtliches.html       Impressum & Datenschutz (Platzhalter ausfüllen!)
  404.html               Seite für falsche Links
  catalog.js             Preise, Versand, Farben, Zeichen, Hinweise oben  ← hier anpassen
  reviews.js             Kundenbewertungen (leer = Bereich ausgeblendet)
  app.js, styles.css     Logik und Gestaltung
  images/                Logo, Favicon, Produktfoto
  fonts/                 Alle Schriften, selbst gehostet (keine Daten an Google)
server/
  index.js               Startpunkt, liest die Umgebungsvariablen
  app.js                 Webserver: Seiten, API, Sicherheits-Header, Spamschutz
  checkout.js            Warenkorb prüfen, Stripe-Session bauen
  forms.js               Newsletter- und Kontaktformular prüfen
  brevo.js               Newsletter-Anmeldung bei Brevo (Double-Opt-in)
  store.js               Speicher (PostgreSQL)
  mail.js                E-Mails über Resend
  orders.js              Mails nach einer Bestellung (Bestätigung an Kundschaft, Bestellung an den Shop)
  admin.js               /admin: Anmeldungen und Anfragen ansehen, CSV-Export
test/                    Tests ohne echte Konten (npm test)
railway.json             Start-Befehl und Healthcheck für Railway
```

**Sicherheit:** Der Browser schickt nur Text, Farben und Menge. Den Preis rechnet der Server mit `catalog.js` neu aus, manipulierte Preise sind so nicht möglich. Der geheime Stripe-Schlüssel liegt nur auf dem Server. Dazu kommen strenge Sicherheits-Header (CSP, HSTS), ein Limit gegen massenhafte Anfragen und eine Falle für Spam-Bots in den Formularen.

## Online stellen auf Railway (ca. 20 Minuten)

1. **Projekt anlegen:** [railway.com](https://railway.com) → *New Project* → *Deploy from GitHub repo* → dieses Repository wählen. Railway erkennt Node selbst und startet mit `npm start`.
2. **Region:** Im Service unter *Settings → Deploy → Region* **EU West (Amsterdam)** wählen, damit die Daten in Europa liegen.
3. **Datenbank:** Im Projekt *+ New → Database → PostgreSQL*. Ebenfalls Region EU West.
4. **Variablen** im Shop-Service unter *Variables* eintragen:

   | Variable | Wert |
   |---|---|
   | `STRIPE_SECRET_KEY` | Stripe → Entwickler → API-Schlüssel. Zuerst den **Testschlüssel** `sk_test_…` |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway schlägt das als Referenz vor) |
   | `ADMIN_PASSWORD` | ein langes, eigenes Passwort für `/admin` |
   | `PUBLIC_URL` | erst nach Schritt 6: `https://filamour.ch` (ohne `/` am Ende) |
   | `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL` | für die E-Mails nach jeder Bestellung, siehe «Bestellungen bearbeiten» |

5. **Domain:** *Settings → Networking → Generate Domain* gibt eine Adresse wie `filamour-production.up.railway.app`. Damit kannst du sofort testen.
6. **Eigene Domain:** *Settings → Networking → Custom Domain* → `filamour.ch` eintragen und den angezeigten DNS-Eintrag (CNAME) beim Domain-Anbieter setzen. Danach `PUBLIC_URL` setzen.

Jeder Push auf `main` auf GitHub wird automatisch neu veröffentlicht. Die Logs siehst du im Service unter *Deployments → View Logs*. Fehlt eine Variable, steht dort beim Start ein Hinweis mit ⚠.

## Testen

- Mit dem Testschlüssel eine Bestellung durchspielen. Testkarte `4242 4242 4242 4242`, beliebiges Datum in der Zukunft, beliebige CVC.
- Wenn alles stimmt: in Railway `STRIPE_SECRET_KEY` durch `sk_live_…` ersetzen. Railway startet den Shop dann selbst neu.

## Bestellungen bearbeiten

- Jede Bestellung erscheint im Stripe-Dashboard unter **Zahlungen**. Pro Design siehst du den Text und die Farbe jedes Buchstabens, z. B.:
  `2× Bubble Letters «HALLO MIA» – H Sakura Pink · A Ice Blue · L Cotton White …`
  Das steht in der Positionsbeschreibung und zusätzlich in den Metadaten (`artikel_1`, `artikel_2`, …). Eine Bemerkung des Kunden steht unter «Benutzerdefinierte Felder».
- Lieferadresse und E-Mail sammelt Stripe im Checkout.

### E-Mails nach jeder Bestellung

Nach jeder bezahlten Bestellung meldet Stripe sie an den Shop (Webhook). Der Shop schickt dann über Resend zwei E-Mails:
eine **Bestätigung an die Kundschaft** (Artikel mit Farben, Total, Lieferadresse; Antworten landen bei `NOTIFY_EMAIL`)
und eine **Bestellung an `NOTIFY_EMAIL`** (alles zum Herstellen und Versenden, mit Link zur Bestellung in Stripe; «Antworten» schreibt der Kundschaft). Bewusst als reiner Text: die gestaltete Version sortierte der Spamfilter von Hostinger aus.

1. **Resend** einrichten wie unter «Chat, Kontaktanfragen und Newsletter» beschrieben (`RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL`).
2. **Webhook in Stripe:** Entwickler → Webhooks → «Ziel hinzufügen»
   - Ereignisse: `checkout.session.completed` und `checkout.session.async_payment_succeeded`
   - Ziel: Webhook-Endpunkt, URL `https://filamour.ch/api/stripe-webhook`
3. Beim neuen Ziel das **Signaturgeheimnis** (`whsec_…`) kopieren und in Railway als `STRIPE_WEBHOOK_SECRET` eintragen.
4. Testbestellung machen. Kommen keine Mails: Railway-Logs nach `Bestell-Mail` oder `Stripe-Webhook` durchsuchen, in Stripe beim Webhook unter «Ereignisse» nachsehen.

Test- und Live-Modus haben in Stripe je einen eigenen Webhook mit eigenem `whsec_…`. Beim Wechsel auf live den Webhook dort nochmals anlegen und `STRIPE_WEBHOOK_SECRET` ersetzen.
Die Quittungen von Stripe selbst (Einstellungen → Kunden-E-Mails) braucht es daneben nicht; wer sie zusätzlich aktiviert, verschickt zwei Mails.

## Chat, Kontaktanfragen und Newsletter

Unten rechts gibt es einen Chat. Er fragt zuerst, worum es geht, und bietet dann passende Themen an. Freie Fragen versteht er über Stichwörter. Weiss er keine Antwort, bittet er um die E-Mail-Adresse.

- **Alles ansehen:** `https://filamour.ch/admin` öffnen, Benutzername beliebig, Passwort = `ADMIN_PASSWORD`. Dort stehen alle Kontaktanfragen (mit Chatverlauf) und Newsletter-Anmeldungen, beide auch als **CSV-Download**. Ist Brevo eingerichtet (siehe unten), stehen neue Newsletter-Anmeldungen nur noch in Brevo.
- **E-Mail bei neuer Anfrage und Bestellung (empfohlen):** Konto bei [resend.com](https://resend.com) (Gratis-Plan reicht), dort die Domain `filamour.ch` bestätigen und einen API-Schlüssel erstellen. Dann in Railway setzen:
  `RESEND_API_KEY` = der Schlüssel, `MAIL_FROM` = `Filamour Shop <shop@filamour.ch>`, `NOTIFY_EMAIL` = `hello@filamour.ch`.
  Mit «Antworten» im Mailprogramm schreibst du direkt der Kundin oder dem Kunden. (Railway sperrt klassisches SMTP auf den günstigen Plänen, deshalb Resend.)
- **Chat-Antworten anpassen:** in `public/app.js` im Abschnitt «Chat»: `PRODUCTS_CHAT`, `ORDER_TOPICS`, `TOPIC_KEYS`. Preise, Masse und Versand kommen automatisch aus `catalog.js`.

### Newsletter und 10 % Rabatt

Wer sich unten auf der Seite anmeldet, bekommt den Code **GIFT10** angezeigt. Mit Brevo erst nach der Bestätigung (Double-Opt-in), ohne Brevo sofort.

1. **Code in Stripe anlegen:** Stripe → Produktkatalog → Gutscheine → «Gutschein erstellen»: 10 % Rabatt, Dauer «Einmalig». Danach beim Gutschein einen **Aktionscode** `GIFT10` hinzufügen und «Nur für Erstbestellungen» aktivieren. Der Checkout zeigt das Feld «Aktionscode» automatisch.
2. Code oder Prozentsatz ändern: `public/catalog.js` → `NEWSLETTER` (und den Aktionscode in Stripe gleich nennen).

Hinweis: Der Code wird auf der Seite angezeigt. Wer ihn weitergibt, kann ihn auch ohne Anmeldung nutzen. «Nur für Erstbestellungen» in Stripe begrenzt ihn auf eine Bestellung pro Kunde.

### Newsletter über Brevo (Double-Opt-in)

Ablauf: Anmeldung auf der Seite → Brevo schickt eine Bestätigungsmail → nach dem Klick steht die Adresse in der Brevo-Liste und Brevo leitet zurück auf `https://filamour.ch/?newsletter=bestaetigt`, dort erscheint der Rabattcode. Newsletter verschickst du dann direkt in Brevo; Abmelde-Links fügt Brevo selbst ein.

1. Konto bei [brevo.com](https://www.brevo.com) (Gratis-Plan reicht).
2. **Absender-Domain:** Einstellungen → Absender, Domains und dedizierte IPs → Domains → `filamour.ch` hinzufügen und die angezeigten DNS-Einträge bei Hostinger setzen. Als Absender z. B. `hello@filamour.ch` anlegen.
3. **Liste:** Kontakte → Listen → «Liste erstellen», z. B. «Newsletter». Die **ID** der Liste (Zahl in der Übersicht) merken.
4. **Bestätigungsmail (Double-Opt-in-Vorlage):** Marketing/Kampagnen → Vorlagen → neue Vorlage. Als Link des Bestätigungsknopfs `{{ doubleoptin }}` eintragen, bei den Vorlagen-Einstellungen das Tag `optin` setzen und die Vorlage aktivieren. Die **ID** der Vorlage merken.
5. **API-Schlüssel:** Einstellungen → SMTP & API → API-Schlüssel → neuen Schlüssel erstellen.
6. **IP-Sperre:** Brevo blockiert API-Aufrufe von unbekannten IP-Adressen. Railway hat wechselnde Adressen, darum unter Sicherheit → Autorisierte IPs die Sperre ausschalten. Sonst steht im Railway-Log `Brevo-Fehler (newsletter): Brevo 401`.
7. In Railway setzen: `BREVO_API_KEY`, `BREVO_LIST_ID` (Listen-ID), `BREVO_DOI_TEMPLATE_ID` (Vorlagen-ID). Im Log steht danach beim Start `✓ Newsletter über Brevo`.

Ältere Anmeldungen aus `/admin` (CSV) haben noch nicht bestätigt. Vor dem Import in Brevo am besten einmal um Bestätigung bitten oder sie weglassen.

## Zahlungsmittel

Der Checkout zeigt automatisch alle Zahlungsmittel, die im Stripe-Dashboard aktiv sind (Einstellungen → Zahlungsmethoden). Für die Schweiz lohnt sich **TWINT**, dazu Karte, Apple Pay und Google Pay.

## Anpassen

- **Versand, Gratisversand-Grenze, Lieferländer:** `public/catalog.js` → `SHOP` (aktuell Versand CHF 6.50, gratis ab CHF 60)
- **Buchstaben-Grössen und Preise:** `public/catalog.js` → `LETTER_SIZES` (aktuell gross 6,5 cm hoch und 2,2 cm dick für CHF 4.90, klein 3 cm hoch und 1 cm dick für CHF 2.90). Die Grösse steht in Stripe im Artikelnamen, z. B. `Bubble Letters «MIA» (3 Teile, Klein 3 cm)`.
- **Alphabet-Set:** `public/catalog.js` → `ALPHABET` (Preise je Grösse und Ausführung, aktuell gross 99/89, klein 59/49 (farbig/weiss); durchgestrichen steht der echte Einzelpreis der 26 Buchstaben, Farbe für «ganz weiss», maximal 5 Farben, `active` zum Ausblenden). Die Farben wechseln sich in der gewählten Reihenfolge ab; in Stripe und der Bestellmail steht jeder Buchstabe mit seiner Farbe.
- **Wandbild und Fotorahmen ein-/ausblenden:** `public/catalog.js` → `PRODUCTS.poster.active` / `PRODUCTS.frame.active`. Aktuell beide `false`: im Shop, im Chat und an der Kasse ausgeblendet. Beim Einblenden in `rechtliches.html` unter «Verkauf und Lieferung» den Satz zur Abholung von Wandbildern wieder ergänzen.
- **Nur Abholung:** `pickupOnly: true` bei einem Produkt in `PRODUCTS` (aktuell Wandbild). Enthält eine Bestellung so ein Produkt, wird die ganze Bestellung abgeholt: keine Adresse, keine Versandkosten, Hinweis im Warenkorb und im Stripe-Checkout. In Stripe steht bei der Zahlung unter Metadaten `lieferung: Abholung`. Für Versand wieder `pickupOnly` entfernen.
- **Farben hinzufügen/entfernen:** `public/catalog.js` → `COLORS`
- **Hinweise in der Leiste oben:** `public/catalog.js` → `ANNOUNCEMENTS`
- **Bewertungen:** in `public/reviews.js` eintragen. Nur echte Bewertungen, mit Einverständnis der Person. Solange die Liste leer ist, ist der Bereich unsichtbar.
- **Wandbild (Sujets) und Fotorahmen:** `public/catalog.js` → `PRODUCTS`, `POSTERS`, `FRAME_STYLES`
- **Verfügbare Zeichen:** `public/catalog.js` → `CHARS`
- Änderungen auf GitHub pushen, Railway veröffentlicht automatisch.

## Vor dem Livegang

- [x] `rechtliches.html`: Impressum, MWST-Angabe, Reklamationsfrist ausgefüllt, Datenschutz überarbeitet (Stand 12.10.2026). Bei neuen Diensten den Abschnitt «Unsere Dienstleister» nachführen.
- [ ] `CHARS` prüfen: aktuell **Ä und Ã** (A mit Tilde). Gemeint war vermutlich ein anderer Buchstabe (Ö? Ü?). Die Bubble-Schrift enthält nur die Zeichen, die dort stehen; für neue Zeichen muss die Schriftdatei neu erstellt werden.
- [ ] Preise in `catalog.js` bestätigen: Fotorahmen CHF 19 ist noch ein **Platzhalter**
- [ ] Aktionscode GIFT10 in Stripe anlegen (Test- und Live-Modus)
- [ ] Railway: Postgres, `ADMIN_PASSWORD` (mind. 16 Zeichen), `PUBLIC_URL` gesetzt; `/admin` einmal öffnen. Ohne `PUBLIC_URL` startet der Shop online nicht.
- [ ] Railway: `www.filamour.ch` als zweite Custom Domain hinzufügen (leitet dann automatisch auf filamour.ch um)
- [ ] Stripe-Webhook und Resend eingerichtet, Testbestellung bringt beide E-Mails
- [ ] Testbestellung mit Testschlüssel, dann Live-Schlüssel und Live-Webhook setzen

## Lokal ausprobieren

Braucht [Node.js](https://nodejs.org) ab Version 22.

```bash
npm install
cp .env.example .env     # Stripe-Testschlüssel eintragen
npm run dev              # Shop auf http://localhost:3000, lädt bei Änderungen neu
npm test                 # prüft Kasse, Formulare, Admin und Sicherheits-Header
```

Ohne `DATABASE_URL` speichert der Shop lokal in den Ordner `data/` (wird nicht hochgeladen).
