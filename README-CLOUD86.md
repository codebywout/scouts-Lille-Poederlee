# Scouts Lille-Poederlee op Cloud86/Plesk

## Wat is gemigreerd

De bestaande HTML, CSS, pagina's en frontend-JavaScript blijven behouden. De Express-server is vervangen door een PHP API-router met dezelfde gebruikte URLs:

- `GET /api/session`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/site-data`
- `POST /api/site-data`
- `POST /api/site-data/reset`
- `POST /api/uploads/photo`
- `DELETE /api/uploads/photo/{filename}`

De PHP-laag gebruikt sessies, `password_verify`, origin-controle voor mutaties, veilige JSON-fouten, atomische datastore-writes en uploadvalidatie. Met PHP GD worden uploads naar JPG geconverteerd; zonder GD blijft het gevalideerde originele afbeeldingstype behouden.

## Upload naar Plesk

Upload deze bestanden en mappen naar de document root van het domein: `index.html`, `login.html`, `admin.html`, `admin-gate.php`, `config.php`, `auth-config.php`, `api/`, `assets/`, `pages/`, `data/`, `uploads/` en `.htaccess`.

`router.php` is alleen voor de lokale PHP development server en hoeft niet naar Plesk. Upload ook `data/site-data.json` en de bestaande bestanden in `uploads/`.

Upload deze ontwikkel- en Nodebestanden niet: `.env`, `router.php`, `node_modules/`, `server/`, `server.js`, `package.json`, `package-lock.json`, Dockerbestanden en lokale testbestanden. De oude Express-bestanden zijn uit deze PHP-productiecodebase verwijderd.

- `data/site-data.json` blijft server-side en wordt geblokkeerd door `.htaccess`.
- `data/site-data.default.json` wordt gebruikt door de resetknop.
- `uploads/` blijft publiek leesbaar voor afbeeldingen en moet schrijfbaar zijn voor PHP.

De meegeleverde `.htaccess` stuurt `/api/...` door naar `api/index.php`, blokkeert `data/` en gevoelige serverbestanden, en laat HTML, assets en uploads normaal serveren. Apache moet `AllowOverride` voor de document root toestaan; controleer dit wanneer `.htaccess` geen effect heeft.
- Upload `.env`, `node_modules/`, Dockerbestanden en Node packagebestanden niet naar de webspace.

## PHP en rechten

 Gebruik PHP 8.1 of nieuwer. Vereiste extensies zijn `session` en JSON. `fileinfo` wordt aanbevolen voor extra MIME-detectie en `GD` voor JPG-conversie; zonder deze optionele extensies gebruikt de API nog steeds gevalideerde afbeeldingsinformatie en slaat zij het originele type op. Zet mappen `data/` en `uploads/` op de normale Plesk-webuser schrijfbaar, doorgaans `755` voor mappen en `644` voor bestanden. Gebruik geen `777`.

Zet in Plesk bij PHP Settings ook `upload_max_filesize` op minstens `20M` en `post_max_size` op minstens `21M`; de API hanteert zelf een maximum van 20 MB.

## Maandplanningen naar Google Drive

De maandplanning-upload kan automatisch een extra kopie plaatsen in de Google Drive van de leiding. Gebruik hiervoor een Google Cloud service account:

1. Activeer de Google Drive API in een Google Cloud-project en maak een service account aan.
2. Download het JSON-sleutelbestand en bewaar het buiten de publieke document root, bijvoorbeeld `/var/www/vhosts/private/scouts-google-service-account.json`.
3. Deel de gewenste Drive-map met het e-mailadres van het service account als `Bewerker`. Bij een gedeelde Drive moet het service account ook lid zijn van die gedeelde Drive.
4. Log in op `/admin`, open **Instellingen**, vul de map-ID in en upload daar het OAuth-client JSON-bestand. Klik daarna op **Google-account verbinden**.

Het sleutelbestand wordt door de API in `data/.google-service-account.json` opgeslagen en wordt door de webserver geblokkeerd. PHP moet de extensies `curl` en `openssl` hebben. Elke nieuwe maandplanning wordt dan naast de lokale websitekopie als PDF in die Drive-map aangemaakt, met de naam uit het uploadveld. Zet een service-account JSON-bestand nooit in Git of in `uploads/`.

## Admin configureren

De productie-authenticatie gebruikt `auth-config.php` en is niet afhankelijk van Plesk environment variables. Dit bestand wordt door `.htaccess` geblokkeerd voor HTTP-verzoeken. Wijzig vóór productie de hash in dit bestand:

Maak lokaal of tijdelijk op de server een hash met:

```bash
php -r "echo password_hash('KIES-EEN-LANG-WACHTWOORD', PASSWORD_DEFAULT), PHP_EOL;"
```

Vervang daarna in `auth-config.php` de waarde van `SCOUTS_AUTH_PASSWORD_HASH`. De standaard lokale hash hoort bij het ontwikkelwachtwoord `scouts2025` en mag niet als productie-wachtwoord blijven staan. De gebruikersnaam staat in dezelfde file als `SCOUTS_AUTH_USERNAME`.

Plesk environment variables zijn niet vereist. Als ze toch aanwezig zijn, worden de waarden uit `auth-config.php` bewust gebruikt.

De productieconfiguratie bevat:

```text
SCOUTS_AUTH_USERNAME=admin
SCOUTS_AUTH_PASSWORD_HASH=<de gegenereerde hash>
```

Gebruik HTTPS. De sessiecookie wordt automatisch `Secure` zodra HTTPS actief is, en is altijd `HttpOnly` en `SameSite=Lax`.

`GET /api/site-data` gebruikt `ETag` en `Last-Modified`. Een ongewijzigde browserrequest krijgt `304 Not Modified`; na opslaan of resetten verandert de datastoreversie automatisch.

## Controleren

1. Open de homepage en alle links op desktop en mobiel.
2. Open `/api/site-data`; dit moet JSON met de bestaande inhoud geven. Een lege of corrupte datastore geeft HTTP 500 en nooit `{}`.
3. Open `/login`, log in en controleer dat `/api/session` `{"authenticated":true}` geeft.
4. Wijzig agenda, FAQ of pagina-inhoud, sla op en controleer opnieuw `GET /api/site-data`.
5. Upload, vervang en verwijder een foto vanuit `/admin`; controleer dat de nieuwe URL onder `/uploads/` werkt en de oude extensies weg zijn.
6. Log uit en controleer dat `/admin` terugstuurt naar `/login` en API-mutaties HTTP 401 geven.

## Node/Docker

`server.js`, `server/`, `package.json`, `package-lock.json`, `Dockerfile`, `docker-compose.yml` en `node_modules/` zijn niet nodig op Cloud86 en zijn verwijderd uit deze productiecodebase.