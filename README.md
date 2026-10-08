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
  store.js               Speicher (PostgreSQL)
  mail.js                E-Mail-Benachrichtigung (Resend, optional)
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
- **E-Mail bei neuer Bestellung:** Stripe → Einstellungen → Kommunikationseinstellungen → «Erfolgreiche Zahlungen» aktivieren.
- **Quittung an Kunden:** Stripe → Einstellungen → Kunden-E-Mails → «Erfolgreiche Zahlungen» aktivieren.

## Chat, Kontaktanfragen und Newsletter

Unten rechts gibt es einen Chat. Er fragt zuerst, worum es geht, und bietet dann passende Themen an. Freie Fragen versteht er über Stichwörter. Weiss er keine Antwort, bittet er um die E-Mail-Adresse.

- **Alles ansehen:** `https://filamour.ch/admin` öffnen, Benutzername beliebig, Passwort = `ADMIN_PASSWORD`. Dort stehen alle Kontaktanfragen (mit Chatverlauf) und Newsletter-Anmeldungen, beide auch als **CSV-Download** (z. B. zum Import in Brevo oder Mailchimp).
- **E-Mail bei neuer Anfrage (empfohlen):** Konto bei [resend.com](https://resend.com) (Gratis-Plan reicht), dort die Domain `filamour.ch` bestätigen und einen API-Schlüssel erstellen. Dann in Railway setzen:
  `RESEND_API_KEY` = der Schlüssel, `MAIL_FROM` = `Filamour Shop <shop@filamour.ch>`, `NOTIFY_EMAIL` = `hallo@filamour.ch`.
  Mit «Antworten» im Mailprogramm schreibst du direkt der Kundin oder dem Kunden. (Railway sperrt klassisches SMTP auf den günstigen Plänen, deshalb Resend.)
- **Chat-Antworten anpassen:** in `public/app.js` im Abschnitt «Chat»: `PRODUCTS_CHAT`, `ORDER_TOPICS`, `TOPIC_KEYS`. Preise, Masse und Versand kommen automatisch aus `catalog.js`.

### Newsletter und 10 % Rabatt

Wer sich unten auf der Seite anmeldet, bekommt sofort den Code **WILLKOMMEN10** angezeigt.

1. **Code in Stripe anlegen:** Stripe → Produktkatalog → Gutscheine → «Gutschein erstellen»: 10 % Rabatt, Dauer «Einmalig». Danach beim Gutschein einen **Aktionscode** `WILLKOMMEN10` hinzufügen und «Nur für Erstbestellungen» aktivieren. Der Checkout zeigt das Feld «Aktionscode» automatisch.
2. Code oder Prozentsatz ändern: `public/catalog.js` → `NEWSLETTER` (und den Aktionscode in Stripe gleich nennen).

Hinweis: Der Code wird direkt auf der Seite angezeigt. Wer ihn weitergibt, kann ihn auch ohne Anmeldung nutzen. «Nur für Erstbestellungen» in Stripe begrenzt ihn auf eine Bestellung pro Kunde. Für den Versand von Newslettern die CSV in ein Newsletter-Tool importieren; dieses kümmert sich um Abmelde-Links.

## Zahlungsmittel

Der Checkout zeigt automatisch alle Zahlungsmittel, die im Stripe-Dashboard aktiv sind (Einstellungen → Zahlungsmethoden). Für die Schweiz lohnt sich **TWINT**, dazu Karte, Apple Pay und Google Pay.

## Anpassen

- **Preis, Versand, Gratisversand-Grenze, Lieferländer:** `public/catalog.js` → `SHOP`
- **Farben hinzufügen/entfernen:** `public/catalog.js` → `COLORS`
- **Hinweise in der Leiste oben:** `public/catalog.js` → `ANNOUNCEMENTS`
- **Bewertungen:** in `public/reviews.js` eintragen. Nur echte Bewertungen, mit Einverständnis der Person. Solange die Liste leer ist, ist der Bereich unsichtbar.
- **Wandbild (Sujets) und Fotorahmen:** `public/catalog.js` → `PRODUCTS`, `POSTERS`, `FRAME_STYLES`
- **Verfügbare Zeichen:** `public/catalog.js` → `CHARS`
- Änderungen auf GitHub pushen, Railway veröffentlicht automatisch.

## Vor dem Livegang

- [ ] `rechtliches.html`: Name, Adresse, MWST-Angabe, Reklamationsfrist ausfüllen (gelb markierte Stellen). Den Satz zu Resend nur stehen lassen, wenn ihr Resend nutzt.
- [ ] `CHARS` prüfen: aktuell **Ä und Ã** (A mit Tilde). Gemeint war vermutlich ein anderer Buchstabe (Ö? Ü?). Die Bubble-Schrift enthält nur die Zeichen, die dort stehen; für neue Zeichen muss die Schriftdatei neu erstellt werden.
- [ ] E-Mail-Adresse `hallo@filamour.ch` prüfen (steht in index.html, success.html, rechtliches.html, app.js)
- [ ] Preise in `catalog.js` bestätigen: Fotorahmen CHF 19 ist noch ein **Platzhalter**
- [ ] Aktionscode WILLKOMMEN10 in Stripe anlegen (Test- und Live-Modus)
- [ ] Railway: Postgres, `ADMIN_PASSWORD`, `PUBLIC_URL` gesetzt; `/admin` einmal öffnen
- [ ] Testbestellung mit Testschlüssel, dann Live-Schlüssel setzen

## Lokal ausprobieren

Braucht [Node.js](https://nodejs.org) ab Version 22.

```bash
npm install
cp .env.example .env     # Stripe-Testschlüssel eintragen
npm run dev              # Shop auf http://localhost:3000, lädt bei Änderungen neu
npm test                 # prüft Kasse, Formulare, Admin und Sicherheits-Header
```

Ohne `DATABASE_URL` speichert der Shop lokal in den Ordner `data/` (wird nicht hochgeladen).
