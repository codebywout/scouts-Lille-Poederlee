# Scouts Lille-Poederlee

Publieke website en beheeromgeving voor [Scouts Lille-Poederlee](https://scoutslille.be).

De site toont takken, nieuws, agenda, inschrijvingen, uniform, tweedehands en contact. Inhoud (teksten, foto’s, events, FAQ) beheer je via een beveiligde admin.

## Stack

| Onderdeel | Technologie |
| --- | --- |
| Frontend | Statische HTML + CSS + vanilla JS |
| Backend | PHP 8.1+ (API, sessies, uploads, routing) |
| Data | JSON in `data/site-data.json` (geen database) |
| Bestanden | Lokale map `uploads/` |
| Optioneel | Google Drive voor maandplanningen |

Geen Node.js, geen npm-packages, geen build-stap voor de publieke site.

## Vereisten

- PHP **8.1+**
- Extensies: `session`, `json`
- Aanbevolen: `fileinfo` (uploadvalidatie), `GD` (foto’s → JPG, max. 2400px, kwaliteit 90)
- Schrijfrechten op `data/` en `uploads/`

## Lokaal starten

1. Kopieer de voorbeeldconfiguratie:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Genereer een password-hash en plak die in `.env`:

   ```powershell
   php -r "echo password_hash('KIES-EEN-WACHTWOORD', PASSWORD_DEFAULT), PHP_EOL;"
   ```

   ```text
   SCOUTS_ADMIN_USERNAME=admin
   SCOUTS_ADMIN_PASSWORD_HASH=<gegenereerde-hash>
   ```

3. Start de server:

   ```powershell
   .\start-server.ps1
   ```

   Of handmatig (zelfde uploadlimieten):

   ```powershell
   php -d upload_max_filesize=20M -d post_max_size=25M -d memory_limit=256M -S localhost:8000 router.php
   ```

4. Open:

   - site: <http://localhost:8000>
   - login: <http://localhost:8000/login>
   - admin: <http://localhost:8000/admin> (na inloggen)

Zonder de `-d`-flags weigert PHP vaak foto’s > 2 MB.

## Projectstructuur

```text
api/                 JSON API (login, site-data, uploads)
assets/css/          Stylesheets (+ style.php voor cache-bust)
assets/js/           Frontend (site + admin)
assets/images/       Vaste beelden / branding
data/                site-data.json + defaults (geheimen gitignored)
pages/               HTML-subpagina’s
uploads/             Geüploade foto’s/PDF’s (inhoud gitignored)
admin.html           Admin-UI
admin-gate.php       Sessiecheck voor /admin
config.php           Centrale PHP-config
page.php             HTML serveren met verse asset-versies
router.php           Router voor lokale PHP-server
.htaccess            Apache-routing + beveiliging
.env.example         Voorbeeldomgeving (kopieer naar .env)
```

## Hoe de site werkt

1. Publieke pagina’s zijn HTML; `page.php` / `.htaccess` injecteren de huidige **asset-versie** (`SCOUTS_ASSET_VERSION` in `config.php`) zodat CSS/JS/beelden vers laden.
2. Inhoud komt uit `GET /api/site-data` en wordt client-side ingevuld (nieuws, agenda, FAQ, foto’s, …).
3. Admin wijzigt die data via `POST /api/site-data` en uploadt bestanden naar `uploads/`.
4. Na een deploy: verhoog `SCOUTS_ASSET_VERSION` (formaat `YYYYMMDD-N`) zodat caches op alle toestellen vernieuwen.

## API (kort)

| Methode | Route | Doel |
| --- | --- | --- |
| GET | `/api/session` | Sessiestatus |
| POST | `/api/login` | Admin login |
| POST | `/api/logout` | Uitloggen |
| GET | `/api/site-data` | Site-inhoud lezen |
| POST | `/api/site-data` | Site-inhoud opslaan |
| POST | `/api/site-data/reset` | Terug naar defaults |
| POST | `/api/uploads/photo` | Foto uploaden |
| DELETE | `/api/uploads/photo/{file}` | Foto verwijderen |

Muterende routes vereisen een geldige adminsessie en origin-controle.

## Productie (huidige hosting)

Typisch: Apache / Plesk met PHP 8.1+.

Checklist:

- [ ] HTTPS aan
- [ ] `.env` of `auth-config.php` op de server (niet in Git)
- [ ] Schrijfrechten op `data/` en `uploads/`
- [ ] `AllowOverride` zodat `.htaccess` werkt
- [ ] `SCOUTS_ASSET_VERSION` ophogen bij elke release
- [ ] Uploads en secrets niet publiek bereikbaar (zie `.htaccess`)

`router.php` is alleen voor lokaal. Op Apache doet `.htaccess` de routing.

## Cloudflare (gepland)

**Cloudflare Pages draait geen PHP bij requests.** Admin, API, sessies en uploads hebben PHP (of een vervanger) nodig. Een “alles op Pages dump”-migratie werkt dus niet zonder herbouw.

Aanbevolen stappen op termijn:

### Fase 1 — DNS + CDN (weinig risico)

- Domein naar Cloudflare DNS
- Proxy (oranje wolk) vóór de huidige PHP-host
- Winst: SSL, caching van statische assets, DDoS/WAF, snellere edge

Geen codewijziging nodig; PHP blijft op de origin.

### Fase 2 — Hybrid (optioneel)

- Zware beelden / CSS / JS via Cloudflare cache of R2
- HTML + `/api/*` blijven op de PHP-origin
- Page Rules / Cache Rules: HTML en `/api` niet agressief cachen; versioned assets wél

### Fase 3 — Volledig op Cloudflare (grote herbouw)

Vervang de PHP-laag, bijvoorbeeld:

| Nu (PHP) | Mogelijk op Cloudflare |
| --- | --- |
| `site-data.json` | Workers + KV of D1 |
| `uploads/` | R2 |
| Sessies / login | Workers + secure cookies / Access |
| `page.php` / `.htaccess` | Pages + Functions / `_redirects` |

Pas daarna kan de publieke site op **Cloudflare Pages** (GitHub-koppeling vanaf `main`).

Tot fase 3: behandel Cloudflare als **voordeur**, niet als enige host.

## Veiligheid

Nooit committen:

- `.env`, `auth-config.php`
- Google service-account / OAuth JSON
- Productiewachtwoorden of API-sleutels
- Inhoud van `uploads/` (staat in `.gitignore`)

Controleer bij elke deploy of `data/` en geheimen niet via HTTP bereikbaar zijn.

## Licentie

Interne / groepswebsite. Voeg een expliciete licentie toe als de repository publiek wordt.
