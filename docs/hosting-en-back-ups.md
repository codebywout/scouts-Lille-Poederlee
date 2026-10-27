# Hosting en back-ups

Dit document beschrijft wat **in de repository bevestigd** is over hosting en herstel, en wat je nog bij de provider/beheerder moet navragen.

Er is **geen** automatische deploy vanuit GitHub Actions naar productie (bevestigd in `.github/workflows/ci.yml`).

---

## 1. Welke hosting en servertechnologie?

| Onderdeel | Status |
| --- | --- |
| Publieke site | https://scoutslille.be (bevestigd als basis-URL in code) |
| Stack op server | PHP-website met Apache-achtige rewrite via `.htaccess` (bevestigd in repo). Lokale dev gebruikt `router.php` + PHP built-in server. |
| Exacte provider | **Te bevestigen** (`NOG IN TE VULLEN` in [overdracht.md](overdracht.md)) |
| Exact document root-pad | **Te bevestigen** |
| Plesk of ander paneel | In technische docs als mogelijke context genoemd; **niet** hard bewezen door tracked config |

Vereisten die uit de code/CI blijken: PHP met extensies zoals **gd**, **curl**, **fileinfo** (CI gebruikt PHP 8.3). Productie-PHP-versie: **te bevestigen** bij de hoster.

---

## 2. Wat staat er op de server?

Typische productie-inhoud (afgeleid uit projectstructuur + technische handleiding):

| Onderdeel | Rol |
| --- | --- |
| HTML/PHP/CSS/JS uit de repo | De applicatie |
| `.htaccess`, `.user.ini` | Routing en PHP-limieten |
| `data/site-data.json` | **Productiegegevens** (teksten, agenda, paden naar media, …) |
| `uploads/` (+ `uploads/originals/`) | **Productiemedia** (foto’s, PDF’s, gegenereerde varianten) |
| `.env` of `auth-config.php` | Login-geheimen (**niet** in Git) |
| Eventueel Google-credentials onder `data/` | Optioneel Drive (**niet** in Git) |
| Sessiemap / login-attempt bestanden | Runtime (gitignored) |

Op de server **niet** nodig om de site te tonen: `tools/`-ontwikkelscripts, lokale `node_modules`, CI-config.

---

## 3. Wat zijn productiegegevens?

Behandel als kritiek:

1. **`data/site-data.json`** — alle beheerinhoud.
2. **`uploads/`** — alle geüploade en afgeleide bestanden.
3. **Geheimen** — `.env` / `auth-config.php` / Google JSON.
4. Eventueel serverback-ups die de hoster zelf maakt — **frequentie te bevestigen**.

`data/site-data.default.json` in Git is een **standaard/voorbeeldstructuur**, geen vervanging van live data.

---

## 4. Code, config, JSON-data en uploads apart veiligstellen

Maak mentaal (en praktisch) vier schijven:

| Laag | Voorbeeld | Back-uphoe? |
| --- | --- | --- |
| **Code** | PHP, HTML, CSS, JS, `.htaccess` | GitHub + eventueel export; deploy vanaf bekende commit |
| **Serverconfig / geheimen** | `.env`, `auth-config.php` | Alleen via beveiligde kluis/hostingback-up — **niet** GitHub |
| **JSON-data** | `data/site-data.json` | Download via admin-backup **en/of** kopie vanaf server |
| **Uploads** | `uploads/**` | Apart downloaden/archiveren vanaf server; staat niet betrouwbaar in Git |

> GitHub is nuttig voor **codegeschiedenis**, niet als enige reddingsboei voor foto’s en actuele JSON.

---

## 5. Back-up controleren en terugzetten

### Controleren (aanbevolen checklist)

- [ ] Datum van laatste `site-data.json`-kopie bekend
- [ ] Archief van `uploads/` opent en bevat recente PDF’s/foto’s
- [ ] Test-restore op een **niet-productie**-plek indien mogelijk (**procedure te bevestigen**)
- [ ] Admin → Backup downloaden werkt nog op live

### Terugzetten — data (niet hetzelfde als code!)

1. Zet de site zo nodig in onderhoud / waarschuw leiding (**proces te bevestigen**).
2. Zet een bekende goede `site-data.json` terug op de server (of via admin-herstel als die functie gebruikt wordt).
3. Zet ontbrekende bestanden in `uploads/` terug zodat paden in JSON weer kloppen.
4. Test login + enkele publieke pagina’s.

### Terugzetten — code

1. Deploy opnieuw de laatste **bekende goede** codeversie (van Git-tag/commit of eerdere serverkopie).
2. **Overschrijf niet** blind `data/` en `uploads/` met een lege of oude ontwikkelmap.

Exacte FTP/SFTP/Plesk-klikpaden: **te bevestigen** bij de huidige beheerder.

---

## 6. Herstel na een mislukte codewijziging

**Code-rollback** = oude programmacode terugzetten.  
**Dataherstel** = inhoud en uploads terugzetten.

Scenario: iemand uploadde kapotte PHP/JS.

1. Stop verdere uploads.
2. Zet de vorige werkende **codebestanden** terug.
3. Laat `site-data.json` en `uploads/` met rust tenzij die per ongeluk meegenomen/overschreven zijn.
4. Als data wél beschadigd is: apart data-back-up terugzetten (stap hierboven).
5. Smoke-check: homepage, login, één opslag in admin.

CI-groen op GitHub bewijst **niet** automatisch dat productie al hersteld is.

---

## 7. Extra voorzichtigheid

| Actie | Risico |
| --- | --- |
| Hele projectmap vanaf laptop naar server kopiëren inclusief lege `uploads/` | Live media wissen |
| `site-data.json` uit Git over productie zetten | Recentere live-inhoud kwijt; mogelijk testdata terug |
| Geheimen committen of in tickets plakken | Lek, vooral bij publieke repo |
| Alleen Git revert doen en denken dat PDF’s terug zijn | Uploads zaten niet in Git |
| Zonder back-up “opschonen” op de server | Permanent verlies |

---

## 8. Wat nog ingevuld moet worden

Neem over in [overdracht.md](overdracht.md):

- Provider, paneel-URL, document root
- Back-upfrequentie van de hoster
- Wie back-ups downloadt en waar die archieven liggen
- Concrete restore-oefening (datum laatste geslaagde test)

---

## Verder lezen

- [technische-handleiding.md](technische-handleiding.md) — secties deployment, rollback, wat níet uploaden
- [overdracht.md](overdracht.md) — verantwoordelijken
- [README.md](../README.md) — startpunt voor leiding
