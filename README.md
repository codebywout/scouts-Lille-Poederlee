# Scouts Lille-Poederlee — website

Dit is de code en documentatie van de groepswebsite **[scoutslille.be](https://scoutslille.be)**: de publieke site én de beheeromgeving waarmee leiding teksten, agenda, nieuws, foto’s, brieven en maandplanningen bijwerkt.

Je hoeft **niet** te kunnen programmeren om de gewone inhoud te beheren. Daarvoor gebruik je de beheeromgeving op de live website.

---

## Waar begin ik?

| Jouw situatie | Lees dit eerst |
| --- | --- |
| Ik wil teksten, agenda, foto’s of brieven aanpassen | [docs/handleiding-scoutsleiding.md](docs/handleiding-scoutsleiding.md) |
| Ik wil weten *waar* welke inhoud thuishoort | [docs/website-beheren.md](docs/website-beheren.md) |
| We nemen de website over van vorige leiding | [docs/overdracht.md](docs/overdracht.md) |
| Iemand praat over GitHub / “de code” | [docs/github-voor-beginners.md](docs/github-voor-beginners.md) |
| Back-ups, hosting of “de site is kapot” | [docs/hosting-en-back-ups.md](docs/hosting-en-back-ups.md) |
| Ik programmeer of help technisch | [docs/technische-handleiding.md](docs/technische-handleiding.md) |

---

## Moet ik kunnen programmeren?

**Nee**, niet voor dagelijks beheer.

- **Zelf doen:** inloggen op de beheeromgeving, inhoud wijzigen, opslaan, controleren op de publieke site.
- **Technische hulp vragen:** layout/styling wijzigen, nieuwe pagina’s, loginproblemen op serverniveau, hosting, domeinnaam, GitHub-code, herstel na een mislukte code-upload.

Kort: inhoud via de beheeromgeving; code en hosting via iemand met technische kennis.

---

## Hoe wijzig ik gewone website-inhoud?

1. Ga naar de loginpagina van de live site (pad `/login` op scoutslille.be).
2. Log in met het **beheeraccount** (gebruikersnaam + wachtwoord — die krijg je bij de overdracht, niet uit deze repository).
3. Kies in de beheeromgeving het juiste onderdeel (Home, Nieuws, een tak, Foto’s, …).
4. Wijzig de inhoud en klik **opslaan**.
5. Open de publieke pagina (“Bekijk live”) en controleer het resultaat.

Uitgebreide stappen: [handleiding voor scoutsleiding](docs/handleiding-scoutsleiding.md).

---

## Foto’s, brieven en maandplanningen

| Soort | Waar in de beheeromgeving (bevestigd in de code) |
| --- | --- |
| Foto’s van takken / Over ons | Sectie **Foto’s** |
| Pagina-achtergronden | Sectie **Achtergronden** |
| Brieven (PDF) per tak | Bij die **tak** → **Brieven** |
| Maandplanning (PDF) per tak | Bij die **tak** → **Maandplanning** |
| Agenda en FAQ | Sectie **Home** |
| Contact (e-mail, adres) | Sectie **Home** |
| Lidgeld / rekeningnummer | Sectie **Inschrijven** |
| Groepsleiding | Sectie **Over ons** |
| Takleiding | Bij de betreffende **tak** |

Bestanden komen op de **server** in de map `uploads/` terecht. Ze zitten **niet** automatisch veilig in GitHub.

---

## Beheeromgeving, GitHub en hosting — wat is wat?

Drie verschillende dingen:

1. **Beheeromgeving** (`/admin` na login) — hier wijzig je de *inhoud* van de live website. Wijzigingen gaan naar `data/site-data.json` en uploads op de server.
2. **GitHub** — online opslag van de *broncode* en documentatie. Handig voor ontwikkelaars en geschiedenis van codewijzigingen. **Geen** volledige back-up van alle productiefoto’s, PDF’s of actuele servergegevens.
3. **Hosting** — de server waar scoutslille.be draait. Daar staan de werkende site, geheimen (login), `site-data.json` van productie en de map `uploads/`.

> **Belangrijk:** GitHub garandeert **geen** volledige back-up van productiegegevens en uploads. Maak aparte back-ups van data en uploads (zie [hosting en back-ups](docs/hosting-en-back-ups.md)).

---

## Wat mag ik zelf doen / waarvoor technische hulp?

**Zelf (via beheeromgeving), als je toegang hebt:**

- Teksten, contact, agenda, nieuws, FAQ
- Leidingnamen en telefoonnummers
- Foto’s, achtergronden, brieven, maandplanningen
- Backup van sitegegevens downloaden via Instellingen (JSON) — *te controleren of je die knop ziet na login*
- Controleren of wijzigingen op de publieke site kloppen

**Technische hulp nodig:**

- Wachtwoord of login op de server opnieuw instellen
- Code, CSS, JavaScript of PHP wijzigen
- Iets “naar GitHub pushen” of mergen naar `main`
- Bestanden op de hosting uploaden/overschrijven
- Domeinnaam, SSL, e-mail van de hoster
- Volledige website herstellen na een mislukte deploy

---

## Website werkt niet — wat nu?

1. Controleer of [scoutslille.be](https://scoutslille.be) überhaupt laadt (andere browser / telefoon / wifi).
2. Werkt alleen één pagina niet? Noteer welke URL en wat je ziet.
3. Lukt inloggen niet? Probeer niet eindeloos verkeerde wachtwoorden (er kan een limiet op loginpogingen staan). Vraag de beheerder van de hosting/login.
4. Is er net een code-upload gebeurd? Stop met verdere uploads; volg [hosting en back-ups](docs/hosting-en-back-ups.md) of bel technische hulp.
5. Vul bij overdracht in wie je belt bij uitval — zie [overdracht.md](docs/overdracht.md) (`NOG IN TE VULLEN`).

---

## Gegevens en foto’s niet kwijtraken

- Wijzig inhoud via de **beheeromgeving**, niet door willekeurig bestanden op GitHub te wissen.
- Download periodiek een **JSON-backup** via Instellingen in de admin (als beschikbaar) en bewaar die veilig buiten de website.
- Vraag de hostingbeheerder om periodieke back-ups van **`data/site-data.json`** én de map **`uploads/`**.
- Overschrijf op de server nooit `uploads/` of `site-data.json` met een lege of oude Git-kopie zonder eerst een back-up te hebben.
- GitHub bevat mogelijk een momentopname van `data/site-data.json`, maar **niet** betrouwbaar alle live uploads.

---

## Volgende handleiding

- **Dagelijks beheer:** [docs/handleiding-scoutsleiding.md](docs/handleiding-scoutsleiding.md)
- **Overname van de groep:** [docs/overdracht.md](docs/overdracht.md)
- **Techniek:** [docs/technische-handleiding.md](docs/technische-handleiding.md)
