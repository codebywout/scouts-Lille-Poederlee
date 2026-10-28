# Technische handleiding — scoutswebsite

Dit bestand is alleen nodig als je zelf aan de **programmacode** of de server werkt.  
Voor gewone inhoud (teksten, foto’s, agenda) gebruik je de [README](../README.md) en [handleiding-scoutsleiding.md](handleiding-scoutsleiding.md).

Oorspronkelijk gemaakt voor [Scouts Lille-Poederlee](https://scoutslille.be); andere groepen kunnen dezelfde basis gebruiken.

Claims hieronder zijn nagekeken in de projectbestanden. Exacte hostingpaden en providers staan niet vast in dit project.

---

## Inhoud

1. [Projectoverzicht](#1-projectoverzicht)
2. [Technologieën en architectuur](#2-technologieën-en-architectuur)
3. [Projectstructuur](#3-projectstructuur)
4. [Bestandsreferentie](#4-bestandsreferentie)
5. [Datamodel (`site-data.json`)](#5-datamodel-site-datajson)
6. [API-referentie](#6-api-referentie)
7. [Foto’s, CSS en JavaScript](#7-fotos-css-en-javascript)
8. [Lokaal ontwikkelen (Windows)](#8-lokaal-ontwikkelen-windows)
9. [Tests, controles en CI](#9-tests-controles-en-ci)
10. [A. Naar GitHub](#10-a-naar-github)
11. [B. Naar de webhosting](#11-b-naar-de-webhosting)
12. [C. Nooit via gewone Git/code-upload](#12-c-nooit-via-gewone-gitcode-upload)
13. [Veilige deployment](#13-veilige-deployment)
14. [Rollback en back-ups](#14-rollback-en-back-ups)
15. [Geheimen en beveiliging](#15-geheimen-en-beveiliging)
16. [Probleemoplossing](#16-probleemoplossing)
17. [Onderhoud: waar wijzig je wat?](#17-onderhoud-waar-wijzig-je-wat)
18. [Checklists](#18-checklists)

---

## 1. Projectoverzicht

### Functionaliteiten

| Onderdeel | Wat het doet |
| --- | --- |
| Homepage | Intro, takken, planning/agenda, praktisch/FAQ, contact |
| Takpagina’s | Kapoenen, Welpen, Jongverkenners, Verkenners, Jins — tekst, leiding, maandplanning/brieven |
| Nieuws | Lijst + detailgedrag via site-data (concepten blijven admin-only) |
| Inschrijven | Info + formulierintegratie (front-end) |
| Uniform / tweedehands / over ons / privacybeleid | Statische shells + dynamische inhoud waar van toepassing |
| Login + admin | Beheerders wijzigen JSON-inhoud, uploaden foto’s/PDF’s, optioneel Google Drive |

### Wat deze stack niet is

- Geen Composer-project, geen root-`package.json`, geen database.
- Geen Next.js of andere frameworkmigratie in deze repository.
- Node.js is **niet** nodig om de site te draaien of te hosten. Node is alleen nodig om `script.js` opnieuw te minificeren.

---

## 2. Technologieën en architectuur

| Onderdeel | Technologie (uit de repo) |
| --- | --- |
| Paginashells | HTML (`index.html`, `pages/*.html`, `login.html`, `admin.html`) |
| Styling | CSS-deelbestanden + bundeling via `assets/css/style.php` |
| Front-end | Vanilla JS: `script.js` (publiek, via `script.min.js`) en `admin.js` |
| Backend | PHP met `declare(strict_types=1)`; o.a. `match`, `str_starts_with`, `str_contains` → **PHP 8.0+** |
| Data | `data/site-data.json` (geen SQL) |
| Uploads | `uploads/` (+ private `uploads/originals/`) |
| Productierouting | Apache + `.htaccess` |
| Lokale routing | `php -S` + `router.php` (`start-server.ps1`) |
| Optioneel | Google Drive (`google-drive.php` + genegeerde bestanden onder `data/`) |
| Optionele JS-minify | Node + gepinde Terser in `tools/vendor/` |

**PHP-versie:** de code dwingt geen exacte patchversie af. Minimaal **8.0** op taalfeatures. CI gebruikt **PHP 8.3** met extensies `gd`, `curl`, `fileinfo`. Lokaal is de site o.a. met PHP 8.5 ontwikkeld. Voor uploads/foto’s: **GD** (JPEG; WebP/AVIF optioneel als de build dat ondersteunt).

### Requestflow (kort)

1. Apache (`.htaccess`) of lokaal `router.php` stuurt URL’s naar `page.php`, `admin-gate.php` of `api/index.php`.
2. `page.php` / `admin-gate.php` serveert HTML via `scouts_send_html_file()` in `config.php`: shared chrome, asset-`?v=`, CSS-bundlequery, herschrijf `script.js` → `script.min.js`.
3. De browser laadt `script.min.js`, haalt `GET /api/site-data` op en vult de pagina.
4. Admin wijzigt data via `POST /api/site-data` en uploads via `/api/uploads/…`.
5. CSS: URL `/assets/css/style.css` wordt naar `style.php` gestuurd (Apache rewrite of `router.php`). Fallbackbestand `style.css` bevat alleen `@import`s als die routing ontbreekt.

```text
Browser
  → /pagina          → page.php / admin-gate.php  → HTML (+ chrome, ?v=)
  → /assets/css/style.css[?bundle=…] → style.php  → gebundelde CSS
  → /assets/js/script.min.js
  → /api/…           → api/index.php
  → /uploads/…       → publieke media (originals geblokkeerd)
```

### Lokaal vs online

| | Lokaal | Online (bedoeld) |
| --- | --- | --- |
| Start | `.\start-server.ps1` → `localhost:8000` + `router.php` | Apache document root met `.htaccess` |
| Secrets | `.env` of `auth-config.php` (gitignored) | Zelfde, op de server |
| Exacte host/pad | — | Niet vastgelegd in tracked code; publieke origin in code: `https://scoutslille.be` |

---

## 3. Projectstructuur

```text
scouts/
├── .env.example                 # Sjabloon (wel in Git)
├── .env                         # Lokaal/server secrets (niet in Git)
├── .gitignore
├── .htaccess                    # Apache: routes, headers, blokkades
├── .user.ini                    # Uploadlimieten (PHP-FPM/CGI)
├── .github/workflows/ci.yml
├── README.md                    # Startpagina voor scoutsleiding
├── docs/                        # Handleidingen (beheer, overdracht, techniek, …)
├── admin-gate.php               # Gate voor /admin
├── admin.html
├── auth-config.php              # Optioneel, niet in Git
├── config.php                   # Kernconfig + helpers
├── google-drive.php
├── index.html
├── login.html
├── page.php
├── robots.txt
├── router.php                   # Alleen lokale PHP-server
├── sitemap.php / sitemap.xml
├── start-server.ps1
├── api/
│   ├── .user.ini
│   └── index.php
├── assets/
│   ├── css/                     # Deel-CSS + style.php + fallback style.css
│   ├── images/                  # Vaste site-afbeeldingen (wel in Git)
│   └── js/                      # script.js, script.min.js, admin.js, qrcode.min.js
├── data/
│   ├── .htaccess                # Require all denied
│   ├── site-data.json           # Actieve inhoud (runtime, niet in Git)
│   ├── site-data.default.json
│   └── … (Drive/OAuth/cache: gitignored)
├── includes/
│   ├── photo-pipeline.php
│   └── site-chrome.php
├── pages/                       # HTML-subpagina’s
├── tools/                       # CLI-tests, minify, migratie
└── uploads/                     # Runtime-media (inhoud niet in Git; .htaccess wel)
    ├── .htaccess
    └── originals/.htaccess
```

---

## 4. Bestandsreferentie

### Kern PHP

| Pad | Rol |
| --- | --- |
| `config.php` | Paden, limieten, `SCOUTS_ASSET_VERSION`, sessies, auth-helpers, site-data I/O, HTML/CSS asset-herschrijving, upload-helpers |
| `page.php` | Publieke/login/404 HTML via `?page=` |
| `admin-gate.php` | Vereist admin-sessie; anders 302 → `/login`; serveert `admin.html` |
| `api/index.php` | JSON-API (`?route=…` via rewrite) |
| `google-drive.php` | Drive credentials/OAuth helpers (niet publiek via HTTP) |
| `router.php` | Router voor `php -S`; blokkeert gevoelige paden |
| `sitemap.php` | Dynamische sitemap; publieke URL `/sitemap.xml` |

### Front-end

| Pad | Rol |
| --- | --- |
| `assets/css/*.css` | Bronstylesheets |
| `assets/css/style.php` | Bundels: `core`/`home`, `public` (default), `admin` |
| `assets/css/style.css` | Fallback `@import` als `style.php` niet bereikbaar is |
| `assets/js/script.js` | Publieke bronlogica |
| `assets/js/script.min.js` | Productieversie (marker `scouts-src-sha256=…`) |
| `assets/js/admin.js` | Admin-UI (niet geminificeerd in deze repo) |
| `assets/js/qrcode.min.js` | QR-hulp (inschrijven e.d.) |

### Data en uploads

| Pad | Rol | In Git? |
| --- | --- | --- |
| `data/site-data.json` | Live inhoud | Nee (`.gitignore`; alleen op de server) |
| `data/site-data.default.json` | Reset-bron / seed met fictieve voorbeelden | Ja |
| `data/.site-data.public.json` | Cache publieke API-payload | Nee |
| `data/.login-attempts.json` | Login rate-limit | Nee |
| `data/google-drive.json`, `.google-oauth.json`, `.google-service-account.json` | Drive | Nee |
| `uploads/*` | Publieke masters, varianten, PDF’s | Nee (inhoud) |
| `uploads/originals/*` | Private originelen | Nee; HTTP denied |
| `uploads/.htaccess`, `uploads/originals/.htaccess`, `data/.htaccess` | Toegang | Ja |

### Tools

| Pad | Rol |
| --- | --- |
| `tools/minify-script.mjs` | Genereert `script.min.js` |
| `tools/check-script-min.php` | Controleert hash-marker + `node --check` |
| `tools/bootstrap-site-data.php` | Maakt runtime `site-data.json` vanuit default (nooit overwrite) |
| `tools/test-site-data-bootstrap.php` | Regressietests voor bootstrap |
| `tools/smoke-http.php` | HTTP-smoke tegen draaiende server |
| `tools/test-photo-pipeline.php` | Niet-destructieve fotopipelinetests |
| `tools/migrate-photo-variants.php` | CLI: varianten hergenereren |
| `tools/generate-image-variants.ps1` | Statische images onder `assets/images/` (vereist lokale `tools/libwebp/…`) |
| `tools/optimize-branch-logos.php` | Branchlogo-hulp |
| `tools/vendor/` | Gepinde Terser-tarball + lock; `node_modules/` genegeerd |

---

## 5. Datamodel (`site-data.json`)

Hoofdstructuur (keys zoals in de huidige data/code):

| Key | Betekenis |
| --- | --- |
| `pageContent` | Paginateksten (o.a. over-ons, inschrijven/lidgeld) |
| `agenda` | Activiteiten |
| `news` | Nieuws; `published: false` blijft weg uit publieke API |
| `faq` | Vragen/antwoorden |
| `contact` | Contactgegevens |
| `groupLeadership` / `branchLeadership` | Leiding |
| `secondhand` | Tweedehands-items |
| `photos` | Paden naar foto’s, planning-PDF’s, `pageBackgrounds`, enz. |
| `letters` | Brieven per tak (gebruikt door front-end/admin) |

Publieke `GET /api/site-data` filtert o.a. unpublished news en enkele admin/editor-keys (`scouts_public_site_data()` in `config.php`). Admins met sessiecookie krijgen de volledige dataset.

### Runtime-data: `site-data.json` staat niet in Git

`data/site-data.json` is **runtime-data**: staat in `.gitignore`, wordt **niet gecommit**, en leeft alleen lokaal of op de server. Echte groepsgegevens (namen, telefoons, e-mail, IBAN, uploads-paden) horen daar — niet in de repository.

In Git staat alleen `data/site-data.default.json` met **fictieve** voorbeelddata.

**Initialisatie (alleen als de runtime ontbreekt):**

```powershell
php tools/bootstrap-site-data.php
```

Dat kopieert atomisch vanuit het defaultbestand naar `data/site-data.json` en **overschrijft nooit** een bestaand runtimebestand. CI doet hetzelfde vóór de HTTP-smoke (schone checkout → seed → tests). Er is **geen** automatische bootstrap bij gewone webrequests.

Productie: bestaande `data/` en `uploads/` bij deploys behouden; nooit blind lokale testdata over live zetten.

---

## 6. API-referentie

Alle routes lopen via `/api/{route}` → `api/index.php?route=…`.

- **Same-origin:** muterende requests (en login) gebruiken `scouts_require_same_origin()` (Origin of Referer moet bij de request-host passen).
- **Admin:** `scouts_require_admin()` vereist actieve sessie (`scouts_session` cookie).
- **Google-instellingen:** na admin-login eerst unlock via apart wachtwoord; sessieflag ~15 minuten.

| Methode | Route | Toegang | Doel |
| --- | --- | --- | --- |
| GET/HEAD | `site-data` | Publiek (gefilterd) of admin (volledig) | Site-inhoud |
| GET | `session` | Publiek | `{ authenticated: bool }` |
| POST | `login` | Same-origin | Admin-login (rate-limit) |
| POST | `logout` | Admin + same-origin | Uitloggen |
| POST | `site-data` | Admin + same-origin | Opslaan |
| POST | `site-data/restore` | Admin + same-origin | Herstel |
| POST | `site-data/reset` | Admin + same-origin | Reset naar default-bestand |
| POST | `uploads/photo` | Admin + same-origin | Foto-upload |
| POST | `uploads/planning` | Admin + same-origin | Maandplanning-PDF |
| POST | `uploads/letter` | Admin + same-origin | Brief-PDF |
| DELETE | `uploads/photo/{name}` | Admin + same-origin | Foto-versies verwijderen |
| DELETE | `uploads/document/{name}` | Admin + same-origin | Document verwijderen |
| GET | `uploads/orphans` | Admin | Orphan-lijst |
| POST | `uploads/orphans/purge` | Admin + same-origin | Orphans opruimen |
| GET/POST | `cron/backup-drive` | `SCOUTS_CRON_SECRET` | Wekelijkse site-data → Drive-backupmap |
| POST | `google-drive/settings/unlock` | Admin + same-origin | Unlock Drive-UI |
| GET/POST | `google-drive/settings` | Google-settings access | Folder-instellingen |
| POST | `google-drive/credentials` | Google-settings + same-origin | Service-account upload |
| POST | `google-drive/oauth-reset` | Google-settings + same-origin | OAuth reset |
| POST | `google-drive/oauth-client` | Google-settings + same-origin | OAuth-client |
| GET | `google-drive/oauth/start` | Google-settings | OAuth starten |
| GET | `google-drive/oauth/callback` | (OAuth-flow) | Callback |

Onbekende routes: foutresponse via de API-handler.

### Publieke pagina-URL’s (geen API)

Uit `page.php` / `.htaccess` / `scouts_sitemap_paths()`: `/`, `/over-ons`, `/inschrijven`, `/nieuws`, `/uniform`, `/tweedehands`, `/kapoenen`, `/welpen`, `/jongverkenners`, `/verkenners`, `/jins`, `/privacybeleid`, plus `/login`, `/admin`, `/404`.

---

## 7. Foto’s, CSS en JavaScript

### JavaScript: bron ↔ minified

| Stap | Commando | Waar |
| --- | --- | --- |
| Terser installeren (eenmalig/lokaal) | `cd tools/vendor` → `npm install` (eventueel `$env:NODE_OPTIONS='--use-system-ca'`) | Alleen ontwikkelaar-PC |
| Minificeren | `node tools/minify-script.mjs` | Schrijft `assets/js/script.min.js` |
| Controleren | `php tools/check-script-min.php` | Exit **0** = OK; anders niet releasen |

Productie-HTML herschrijft verwijzingen naar `script.js` naar `script.min.js`. Plesk/hosting heeft **geen** Node nodig zolang `script.min.js` mee geüpload wordt.

`admin.js` wordt in deze repository **niet** via dezelfde minify-pipeline gegenereerd.

### CSS-bundels (`style.php`)

| `?bundle=` | Stylesheets |
| --- | --- |
| `core` of `home` | base, layout, components, home, responsive |
| `public` (default) | + pages |
| `admin` | + pages + admin |

`scouts_send_html_file()` zet o.a. homepage/login op `core` en admin op `admin`. Cache-busting: `SCOUTS_ASSET_VERSION` in `config.php` (huidige waarde in code raadplegen) als `?v=…` op CSS/JS/url()-assets. HTML zelf krijgt no-store headers.

### Foto-uploadpipeline (runtime)

Via `POST /api/uploads/photo` + `includes/photo-pipeline.php` / helpers in `config.php`:

1. Validatie (o.a. max ~20 MB app-limiet, MIME/`getimagesize`, max dimensie/pixels).
2. Private origineel → `uploads/originals/` (HTTP geblokkeerd).
3. Publieke master JPEG in `uploads/`.
4. Varianten `-w480` … `-w2400` als `.jpg` + `.webp` (en `.avif` indien beschikbaar).

Front-end kiest via `<picture>` / `srcset`. Pagina-achtergronden: keys onder `photos.pageBackgrounds` (o.a. `home`, `registration`, `news`, …) met uploadnamen `bg-{key}`.

### Migratie bestaande uploads (CLI)

```powershell
php tools/migrate-photo-variants.php --dry-run
php tools/migrate-photo-variants.php
php tools/migrate-photo-variants.php --only=kapoenenleiding,over-ons
```

Alleen CLI (`PHP_SAPI === 'cli'`). Verwijdert geen originelen.

### Statische images onder `assets/images/`

`tools/generate-image-variants.ps1` vereist een lokale `cwebp` onder `tools/libwebp/` (die map staat in `.gitignore`). Niet nodig op de hosting voor normale deploys.

---

## 8. Lokaal ontwikkelen (Windows)

### Vereisten

- PHP **8.0+** in PATH (`php -v`), bij voorkeur met **GD**, **session**, **json**, **fileinfo**, **curl**
- Git
- Browser
- PowerShell
- Node.js **alleen** als je `script.js` wijzigt

### Installatie

```powershell
git clone <jouw-clone-url>
cd scouts   # of de mapnaam van je clone
Copy-Item .env.example .env
```

Genereer een password-hash (geen echt productiewachtwoord in Git zetten):

```powershell
php -r "echo password_hash('KIES-EEN-STERK-WACHTWOORD', PASSWORD_DEFAULT), PHP_EOL;"
```

Zet in `.env`:

```text
SCOUTS_ADMIN_USERNAME=admin
SCOUTS_ADMIN_PASSWORD_HASH=<plak-hier-de-hash>
```

Optioneel:

```text
SCOUTS_GOOGLE_SETTINGS_PASSWORD_HASH=<andere-hash>
# SCOUTS_GOOGLE_SERVICE_ACCOUNT_JSON_PATH=data/.google-service-account.json
# SCOUTS_GOOGLE_DRIVE_FOLDER_ID=...
```

**Alternatief:** `auth-config.php` in de projectroot (of één map hoger — zie `config.php`) met constanten `SCOUTS_AUTH_USERNAME` / `SCOUTS_AUTH_PASSWORD_HASH`. Dat bestand staat in `.gitignore`.

Zorg dat `data/` en `uploads/` schrijfbaar zijn. Upload-inhoud ontbreekt na een schone clone (normaal).

### Server starten

```powershell
.\start-server.ps1
```

Gelijkwaardig:

```powershell
php -d upload_max_filesize=20M -d post_max_size=25M -d memory_limit=256M -S localhost:8000 router.php
```

### Snelle controle

| URL | Verwacht |
| --- | --- |
| http://localhost:8000/ | Homepage |
| http://localhost:8000/login | Login |
| http://localhost:8000/admin | Zonder sessie → redirect `/login` |
| http://localhost:8000/api/site-data | JSON |
| http://localhost:8000/assets/css/style.css | CSS-bundle |
| http://localhost:8000/assets/js/script.min.js | Minified JS |

Zonder verhoogde uploadlimieten weigert PHP vaak foto’s groter dan de default `upload_max_filesize`.

---

## 9. Tests, controles en CI

Neem alleen onderstaande tests als bestaand. Lokale exitcodes zeggen niets over productie-Apache of live DNS.

| Test | Commando | Omgeving | Controleert | Controleert níet |
| --- | --- | --- | --- | --- |
| PHP-syntax | `php -l` per `.php`-bestand | PHP CLI | Parsefouten | Gedrag, security |
| Minify-sync | `php tools/check-script-min.php` | PHP + Node voor syntaxcheck van min.js | Marker-hash = SHA-256 van `script.js` | `admin.js`, CSS |
| Foto-pipeline | `php tools/test-photo-pipeline.php` | PHP + GD | Validatie, store, varianten, cleanup | Live uploads-map leegmaken |
| HTTP-smoke | `php tools/smoke-http.php` `[baseUrl]` | Draaiende server (default `http://localhost:8000`) | Routes, blokkades, basis-API, sitemap | Admin-UI, Drive, visuele layout |

Voorbeelden:

```powershell
Get-ChildItem -Recurse -Filter *.php |
  Where-Object { $_.FullName -notmatch '\\tools\\vendor\\' } |
  ForEach-Object { php -l $_.FullName }

php tools/check-script-min.php
php tools/test-photo-pipeline.php
.\start-server.ps1   # andere terminal
php tools/smoke-http.php
```

Geslaagd: exitcode **0** (smoke print `passed=… failed=0`).

### CI (`.github/workflows/ci.yml`)

- Triggers: `push` naar `main`/`master`, en `pull_request`.
- Setup: **PHP 8.3** (extensies `gd`, `curl`, `fileinfo`) via `shivammathur/setup-php`, en **Node.js 20** via `actions/setup-node` (nodig voor `node --check` in `check-script-min.php`).
- Stappen daarna: `php -l` → `check-script-min` → `test-photo-pipeline` → tijdelijke `php -S` + `smoke-http.php`.
- **Geen** automatische deploy naar productie.
- Push naar alleen een feature-branch (zonder PR) triggert deze workflow **niet**.

---

## 10. A. Naar GitHub

### Wel toevoegen

| Pad / patroon | Functie | Voorwaarde |
| --- | --- | --- |
| `*.html`, `pages/` | UI-shells | — |
| `assets/css/`, `assets/js/` (incl. `script.min.js`) | Front-end | Bij JS-wijziging: minify + check OK |
| `assets/images/` | Vaste beelden | Geen geheimen |
| `api/`, `includes/`, root-PHP, `.htaccess`, `.user.ini` | Backend/hostinggedrag | — |
| `data/site-data.default.json`, `data/.htaccess` | Seed (fictief) + deny | Geen `site-data.json` committen |
| `uploads/.htaccess`, `uploads/originals/.htaccess` | Beveiliging | Geen upload-inhoud |
| `tools/*` scripts + `tools/vendor` tarball/lock/README | Dev/CI | Geen `node_modules/` |
| `.env.example`, `README.md`, `.gitignore`, `.github/workflows/ci.yml` | Docs/CI | Geen echte secrets in example |
| `robots.txt`, `sitemap.php`, `sitemap.xml`, `start-server.ps1` | SEO/lokaal | — |

### Gegenereerd maar wél in Git (bewust)

- `assets/js/script.min.js` — runtime op hosting zonder Node.

### Niet toevoegen (zie `.gitignore`)

Zie [sectie 12](#12-c-nooit-via-gewone-gitcode-upload).

### Tip vóór commit

```powershell
git status
git diff
git diff --cached
```

Controleer dat `data/site-data.json` **niet** in de commit zit, en dat er geen `.env` / Drive-JSON meeslipt.

---

## 11. B. Naar de webhosting

**Document root** = map waarin `index.html`, `page.php` en `.htaccess` naast elkaar staan (naam hangt van de host af: vaak `httpdocs` / `public_html`; staat niet hardcoded in de repo).

### Altijd / bij code-release

| Relatief pad | Bestemming | Verplicht | Functie | Let op |
| --- | --- | --- | --- | --- |
| `index.html`, `login.html`, `admin.html` | `{root}/` | Ja | Shells | Via PHP geserveerd |
| `pages/` | `{root}/pages/` | Ja | Subpagina’s | — |
| `assets/` | `{root}/assets/` | Ja | CSS/JS/images | Incl. `script.min.js` |
| `api/` | `{root}/api/` | Ja | API + `api/.user.ini` | — |
| `includes/` | `{root}/includes/` | Ja | PHP includes | HTTP geblokkeerd |
| `config.php`, `page.php`, `admin-gate.php`, `google-drive.php` | `{root}/` | Ja | Backend | Directe HTTP geweigerd |
| `.htaccess`, `.user.ini` | `{root}/` | Ja | Routes/limieten | `AllowOverride` nodig voor `.htaccess` |
| `robots.txt`, `sitemap.php`, `sitemap.xml` | `{root}/` | Ja | SEO | — |
| `data/.htaccess` | `{root}/data/` | Ja | Deny data-HTTP | — |
| `data/site-data.default.json` | `{root}/data/` | Ja | Reset-bron | — |
| `uploads/.htaccess`, `uploads/originals/.htaccess` | `{root}/uploads/…` | Ja | Upload-security | — |

### Alleen bij inhoudelijke/data-release

| Pad | Bestemming | Voorwaarde |
| --- | --- | --- |
| `data/site-data.json` | `{root}/data/` | **Nooit** blind lokale testdata over live zetten; eerst serverback-up |
| Inhoud `uploads/` | `{root}/uploads/` | Apart van Git; sync/back-up; originelen behouden |

### Secrets op de server (niet via publieke Git)

| Pad | Functie |
| --- | --- |
| `.env` en/of `auth-config.php` | Login |
| `data/google-drive.json`, OAuth/service-account JSON | Optionele Drive |

### Niet nodig op hosting

| Pad | Reden |
| --- | --- |
| `router.php` | Alleen lokale `php -S` (mag mee, HTTP geblokkeerd) |
| `tools/`, `.github/`, `start-server.ps1` | Dev/CI |
| `tools/vendor/node_modules/` | Nooit |
| `node_modules/` | Nooit |

### Na upload

1. Schrijfrechten op `data/` en `uploads/` voor de PHP-gebruiker.
2. Hard refresh; controleer Network: `script.min.js?v=…`, CSS-bundle.
3. `/login` + beperkte admin-opslag; uploads zichtbaar?
4. Geen Node-installatie op de host vereist voor normale werking.

---

## 12. C. Nooit via gewone Git/code-upload

Gebaseerd op `.gitignore` + codepaden:

### Geheimen die wél op de server moeten blijven

| Item | Waarom |
| --- | --- |
| `.env` | Admin-hashes / optionele Drive-env |
| `auth-config.php` | Alternatieve auth-constanten |
| `data/.google-service-account.json` | Private key |
| `data/.google-oauth.json` | OAuth-tokens/client |
| `data/google-drive.json` | Host-specifieke Drive-config |

### Lokale / runtime bestanden

| Item | Waarom |
| --- | --- |
| `data/.login-attempts.json` | Rate-limit state |
| `data/.site-data.public.json` | Afgeleide cache |
| `.sessions/` | Sessies |
| `*.log`, `texput.log`, `.DS_Store`, editor-mappen | Rommel |
| `tools/vendor/node_modules/`, root `node_modules/` | Dependencies lokaal |
| `tools/libwebp/`, `tools/imgopt/` | Optionele lokale binaries |

### Uploads en productiemedia

| Item | Aanpak |
| --- | --- |
| `uploads/*` (jpg/pdf/webp/…) | Back-up/apart deployen; niet via Git |
| `uploads/originals/*` | Zelfde; nooit publiek maken |

### Wél in Git om beveiliging af te dwingen

`data/.htaccess`, `uploads/.htaccess`, `uploads/originals/.htaccess`, root-`.htaccess` (blokkades voor `config.php`, `.env`, `data/`, `includes/`, `tools/`, enz.).

---

## 13. Veilige deployment

Voer dit uit op jouw machine/host; deze handleiding voert geen commit/push/deploy uit.

1. **Status** — `git status -sb`, juiste branch, schone of bewuste wijzigingen.
2. **Diff nalopen** — geen secrets, geen onbedoelde `site-data`-testdata.
3. **JS** — bij wijziging `script.js`: `node tools/minify-script.mjs` → `php tools/check-script-min.php`.
4. **Assetversie** — bij CSS/JS/image-release: verhoog `SCOUTS_ASSET_VERSION` in `config.php`.
5. **Tests** — syntax, check-script-min, photo-pipeline, smoke tegen lokale server.
6. **Stagen** — alleen bedoelde bestanden (`git add …`); `git diff --cached` controleren.
7. **Commit + push** — naar de afgesproken branch; open PR naar `main` zodat CI draait.
8. **CI** — wacht op groen op GitHub Actions.
9. **Back-up server** — minstens `data/site-data.json` + `uploads/` (+ secrets-config) vóór overwrite.
10. **Upload runtime** — zie sectie 11; overschrijf live JSON/uploads alleen met intentie.
11. **Rechten** — `data/` en `uploads/` schrijfbaar voor PHP.
12. **Live smoke** — homepage, één tak, nieuws, login, CSS/JS 200, geen console-kritiek.
13. **Rollback** — zie sectie 14 bij problemen.

Voorbeeld Git-flow (pas remote/branchnamen aan):

```powershell
git checkout -b feature/mijn-wijziging
# … wijzigen, testen …
git add <bestanden>
git commit -m "Korte uitleg waarom"
git push -u origin HEAD
# Open PR → CI → review → merge
```

---

## 14. Rollback en back-ups

### Vóór elke hostingdeploy

Kopieer apart (buiten de document root of naar veilige storage):

- `data/site-data.json`
- Volledige `uploads/` (inclusief `originals/`)
- `.env` / `auth-config.php` / Drive-JSON’s

### Code-rollback

- Zet de vorige bekende-goede set PHP/HTML/CSS/JS terug (uit Git-tag/commit of je uploadback-up).
- Herstel `SCOUTS_ASSET_VERSION` consistent met die assets of bump opnieuw na fix.

### Data-rollback

- Zet geback-upte `site-data.json` terug.
- Herstel per ongeluk verwijderde uploads uit de uploads-back-up.
- Admin heeft ook `site-data/restore` en `site-data/reset` (reset = default-bestand; destructief voor huidige inhoud).

### Git-rollback (lokaal)

Gebruik niet-destructieve middelen (`git revert` op gedeelde branches). Vermijd `reset --hard` / force-push op `main` tenzij het team dat expliciet afspreekt.

---

## 15. Geheimen en beveiliging

### Auth-bronnen (volgorde in code)

1. Als `auth-config.php` leesbaar is (eerst map **boven** de projectroot, anders projectroot): constanten `SCOUTS_AUTH_*`.
2. Anders omgeving / `.env`: `SCOUTS_ADMIN_USERNAME`, `SCOUTS_ADMIN_PASSWORD_HASH`.
3. Optioneel Drive-UI: `SCOUTS_GOOGLE_SETTINGS_PASSWORD_HASH`.

Wachtwoorden worden met `password_verify` tegen de hash gecontroleerd. Login: max 5 pogingen / 900 s lockout (`SCOUTS_LOGIN_*` in `config.php`).

### Sessies

Cookie-naam `scouts_session`; parameters o.a. `httponly`, `samesite=Lax`, `secure` bij HTTPS.

### Overige maatregelen in de repo

- Same-origin op mutaties.
- Gevoelige paden geblokkeerd in `.htaccess` en `router.php`.
- `data/` denied; `uploads/originals/` denied; PHP-handlers van uploads gestript.
- Security headers in `.htaccess` (o.a. `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) wanneer `mod_headers` actief is.

Neem **geen** echte hashes, tokens of keys op in Git of in deze documentatie.

---

## 16. Probleemoplossing

| Probleem | Mogelijke oorzaak | Actie |
| --- | --- | --- |
| Admin-login werkt niet | Lege/ontbrekende hash; verkeerde `.env` | Hash opnieuw genereren; bestand naast `config.php` of parent `auth-config.php` |
| Foto-upload faalt / te groot | PHP-limieten | `.user.ini` / `start-server.ps1`-flags; wacht op FPM-herlaad |
| Oude CSS/JS zichtbaar | Cache | `SCOUTS_ASSET_VERSION` verhogen + `config.php` uploaden; hard refresh |
| `check-script-min` faalt | `script.min.js` verouderd | `node tools/minify-script.mjs` |
| Terser ontbreekt | Geen `node_modules` | `cd tools/vendor; npm install` |
| `/admin` → login-loop | Geen sessie / cookie | HTTPS/`secure`, domain, opnieuw inloggen |
| Lege foto’s na clone | `uploads/` niet in Git | Van server kopiëren of via admin uploaden |
| Drive-instellingen 403 | Niet unlocked | Eerst unlock-endpoint met settings-wachtwoord |
| Smoke flaky op `script.js` lokaal | Instabiele `php -S` | Opnieuw draaien; productie via Apache testen |

---

## 17. Onderhoud: waar wijzig je wat?

| Doel | Waar |
| --- | --- |
| Teksten/agenda/nieuws/contact | Admin-UI → `data/site-data.json` (of API) |
| Layout/styling | Juiste file in `assets/css/`; daarna assetversie |
| Publiek gedrag | `assets/js/script.js` → minify → check → assetversie |
| Admin-gedrag | `assets/js/admin.js` (+ eventueel `admin.css`) |
| Routes | `.htaccess`, `router.php`, `page.php`, `scouts_sitemap_paths()` |
| Uploadlimieten / foto-constanten | `config.php`, `.user.ini`, `api/.user.ini` |
| Pagina-achtergronden | Admin (photos.pageBackgrounds) |
| Documentatie | `README.md` (start) + map `docs/` |

---

## 18. Checklists

### Release

- [ ] Branch/status gecontroleerd; geen secrets in de diff
- [ ] Geen `data/site-data.json` in de commit; runtime blijft op de server
- [ ] Bij JS: minify + `check-script-min` exit 0; `script.min.js` mee
- [ ] Assetversie verhoogd indien nodig
- [ ] Lokale tests gedraaid (syntax / minify / photo / smoke)
- [ ] PR + CI groen (waar van toepassing)
- [ ] Serverback-up van data + uploads (+ secrets)
- [ ] Alleen noodzakelijke runtime-bestanden geüpload
- [ ] Live smoke + login/opslag spot-check
- [ ] Rollbackplan bekend

### Onderhoud van deze technische handleiding

- [ ] Genoemde paden bestaan of zijn als lokaal/gitignored gemarkeerd
- [ ] API-tabel komt overeen met `api/index.php`
- [ ] GitHub-lijst ↔ `.gitignore`
- [ ] Hostinglijst mist geen runtime-kernbestanden
- [ ] Geen echte secrets of persoonlijke productiewaarden in de tekst
- [ ] Onderscheid lokaal (`router.php`) vs Apache blijft duidelijk
- [ ] Geen claim dat lokale tests de volledige productie valideren
- [ ] Beginnersdocs in `docs/` en links in `README.md` blijven kloppen

---

## Licentie

Interne / groepswebsite voor Scouts Lille-Poederlee. Voeg een expliciete licentie toe als de repository publiek wordt gedeeld.
