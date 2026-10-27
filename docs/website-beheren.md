# Website-inhoud: waar wijzig je wat?

Praktisch overzicht per type inhoud. Standaard regel:

> **Inhoud** → beheeromgeving op de live site.  
> **Uiterlijk, gedrag, nieuwe pagina’s** → code (technische hulp).

Zie ook [handleiding-scoutsleiding.md](handleiding-scoutsleiding.md).

---

## Sneloverzicht

| Inhoud | Normaal via beheeromgeving | Code nodig? |
| --- | --- | --- |
| Agenda / planning homepage | Home → Planning | Nee |
| FAQ | Home → Veelgestelde vragen | Nee |
| Contact e-mail & adres | Home → Contact | Nee |
| Nieuwsberichten | Nieuws | Nee |
| Over ons-tekst | Over ons | Nee |
| Groepsleiding | Over ons | Nee |
| Lidgeld & rekeningnummer | Inschrijven | Nee |
| Takleiding | Tak kiezen | Nee |
| Brieven (PDF) | Tak → Brieven | Nee |
| Maandplanning (PDF) | Tak → Maandplanning | Nee |
| Tak- / Over ons-foto’s | Foto’s | Nee |
| Pagina-achtergronden | Achtergronden | Nee |
| Tweedehandsitems | Tweedehands | Nee |
| Menu-structuur / nieuwe URL | — | Ja |
| Kleuren, lettertypes, layout | — | Ja (`assets/css/…`) |
| Knoppen/gedrag op publieke site | — | Ja (`assets/js/script.js` + minify) |
| Login/wachtwoord op server | — | Ja (hosting + geheimen, niet via Git) |
| Privacyverklaring-pagina-shell | Deels vaste HTML in `pages/` | Tekstaanpassingen in HTML = code |
| Google Drive-koppeling | Instellingen (optioneel) | Service-account/geheimen = technisch |

---

## Waar landen wijzigingen technisch?

Bevestigd in de repository:

| Soort | Opslag |
| --- | --- |
| Teksten, lijsten, paden naar media | `data/site-data.json` op de **server** (via API na opslaan in admin) |
| Geüploade foto’s en PDF’s | Map `uploads/` op de **server** (inhoud staat in `.gitignore`) |
| Vaste paginaschillen (HTML) | Bestanden onder `pages/` en `index.html` in de **code** |
| Styling | `assets/css/` |
| Publiek JavaScript | `assets/js/script.js` → moet geminificeerd worden tot `script.min.js` |
| Admin JavaScript | `assets/js/admin.js` |

Daarom: een commit op GitHub zonder serverupload wijzigt de live site niet. En omgekeerd: admin-opslaan wijzigt GitHub niet automatisch.

---

## Beheeromgeving vs. bestanden in Git

| Situatie | Doe dit |
| --- | --- |
| Typfout in FAQ | Admin → Home → FAQ → opslaan |
| Nieuwe maandplanning | Admin → tak → PDF uploaden |
| Logo van de scoutsbeweging vervangen in de header | Technisch: image/code under `assets/` (**niet** via de admin-foto’s-sectie, tenzij later zo gebouwd — huidige admin richt zich op content-foto’s/achtergronden) |
| “Ik zie in GitHub oude teksten” | Normaal: GitHub kan achterlopen op live `site-data.json`. Live is leidend voor inhoud. |

---

## Wat je níet in GitHub moet “fixen” voor inhoud

- Geen telefoonnummers of IBAN rechtstreeks in PHP/HTML plakken als de admin daar een veld voor heeft.
- Geen productie-`uploads/` in de repository dumpen.
- Geen `.env` of `auth-config.php` committen.

---

## Optioneel: Google Drive

In **Instellingen** kan een Google Drive-integratie geconfigureerd worden (service-account / OAuth-bestanden lokaal of op de server, genegeerd door Git).

- **Te bevestigen** bij de huidige beheerder: of Drive actief gebruikt wordt op productie.
- Zonder Drive blijft de rest van de site werken; Drive is optioneel in de architectuur.

---

## Als je twijfelt

1. Bestaat er een knop/veld in de admin? → Gebruik dat.
2. Anders → [technische-handleiding.md](technische-handleiding.md) of een ontwikkelaar.
3. Nooit “gokkend” bestanden op de hosting wissen.
