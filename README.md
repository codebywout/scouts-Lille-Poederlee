# Scouts Lille-Poederlee — handleiding

Publieke website en beheeromgeving voor [Scouts Lille-Poederlee](https://scoutslille.be).

Deze README beschrijft hoe de site werkt, welke bestanden waarvoor dienen, wat je naar GitHub zet, en wat je naar de webhosting moet uploaden. Alles is gebaseerd op de bestanden die in deze repository aanwezig zijn.

---

## 1. Projectoverzicht

### Wat de website doet

De site is de online presentatie van de scoutsgroep: homepage, takken (Kapoenen, Welpen, Jongverkenners, Verkenners, Jins), nieuws, planning/agenda, praktisch/FAQ, inschrijven, uniform, tweedehands, over ons en privacybeleid. Beheerders loggen in en passen inhoud (teksten, agenda, nieuws, foto’s, PDF’s, contact) aan via een adminpaneel.

### Technologieën

| Onderdeel | Technologie |
| --- | --- |
| Pagina’s | Statische HTML (`index.html`, `pages/*.html`, `admin.html`, `login.html`) |
| Styling | CSS in `assets/css/`, samengevoegd via `assets/css/style.php` |
| Frontend-logica | Vanilla JavaScript (`assets/js/script.js`, `assets/js/admin.js`) |
| Backend | PHP 8.1+ (`config.php`, `page.php`, `api/index.php`, …) |
| Data | JSON-bestand `data/site-data.json` (geen database) |
| Uploads | Map `uploads/` (foto’s, PDF’s, brieven) |
| Routing (productie) | Apache + `.htaccess` |
| Routing (lokaal) | Ingebouwde PHP-server + `router.php` |
| Optioneel | Google Drive-koppeling (`google-drive.php` + bestanden onder `data/`) |

Er is **geen** Node.js-project, **geen** `package.json`, **geen** Composer/`vendor`, en **geen** buildstap. HTML, CSS, JS en PHP worden rechtstreeks uitgevoerd.

### Hoe de onderdelen samenwerken

1. Apache (of lokaal `router.php`) stuurt URL’s naar `page.php` / `admin-gate.php` / `api/index.php`.
2. `page.php` leest de HTML, injecteert gedeelde header/footer (`includes/site-chrome.php`) en vernieuwt asset-queryparameters (`?v=…` uit `SCOUTS_ASSET_VERSION` in `config.php`).
3. De browser laadt `assets/js/script.js`, dat inhoud ophaalt via `GET /api/site-data` en de pagina vult (nieuws, agenda, FAQ, contact, …).
4. Admin (`admin.html` + `admin.js`) wijzigt die data via `POST /api/site-data` en uploadt bestanden naar `/api/uploads/…` → map `uploads/`.
5. CSS wordt bij voorkeur geleverd door `assets/css/style.php` (via rewrite van `/assets/css/style.css`), zodat alle deel-stylesheets één gebundelde response krijgen met de juiste cache-bust-versie.

### Lokaal vs online (voor zover uit de code blijkt)

- **Lokaal:** `start-server.ps1` start `php -S localhost:8000 router.php`.
- **Online:** de site is bedoeld voor een PHP-host met Apache (`.htaccess`, `.user.ini`). In `auth-config.php` (lokaal, niet in Git) staat een commentaar over Cloud86/Plesk; de **exacte** hostingprovider en serverpaden staan niet in de tracked codebase. Publieke URL’s in `robots.txt` / `sitemap.php` gebruiken `https://scoutslille.be`.

---

## 2. Volledige bestandsstructuur

```text
scouts/
├── .env.example
├── .gitignore
├── .htaccess
├── .user.ini
├── README.md
├── admin-gate.php
├── admin.html
├── auth-config.php          ← lokaal/server, niet in Git (.gitignore)
├── config.php
├── google-drive.php
├── index.html
├── login.html
├── page.php
├── robots.txt
├── router.php
├── sitemap.php
├── sitemap.xml
├── start-server.ps1
├── api/
│   ├── .user.ini
│   └── index.php
├── assets/
│   ├── css/
│   │   ├── admin.css
│   │   ├── base.css
│   │   ├── components.css
│   │   ├── home.css
│   │   ├── layout.css
│   │   ├── pages.css
│   │   ├── responsive.css
│   │   ├── style.css
│   │   └── style.php
│   ├── images/
│   │   ├── branches/*.png
│   │   ├── domein*.jpg
│   │   ├── hemd_*.jpg
│   │   └── scouts.png
│   └── js/
│       ├── admin.js
│       ├── qrcode.min.js
│       └── script.js
├── data/
│   ├── .htaccess
│   ├── site-data.default.json
│   ├── site-data.json
│   ├── google-drive.json              ← gitignored
│   ├── .google-oauth.json             ← gitignored
│   └── .google-service-account.json   ← gitignored (indien aanwezig)
├── includes/
│   └── site-chrome.php
├── pages/
│   ├── 404.html
│   ├── inschrijven.html
│   ├── jins.html
│   ├── jongverkenners.html
│   ├── kapoenen.html
│   ├── nieuws.html
│   ├── over-ons.html
│   ├── privacyverklaring.html
│   ├── tweedehands.html
│   ├── uniform.html
│   ├── verkenners.html
│   └── welpen.html
└── uploads/
    ├── .htaccess
    └── … geüploade bestanden …      ← inhoud gitignored
```

Hieronder: bestand per bestand (of groep met dezelfde rol).

### Wortel — routing, config, documentatie

| Pad | Functie | Waarom nodig | Afhankelijkheden | Gebruik | Aanpassen? |
| --- | --- | --- | --- | --- | --- |
| `config.php` | Centrale PHP-config: paden, asset-versie, sessies, login/rate-limit, site-data lezen/schrijven, foto-verwerking, HTML-serving helpers | Kern van de backend | Optioneel `auth-config.php` of `.env`; gebruikt `includes/site-chrome.php` bij HTML | Runtime | Handmatig (o.a. `SCOUTS_ASSET_VERSION` bij deploy) |
| `page.php` | Kiest HTML-bestand op basis van `?page=` en serveert via `scouts_send_html_file` | Publieke pagina’s op Apache | `config.php`, HTML-bestanden | Runtime (productie) | Handmatig bij nieuwe routes/pagina’s |
| `admin-gate.php` | Controleert adminsessie; anders redirect naar `/login`; serveert `admin.html` | Beveiligde admin-URL `/admin` | `config.php`, `admin.html` | Runtime | Handmatig indien loginflow wijzigt |
| `router.php` | Front controller voor `php -S`; bootst API, CSS, pagina’s, 404 | Enkel lokale ontwikkeling | `config.php`, `api/index.php`, `page.php`, … | Lokaal | Handmatig |
| `google-drive.php` | Helpers voor Google Drive (OAuth / service account, folder-id) | Optionele maandplanning-sync | `config.php`, bestanden in `data/` | Runtime indien geconfigureerd | Handmatig |
| `.htaccess` | Apache: uploadlimieten, cache-headers, URL-rewrites, blokkade van gevoelige paden, 404-fallback | Productierouting en beveiliging | Apache `mod_rewrite` / `AllowOverride` | Runtime (productie) | Handmatig |
| `.user.ini` | `upload_max_filesize` / `post_max_size` / `memory_limit` voor PHP-FPM/CGI | Grotere admin-uploads op hosting | Hosting die `.user.ini` eert | Runtime (hosting) | Handmatig |
| `.env.example` | Voorbeeld voor lokale/server credentials | Template zonder geheimen | Wordt gekopieerd naar `.env` | Ontwikkeling / setup | Handmatig (voorbeeldwaarden) |
| `.env` | Echte omgevingswaarden (`SCOUTS_ADMIN_*`, …) | Login als `auth-config.php` ontbreekt | Gelezen door `config.php` | Runtime | Handmatig; **niet committen** |
| `auth-config.php` | PHP-constanten voor admin- (en optioneel Google settings-)wachtwoordhash | Productie-login (vaak buiten webroot of in projectroot) | Geladen door `config.php` (eerst map **boven** projectroot, anders projectroot) | Runtime | Handmatig; **niet committen** (staat in `.gitignore`) |
| `.gitignore` | Bepaalt wat Git negeert | Voorkomt lekken van geheimen/uploads | — | Ontwikkeling / GitHub | Handmatig |
| `README.md` | Deze handleiding | Documentatie | — | Documentatie | Handmatig |
| `start-server.ps1` | Start lokale PHP-server met uploadlimieten | Snelle lokale start op Windows | PHP CLI | Ontwikkeling | Handmatig |
| `robots.txt` | Crawl-regels + sitemap-URL | SEO | — | Runtime (publiek) | Handmatig |
| `sitemap.php` | Dynamische XML-sitemap (`lastmod` uit `site-data.json`) | SEO; via rewrite `/sitemap.xml` | `config.php` | Runtime | Handmatig |
| `sitemap.xml` | Statische sitemap-fallback (commentaar: dynamisch via `sitemap.php`) | Fallback als rewrite faalt | — | Runtime (fallback) | Handmatig |

### HTML-pagina’s

| Pad | Functie | Waarom nodig | Afhankelijkheden | Gebruik | Aanpassen? |
| --- | --- | --- | --- | --- | --- |
| `index.html` | Homepage (hero, takken, nieuws, planning, praktisch, …) | Hoofdingang | `script.js`, CSS via `style.css`, markers `<!--SITE_HEADER-->` / `<!--SITE_FOOTER-->` | Runtime | Handmatig (structuur); inhoud vaak via API |
| `login.html` | Admin-loginpagina | Inloggen | `script.js` (Auth) | Runtime | Handmatig |
| `admin.html` | Beheer-UI (shell + panelen) | Inhoud beheren | `script.js` + `admin.js`, CSS `bundle=admin` | Runtime (na login) | Handmatig |
| `pages/over-ons.html` | Over-ons | Publieke pagina | Idem homepage-patroon | Runtime | Handmatig |
| `pages/inschrijven.html` | Inschrijfformulier + betaling-UI | Inschrijvingen | `script.js`, Google Forms-bridge in JS | Runtime | Handmatig |
| `pages/nieuws.html` | Nieuwsarchief | Alle nieuwsberichten | `script.js` | Runtime | Handmatig |
| `pages/uniform.html` | Uniforminfo + foto’s | Info voor ouders | `script.js`, vaste images | Runtime | Handmatig |
| `pages/tweedehands.html` | Tweedehandslijst | Verkoop/hergebruik | `script.js` + site-data | Runtime | Handmatig |
| `pages/kapoenen.html`, `welpen.html`, `jongverkenners.html`, `verkenners.html`, `jins.html` | Takpagina’s (leiding, maandplanning, brieven) | Tak-specifieke info | `script.js` + uploads/site-data | Runtime | Handmatig |
| `pages/privacyverklaring.html` | Privacybeleid (URL `/privacybeleid`) | Wettelijke info | `page.php` mapping | Runtime | Handmatig |
| `pages/404.html` | Aangepaste 404 | Onbekende URL’s | `scouts_send_not_found` / rewrite | Runtime | Handmatig |

### `api/`

| Pad | Functie | Waarom nodig | Afhankelijkheden | Gebruik | Aanpassen? |
| --- | --- | --- | --- | --- | --- |
| `api/index.php` | Alle JSON-API-routes (login, site-data, uploads, Google Drive) | Backend voor frontend/admin | `config.php`, `google-drive.php` | Runtime | Handmatig |
| `api/.user.ini` | Zelfde uploadlimieten, specifiek voor API-pad onder PHP-FPM | Grote uploads via `/api/uploads/…` | Hosting | Runtime (hosting) | Handmatig |

Belangrijkste API-routes (uit `api/index.php`):

| Methode | Route | Doel |
| --- | --- | --- |
| `GET` | `/api/site-data` | Site-inhoud lezen |
| `POST` | `/api/site-data` | Site-inhoud opslaan (admin) |
| `POST` | `/api/site-data/reset` | Terugzetten naar `site-data.default.json` (admin) |
| `GET` | `/api/session` | Of er een adminsessie is |
| `POST` | `/api/login` | Inloggen (met rate-limit) |
| `POST` | `/api/logout` | Uitloggen |
| `POST` | `/api/uploads/photo` | Foto uploaden |
| `DELETE` | `/api/uploads/photo/{file}` | Foto verwijderen |
| `POST` | `/api/uploads/planning` | Maandplanning-PDF |
| `POST` | `/api/uploads/letter` | Takbrief uploaden |
| `DELETE` | `/api/uploads/document/{file}` | Document verwijderen |
| `GET/POST` | `/api/google-drive/…` | Drive-instellingen, OAuth, credentials (admin) |

Muterende routes vereisen een adminsessie en same-origin-controle (`scouts_require_same_origin`).

### `assets/css/`

| Pad | Functie | Gebruik | Aanpassen? |
| --- | --- | --- | --- |
| `style.php` | Bundelt CSS-bestanden + zet `?v=` op `url(...)`; `?bundle=admin` voegt `admin.css` toe | Runtime (via `/assets/css/style.css`) | Handmatig |
| `style.css` | Fallback `@import` van dezelfde deelbestanden als PHP niet routed | Fallback | Handmatig |
| `base.css` | Basis / tokens / reset-achtige stijlen | Via bundle | Handmatig |
| `layout.css` | Navigatie, footer, algemene layout | Via bundle | Handmatig |
| `components.css` | Herbruikbare UI-componenten | Via bundle | Handmatig |
| `home.css` | Homepage-secties (o.a. agenda, nieuws, FAQ) | Via bundle | Handmatig |
| `pages.css` | Subpagina’s / heroes | Via bundle | Handmatig |
| `responsive.css` | Breakpoints | Via bundle | Handmatig |
| `admin.css` | Adminpaneel | Alleen `bundle=admin` | Handmatig |

### `assets/js/`

| Pad | Functie | Afhankelijkheden | Gebruik | Aanpassen? |
| --- | --- | --- | --- | --- |
| `script.js` | Publieke site: data laden, renderen, accordion, inschrijven, FAQ-links, agenda, Auth/DataStore-exports voor admin | `/api/site-data`, DOM van HTML | Runtime | Handmatig |
| `admin.js` | Adminpaneel: editors, uploads, opslaan, Google Drive-UI | Laadt ná `script.js` (`window.ScoutsSite`) | Runtime (admin) | Handmatig |
| `qrcode.min.js` | QR-codebibliotheek (o.a. betalings-QR bij inschrijven) | Gebruikt vanuit site-JS waar nodig | Runtime | Vendorbestand; liefst niet handmatig herschrijven |

### `assets/images/`

| Pad | Functie | Gebruik | Aanpassen? |
| --- | --- | --- | --- |
| `scouts.png` | Logo / branding | Header, OG/JSON-LD | Handmatig vervangen |
| `domein.jpg` … `domein5.jpg` | Hero-/sfeerbeelden | CSS/HTML preload | Handmatig |
| `hemd_voorkant.jpg`, `hemd_achterkant.jpg` | Uniformpagina | `pages/uniform.html` | Handmatig |
| `branches/*.png` | Taklogo’s | Takkaarten / takpagina’s | Handmatig |

Dit zijn **vaste** repo-assets (wel in Git), niet te verwarren met `uploads/`.

### `data/`

| Pad | Functie | Gebruik | Aanpassen? |
| --- | --- | --- | --- |
| `site-data.json` | Actieve site-inhoud (agenda, nieuws, FAQ, contact, leiding, …) | Runtime; gelezen/geschreven door API | Via **admin** (of voorzichtig handmatig); staat **wél** in Git |
| `site-data.default.json` | Fabrieksdefaults voor reset | `POST /api/site-data/reset` | Handmatig als je defaults wilt wijzigen |
| `.htaccess` | Weigert alle HTTP-toegang tot `data/` | Beveiliging | Handmatig |
| `google-drive.json` | Drive-folderinstellingen | Runtime indien Drive gebruikt | Via admin / handmatig; **gitignored** |
| `.google-oauth.json` | OAuth client + tokens | Runtime | **Gitignored**; nooit delen |
| `.google-service-account.json` | Service-account credentials (optioneel) | Runtime | **Gitignored** |
| `.login-attempts.json` | Rate-limit teller voor login (automatisch) | Runtime | Automatisch; niet handmatig nodig |

### `includes/`

| Pad | Functie | Gebruik | Aanpassen? |
| --- | --- | --- | --- |
| `site-chrome.php` | Gedeelde header, footer, Open Graph-tags, JSON-LD LocalBusiness | Geïnjecteerd door `scouts_send_html_file` | Handmatig; HTTP-toegang tot `/includes` is geblokkeerd in `.htaccess` |

### `uploads/`

| Pad | Functie | Gebruik | Aanpassen? |
| --- | --- | --- | --- |
| `.htaccess` | Directory listing uit; PHP-uitvoering in uploads uitgeschakeld; bestanden wél publiek leesbaar | Runtime | In Git (`!uploads/.htaccess`) |
| Overige bestanden (jpg/pdf/…) | Door admin geüploade media | Publieke URL’s `/uploads/…` | Via admin; **inhoud gitignored** |

> Opmerking: lokaal kan er een bestand `uploads/htaccess` (zonder punt) bestaan. Dat valt onder `uploads/*` en staat niet in Git. De actieve Apache-config is `uploads/.htaccess`.

---

## 3. Uploaden naar GitHub

### Wat hoort in de repository?

In principe alles wat `git ls-files` volgt / wat niet door `.gitignore` wordt uitgesloten: broncode, HTML, CSS, JS, vaste images, `data/site-data.json`, `data/site-data.default.json`, `uploads/.htaccess`, documentatie, voorbeelden.

### Tabel

| Bestand of map | Uploaden? | Reden | Opmerkingen |
| --- | --- | --- | --- |
| `*.html`, `pages/` | Ja | Publieke/admin-UI | — |
| `assets/` (css, js, images) | Ja | Frontend | Inclusief `qrcode.min.js` |
| `api/`, `config.php`, `page.php`, `admin-gate.php`, `router.php`, `google-drive.php`, `includes/` | Ja | Backend | `router.php` vooral voor lokaal, maar mag in Git |
| `.htaccess`, `.user.ini`, `api/.user.ini` | Ja | Hostinggedrag | — |
| `robots.txt`, `sitemap.php`, `sitemap.xml` | Ja | SEO | — |
| `data/site-data.json` | Ja (huidige setup) | Inhoud wordt meegetrackt | Let op: lokale testdata kan per ongeluk meegaan |
| `data/site-data.default.json` | Ja | Reset-defaults | — |
| `data/.htaccess` | Ja | Blokkeert publieke toegang | — |
| `uploads/.htaccess` | Ja | Veilige uploads-map | — |
| `uploads/*` (foto’s, PDF’s, …) | **Nee** | `.gitignore`: `uploads/*` | Op de server apart bewaren/back-uppen |
| `.env` | **Nee** | Geheimen | Gebruik `.env.example` |
| `.env.example` | Ja | Template zonder echte hashes | — |
| `auth-config.php` | **Nee** | Wachtwoordhashes | Staat in `.gitignore` |
| `data/google-drive.json` | **Nee** | Host-specifieke Drive-config | `.gitignore` |
| `data/.google-oauth.json` | **Nee** | OAuth-geheimen/tokens | `.gitignore` |
| `data/.google-service-account.json` | **Nee** | Private key | `.gitignore` |
| `data/.login-attempts.json` | Nee (indien aanwezig) | Runtime-cache | Wordt gegenereerd; niet nodig in Git |
| `.sessions/` | Nee | Sessiebestanden | `.gitignore` |
| `.vscode/`, `.idea/` | Nee | Editor | `.gitignore` |
| `*.bak`, `*.tmp`, `*.log`, `.DS_Store`, `Thumbs.db` | Nee | Rommel | `.gitignore` |
| `node_modules/`, `vendor/` | N.v.t. | Bestaan niet in dit project | Geen package manager |
| `README.md`, `start-server.ps1`, `.gitignore` | Ja | Docs / tooling | — |

### Gevoelige bestanden — nooit naar GitHub

- `.env`
- `auth-config.php`
- `data/.google-oauth.json`
- `data/.google-service-account.json`
- `data/google-drive.json` (bevat o.a. folder-id; bewust genegeerd)
- Productiewachtwoorden, tokens, private keys in welke vorm dan ook

Veilig voorbeeld: alleen `.env.example` (lege of placeholder `SCOUTS_ADMIN_PASSWORD_HASH=`).

---

## 4. Deployen naar de webhostingserver

### Verschil GitHub ↔ webserver

| | GitHub | Webhostingserver |
| --- | --- | --- |
| Doel | Broncode delen, historiek, samenwerking | De live website laten draaien |
| Geheimen | Mag **niet** | **Moeten** aanwezig zijn (`.env` of `auth-config.php`) |
| `uploads/` inhoud | Niet in Git | **Moet** op de server staan (anders ontbreken foto’s/PDF’s) |
| `router.php` | Wel in repo | Niet nodig voor Apache-productie (routing via `.htaccess`); mag wel mee, maar is geblokkeerd voor directe HTTP-toegang |
| Schrijfrechten | N.v.t. | `data/` en `uploads/` moeten schrijfbaar zijn voor PHP |
| Buildoutput | Geen build | Upload de bronbestanden zelf (HTML/CSS/JS/PHP) |

Er is **geen** compile-/buildstap: wat je uploadt, is wat de server uitvoert.

### Bestemming op de server

De codebase noemt **geen** exact pad zoals `/var/www/...` of `httpdocs`. Typisch bij shared hosting / Plesk is de **document root** (bijv. `httpdocs`, `public_html` of `www`). Controleer dit in je hostingpaneel.

Hieronder betekent **document root** die map waarin `index.html` / `page.php` / `.htaccess` naast elkaar staan.

### Uploadtabel

| Exact bestandspad of map | Uploaden naar de server? | Bestemming op de server | Functie | Opmerkingen of voorwaarden |
| --- | --- | --- | --- | --- |
| `index.html`, `login.html`, `admin.html` | Ja | `{document root}/` | Pagina-shells | Via `page.php` / gate geserveerd |
| `pages/` | Ja | `{document root}/pages/` | Subpagina’s | — |
| `assets/` | Ja | `{document root}/assets/` | CSS/JS/images | — |
| `api/` | Ja | `{document root}/api/` | JSON-API | Inclusief `api/.user.ini` |
| `includes/` | Ja | `{document root}/includes/` | Shared chrome | Mag niet publiek browsebaar zijn (`.htaccess` blokkeert `/includes`) |
| `config.php` | Ja | `{document root}/config.php` | Kernconfig | Directe HTTP-toegang geweigerd in `.htaccess` |
| `page.php`, `admin-gate.php`, `google-drive.php` | Ja | document root | Routing / Drive | — |
| `.htaccess` | Ja | document root | Apache-routing | Hosting moet `AllowOverride` toestaan |
| `.user.ini` | Ja | document root | Uploadlimieten | Werkt op PHP-FPM/CGI; kan enkele minuten duren |
| `robots.txt`, `sitemap.php`, `sitemap.xml` | Ja | document root | SEO | `/sitemap.xml` → `sitemap.php` via rewrite |
| `data/.htaccess` | Ja | `{document root}/data/` | Blokkeer data-HTTP | Essentieel |
| `data/site-data.json` | Ja* | `data/site-data.json` | Live inhoud | *Overschrijf productie niet blind met lokale testdata |
| `data/site-data.default.json` | Ja | `data/` | Reset-bron | — |
| `uploads/.htaccess` | Ja | `uploads/` | Veilige uploads | — |
| Inhoud van `uploads/` (jpg, pdf, …) | Ja (apart van Git) | `uploads/` | Media | Back-up vanaf live of opnieuw uploaden via admin |
| `.env` **of** `auth-config.php` | Ja (niet via publieke Git) | Zie hieronder | Login | Zonder credentials werkt admin login niet |
| `router.php` | Optioneel | document root | Lokaal-only router | Op Apache niet gebruikt; HTTP geblokkeerd |
| `start-server.ps1`, `README.md`, `.gitignore`, `.env.example` | Nee / optioneel | — | Docs/dev | Niet nodig voor de live site |
| `.git/` | Nee | — | Versiebeheer | Niet uploaden naar document root tenzij je dat bewust wilt |

### Credentials op de server

`config.php` laadt credentials in deze volgorde:

1. `auth-config.php` in de **bovenliggende map** van de site (buiten document root) — bij voorkeur.
2. Anders `auth-config.php` in de projectroot.
3. Anders variabelen uit de omgeving / `.env` in de projectroot (`SCOUTS_ADMIN_USERNAME`, `SCOUTS_ADMIN_PASSWORD_HASH`, optioneel `SCOUTS_GOOGLE_SETTINGS_PASSWORD_HASH`).

Constanten in `auth-config.php` winnen van `.env` als beide bestaan.

### Dependencies op de server

| Vereiste | Opmerking |
| --- | --- |
| PHP 8.1+ | Code gebruikt o.a. typed properties / moderne syntax |
| Extensies `session`, `json` | Vereist |
| `fileinfo` | Aanbevolen (uploadvalidatie) |
| `GD` | Aanbevolen (foto’s herschalen/JPEG) |
| Apache + `mod_rewrite` | Voor `.htaccess`-routing |
| Schrijfrechten op `data/` en `uploads/` | Admin-opslag en uploads |

Geen `npm install` / `composer install`.

### Publiek vs niet-publiek

| Publiek (via HTTP bedoeld) | Niet publiek bereikbaar |
| --- | --- |
| HTML-pagina’s (via `page.php`), `/assets/*`, `/uploads/*` (bestanden), `/api/site-data` (GET), `/sitemap.xml`, `robots.txt` | `data/` (geblokkeerd), `includes/` (geblokkeerd), `config.php` / `router.php` / `auth-config.php` / `.env` (geblokkeerd), admin zonder sessie |

---

## 5. Installatie en lokaal ontwikkelen

### 1. Benodigde software

- **PHP 8.1+** in PATH (`php -v`)
- Extensies: `session`, `json`; bij voorkeur `fileinfo` en `GD`
- **Git**
- Browser
- Op Windows: PowerShell (voor `start-server.ps1`)

Geen Node.js vereist.

### 2. Repository clonen

```powershell
git clone https://github.com/codebywout/scouts-Lille-Poederlee.git
cd scouts-Lille-Poederlee
```

(Pas de remote-URL aan als die afwijkt.)

### 3. Dependencies installeren

Niet van toepassing — er is geen package manager.

### 4. Configuratie instellen

```powershell
Copy-Item .env.example .env
```

Genereer een password-hash:

```powershell
php -r "echo password_hash('KIES-EEN-STERK-WACHTWOORD', PASSWORD_DEFAULT), PHP_EOL;"
```

Zet in `.env`:

```text
SCOUTS_ADMIN_USERNAME=admin
SCOUTS_ADMIN_PASSWORD_HASH=<plak-hier-de-hash>
```

Optioneel (Google Drive-instellingen in admin vergrendelen):

```text
SCOUTS_GOOGLE_SETTINGS_PASSWORD_HASH=<andere-hash>
```

Alternatief: maak `auth-config.php` met `SCOUTS_AUTH_USERNAME` / `SCOUTS_AUTH_PASSWORD_HASH` (zoals in de gitignore-beschrijving) — **commit die niet**.

Zorg dat `data/` en `uploads/` bestaan en schrijfbaar zijn. `uploads/.htaccess` moet aanwezig zijn; upload-inhoud ontbreekt na clone (gitignore) — dat is normaal.

### 5. Lokaal starten

```powershell
.\start-server.ps1
```

Gelijkwaardig:

```powershell
php -d upload_max_filesize=20M -d post_max_size=25M -d memory_limit=256M -S localhost:8000 router.php
```

### 6. Controleren

| URL | Verwacht |
| --- | --- |
| <http://localhost:8000> | Homepage laadt; inhoud uit `site-data.json` |
| <http://localhost:8000/login> | Loginpagina |
| <http://localhost:8000/admin> | Na login: admin; zonder login: redirect naar login |
| <http://localhost:8000/api/site-data> | JSON met site-inhoud |
| <http://localhost:8000/assets/css/style.css> | CSS-bundle |

Zonder de `-d`-uploadflags weigert PHP vaak foto’s groter dan ~2 MB.

---

## 6. Deployment stap voor stap

Er is in de repository **geen** geautomatiseerde CI/CD-pipeline of GitHub Action zichtbaar. Deployment is dus handmatig (FTP/SFTP, hosting-bestandsbeheer, of Git-pull op de server als jouw host dat ondersteunt).

### A. Wijziging → live (handmatige upload)

1. **Lokaal wijzigen** — pas de relevante bestanden aan (HTML/CSS/JS/PHP/data).
2. **Testen** — start met `start-server.ps1`, controleer publieke pagina’s en admin-flows (opslaan, upload, login).
3. **Asset-cache** — bij CSS/JS/image-wijzigingen: verhoog `SCOUTS_ASSET_VERSION` in `config.php` (formaat `YYYYMMDD-N`, zie bestaande waarde).
4. **Naar GitHub** (optioneel maar aanbevolen):
   ```powershell
   git status
   git add <bestanden>
   git commit -m "Korte uitleg van de wijziging"
   git push
   ```
   Voeg **geen** `.env`, `auth-config.php` of Drive-geheimen toe.
5. **Naar de webserver** — upload alleen de gewijzigde runtime-bestanden naar dezelfde relatieve paden onder de document root (zie sectie 4). Typische sets:
   - Alleen tekst/JS: `assets/js/…`, eventueel HTML
   - Styling: `assets/css/…` + `config.php` (versienummer)
   - Backend: `api/index.php`, `config.php`, …
   - Inhoud: ofwel via **admin op productie**, of voorzichtig `data/site-data.json` (conflict risico)
6. **Serverrechten** — bevestig schrijfrechten op `data/` en `uploads/`.
7. **Credentials** — zorg dat productie `.env` of `auth-config.php` intact blijft (niet overschrijven met lokale testgegevens).
8. **Controleren** — open `https://scoutslille.be/`, hard-refresh (`Ctrl+F5`), test `/login` + één admin-opslag, controleer dat uploads zichtbaar blijven.
9. **Fouten opsporen** — zie sectie 8. Hosting error-logs (Plesk/Cloud86 e.d.) raadplegen indien PHP-fouten.
10. **Terugrollen** — zet vorige bestandsversies terug via Git (`git checkout` lokaal + herupload) of hosting-backup. Herstel `data/site-data.json` en `uploads/` uit backup als inhoud beschadigd is.

### B. Als de server zelf een Git-clone is

Sommige hosts laten `git pull` in de document root toe. Dat staat **niet** in deze repo geconfigureerd; of jouw server dat ondersteunt, moet je bij de host verifiëren.

Let op bij `git pull` op productie:

- Secrets blijven buiten Git → ok.
- `uploads/` inhoud staat niet in Git → blijft lokaal op de server staan zolang je die map niet wist.
- `data/site-data.json` **staat wél in Git** → een pull kan live-inhoud overschrijven met de repo-versie. Stem af of inhoud via admin of via Git de bron van waarheid is.

### C. Wat dit project níet heeft

- Geen Cloudflare Pages-deployconfig in de repo.
- Geen Docker-compose / Dockerfile in de tracked files (`.htaccess` noemt Docker alleen in een deny-lijst).
- Geen FTP-script in de repo.

---

## 7. Configuratie en geheimen

### Waar waarden worden ingesteld

| Bron | Wat |
| --- | --- |
| `config.php` | Paden, uploadlimieten, `SCOUTS_ASSET_VERSION`, login rate-limit constanten |
| `.env` | `SCOUTS_ADMIN_USERNAME`, `SCOUTS_ADMIN_PASSWORD_HASH`, optioneel `SCOUTS_GOOGLE_SETTINGS_PASSWORD_HASH`, optioneel `SCOUTS_GOOGLE_SERVICE_ACCOUNT_JSON_PATH` (zie `google-drive.php`) |
| `auth-config.php` | `SCOUTS_AUTH_USERNAME`, `SCOUTS_AUTH_PASSWORD_HASH`, optioneel `SCOUTS_GOOGLE_SETTINGS_PASSWORD_HASH` |
| `data/site-data.json` | Redactionele inhoud (geen wachtwoorden) |
| `data/google-drive.json` | Drive folder-id (gitignored) |
| Admin-UI | Uploads van OAuth-client / credentials naar genegeerde data-bestanden |

### Lokaal vs server

| Waarde | Lokaal | Server |
| --- | --- | --- |
| Admin-wachtwoord | Eigen test-hash in `.env` | Sterke unieke productie-hash |
| `SCOUTS_ASSET_VERSION` | Mag gelijk lopen aan Git | Ophogen bij elke front-end release |
| `site-data.json` | Testdata ok | Productie-inhoud; niet licht overschrijven |
| Drive/OAuth-bestanden | Optioneel | Alleen indien je Drive gebruikt |

### Geheimen — regels

- Nooit echte hashes, tokens of keys in `README.md` of Git zetten.
- Nooit `.env` / `auth-config.php` / Google JSON publiek downloadbaar maken (`.htaccess` helpt, maar bestanden horen ook buiten Git).
- Deel credentials alleen via een veilige kanalen (hostingpaneel, password manager).

### Bestanden die nooit publiek toegankelijk mogen zijn

`data/*` (behalve dat de map sowieso denied is), `.env`, `auth-config.php`, `config.php` (deny), OAuth/service-account JSON, session-bestanden.

---

## 8. Problemen oplossen

### Admin-login faalt (“niet geconfigureerd” of 401)

- **Oorzaak:** geen/ongeldige `SCOUTS_ADMIN_*` of `auth-config.php`.
- **Check:** bestaat `.env` of `auth-config.php`? Is de hash met `password_hash` gemaakt?
- **Oplossing:** `.env` herstellen volgens `.env.example`; hash opnieuw genereren.

### “Te veel mislukte pogingen” (HTTP 429)

- **Oorzaak:** rate-limit na 5 mislukte logins (15 minuten lock, zie `config.php`).
- **Check:** bestand `data/.login-attempts.json` (indien aanwezig).
- **Oplossing:** wachten tot lock verloopt, of dat bestand verwijderen op een vertrouwde omgeving.

### Homepage leeg / geen nieuws of agenda

- **Oorzaak:** `/api/site-data` faalt; of `data/site-data.json` ontbreekt/corrupt; of nieuws staat op “concept” (`published: false`).
- **Check:** open `/api/site-data` in de browser; bekijk netwerk-tab.
- **Oplossing:** JSON herstellen uit backup of `site-data.default.json`; in admin berichten op zichtbaar zetten.

### CSS/JS lijkt “oud” na deploy

- **Oorzaak:** lange cache op versioned assets; versienummer niet verhoogd.
- **Check:** response-header `X-Asset-Version` / query `?v=` in HTML.
- **Oplossing:** `SCOUTS_ASSET_VERSION` in `config.php` verhogen en `config.php` uploaden; hard refresh.

### Foto-upload mislukt / te groot

- **Oorzaak:** PHP `upload_max_filesize` te laag; of geen schrijfrechten op `uploads/`.
- **Check:** lokale start zonder `-d`-flags; op server `.user.ini` / Plesk PHP-settings.
- **Oplossing:** limieten op 20M/25M zetten (zoals in `.user.ini` / `.htaccess`); maprechten corrigeren.

### Broken images na clone of deploy

- **Oorzaak:** `uploads/*` staat niet in Git.
- **Check:** bestaan de paden uit `site-data.json` onder `/uploads/…`?
- **Oplossing:** uploads van productie back-uppen/terugzetten, of opnieuw uploaden via admin.

### `/admin` toont blank of redirect-loop

- **Oorzaak:** sessiecookies (HTTPS/`Secure`), of `admin-gate.php` niet bereikbaar, of JS-fout.
- **Check:** browser console; of `/api/session` `authenticated: true` na login.
- **Oplossing:** HTTPS en cookie-domein controleren; opnieuw inloggen.

### Pretty URL’s werken niet (404 op `/over-ons`)

- **Oorzaak:** `.htaccess` niet actief (`AllowOverride None`) of geen `mod_rewrite`.
- **Check:** hostingsupport / Plesk “Apache & nginx settings”.
- **Oplossing:** AllowOverride inschakelen; bevestig dat document root de map mét `.htaccess` is.

### Google Drive-koppeling werkt niet

- **Oorzaak:** ontbrekende `data/.google-oauth.json` / service account / folder-id.
- **Check:** admin → Drive-instellingen; bestaansrechten bestanden.
- **Oplossing:** OAuth-client opnieuw uploaden en autoriseren; folder-id zetten. Exacte Google Cloud-stappen staan niet volledig in deze repo — configureer via de admin-UI en Google Cloud Console.

---

## 9. Onderhoud en uitbreidingen

| Ik wil… | Begin hier |
| --- | --- |
| Bestaande pagina-structuur/tekst in HTML aanpassen | Betreffende `index.html` of `pages/*.html`; gedeelde nav/footer: `includes/site-chrome.php` |
| Redactionele inhoud (nieuws, agenda, FAQ, contact, leiding) wijzigen | Bij voorkeur **admin** → schrijft `data/site-data.json` |
| Nieuwe publieke pagina toevoegen | Nieuw HTML-bestand onder `pages/`; route in `page.php` `$pages`; rewrite in `.htaccess` én `router.php`; link in `includes/site-chrome.php`; eventueel `sitemap.php` |
| Styling wijzigen | Juiste deelbestand in `assets/css/` (bijv. `home.css`, `pages.css`, `admin.css`); daarna `SCOUTS_ASSET_VERSION` verhogen |
| Vaste beelden vervangen | `assets/images/…` |
| Geüploade beelden/PDF’s vervangen | Admin-uploads → `uploads/` (+ referenties in `site-data.json`) |
| Frontend-gedrag wijzigen | `assets/js/script.js` (publiek) of `admin.js` (beheer) |
| API/serverlogica wijzigen | `api/index.php`, helpers in `config.php` / `google-drive.php` |
| Login/credentials wijzigen | `.env` of `auth-config.php` (niet committen) |
| Cache na release forceren | `SCOUTS_ASSET_VERSION` in `config.php` |
| Nieuwe versie deployen | Sectie 6 + uploadtabel sectie 4 |

---

## 10. Kwaliteitscontrole (voor maintainers van deze README)

Bij updates van documentatie of releases controleren:

- [ ] Genoemde paden bestaan in de repo of zijn als lokaal/gitignored/voorbeeld gemarkeerd.
- [ ] GitHub-tabel ↔ `.gitignore` consistent.
- [ ] Server-tabel bevat credentials + `uploads/`-inhoud + schrijfrechten.
- [ ] Geen echte wachtwoorden, hashes of tokens in de README.
- [ ] Commando’s zijn PHP/Git/PowerShell — geen verzonnen npm/composer-stappen.
- [ ] Onderscheid lokaal (`router.php`) vs productie (`.htaccess`) blijft duidelijk.

---

## API-referentie (compact)

Zie tabel in sectie 2 (`api/index.php`). Publiek bedoeld: vooral `GET /api/site-data`. Overige mutaties en Drive-routes: admin + same-origin.

---

## Licentie

Interne / groepswebsite voor Scouts Lille-Poederlee. Voeg een expliciete licentie toe als de repository publiek wordt gedeeld.
