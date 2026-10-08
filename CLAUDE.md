# Filamour – Hinweise für Claude Code

Onlineshop (Deutsch, Schweizer Schreibweise mit «ss», Anrede «du»). Node/Express-Server auf Railway, Frontend ohne Build-Schritt in `public/`.

- `npm run dev` startet lokal auf Port 3000, `npm test` muss vor jedem Commit grün sein.
- `public/catalog.js` wird von Browser **und** Server importiert: Preise und Validierung nur dort ändern, keine Node- oder Browser-spezifischen APIs darin verwenden.
- Der Server vertraut nie Preisen aus dem Browser; `server/checkout.js` rechnet alles aus `catalog.js` neu.
- Strenge CSP: keine Inline-Skripte, keine externen Skripte/Schriften/Bilder. Neues JS als Datei in `public/`.
- `{{SITE_URL}}` in den HTML-Seiten ersetzt der Server beim Ausliefern (siehe `server/app.js`).
- Texte für Kundschaft kurz und freundlich halten, keine Fachbegriffe.
