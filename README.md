# Scoutswebsite — start hier

Deze map bevat de code en uitleg voor een **scoutswebsite met beheeromgeving**.  
De site is gemaakt voor [Scouts Lille-Poederlee](https://scoutslille.be), maar andere scoutsgroepen kunnen dezelfde basis gebruiken voor hun eigen website.

Je hoeft **niet** te kunnen programmeren om gewone inhoud te beheren (teksten, agenda, foto’s, brieven). Daarvoor gebruik je de **beheeromgeving**: een beveiligde pagina op de website waar je na inloggen wijzigingen maakt.

---

## Wat is dit?

Dit is een kant-en-klare website voor een scoutsgroep:

- Een **publieke site** die bezoekers zien (homepage, takken, nieuws, inschrijven, …).
- Een **beheeromgeving** waar leiding inhoud bijwerkt zonder code te wijzigen.

**GitHub** (de website waarop deze bestanden staan) is alleen de opslagplaats van de code en de handleidingen. Dat is **niet** hetzelfde als de werkende website op het internet.

---

## Wat kan je ermee?

Gebaseerd op wat in deze code echt bestaat:

| Onderdeel | Wat bezoekers / leiding ermee kunnen |
| --- | --- |
| Homepage | Intro, planning/agenda, veelgestelde vragen, contact |
| Takpagina’s | Kapoenen, Welpen, Jongverkenners, Verkenners en Jins — met leiding, brieven en maandplanning |
| Nieuws | Berichten plaatsen en tonen |
| Over ons | Tekst en groepsleiding |
| Inschrijven | Info zoals lidgeld en rekeningnummer |
| Foto’s & achtergronden | Beelden uploaden via de beheeromgeving |
| Uniform & tweedehands | Informatiepagina’s (tweedehands ook via beheer bij te werken) |
| Inloggen + beheer | Inhoud wijzigen na login |

Dagelijks werk gebeurt via de beheeromgeving. Zie [docs/handleiding-scoutsleiding.md](docs/handleiding-scoutsleiding.md).

---

## Is deze website geschikt voor mijn scoutsgroep?

**Ja, als basis.** Andere groepen kunnen deze code overnemen en vullen met hun eigen gegevens.

Je past waarschijnlijk minstens dit aan:

1. **Naam, adres, e-mail, leiding** — via de beheeromgeving.
2. **Foto’s, brieven, maandplanningen, agenda, nieuws** — via de beheeromgeving.
3. **Domeinnaam en hosting** — zelf regelen (zie hieronder).
4. **Login voor beheerders** — zelf instellen op de server (geen wachtwoorden in deze map op GitHub).
5. **Kleuren, logo, menu of andere taknamen** — dat zit in de code en vraagt meestal technische hulp.

De takken in deze versie zijn de klassieke Vlaamse indeling (Kapoenen t.e.m. Jins). Andere indelingen of een heel andere huisstijl vragen codewijzigingen.

Scouts Lille-Poederlee is hier het **voorbeeld**. Hun teksten, foto’s en contactgegevens moet je niet overnemen; vul je eigen groepsgegevens in.

---

## Hoe bekijk ik de website?

### Optie A — De live website (als die al online staat)

Open in je browser het adres van de groep, bijvoorbeeld [scoutslille.be](https://scoutslille.be).  
Zo zie je wat bezoekers zien. Voor beheer: ga naar `/login` op diezelfde site (bijv. `https://scoutslille.be/login`).

### Optie B — Lokaal op je computer

**Lokaal** betekent: de website op *jouw* computer bekijken, zonder ze meteen op het internet te zetten. Handig om te testen.

Je hebt daarvoor **PHP** nodig. PHP is het programma waarmee deze website draait. Zonder PHP start de site lokaal niet.

Eenvoudige route op Windows (zoals deze projectmap bedoeld is):

1. Zorg dat PHP op je computer geïnstalleerd is en werkt (`php -v` in een terminal).
2. Open deze projectmap.
3. Stel eenmaal een beheerlogin in (bestand `.env` op basis van `.env.example`). Details staan in de [technische handleiding](docs/technische-handleiding.md).
4. Start de lokale server met het script `start-server.ps1` (of het PHP-commando uit die handleiding).
5. Open in je browser: `http://localhost:8000`.

Lukt dit niet? Vraag iemand met wat technische ervaring, of lees [docs/technische-handleiding.md](docs/technische-handleiding.md) (onderdeel over lokaal starten).

---

## Hoe pas ik de website aan?

### Zelf, via de beheeromgeving (geen programmeren)

1. Log in op `/login`.
2. Kies het juiste onderdeel (Home, Nieuws, een tak, Foto’s, Achtergronden, …).
3. Wijzig de inhoud.
4. Sla op waar de site dat vraagt. Foto’s en achtergronden worden meteen geplaatst.
5. Controleer de publieke pagina.

Voorbeelden van wat daar thuishoort:

- Contactgegevens en praktische info  
- Agenda, nieuws en FAQ  
- Leiding per tak en groepsleiding  
- Foto’s, achtergronden, brieven en maandplanningen (PDF)  
- Lidgeld en rekeningnummer  

Uitleg stap voor stap: [docs/handleiding-scoutsleiding.md](docs/handleiding-scoutsleiding.md)  
Overzicht “waar hoort wat?”: [docs/website-beheren.md](docs/website-beheren.md)

### Met technische hulp (code)

Dit hoort **niet** in de beheeromgeving:

- Groepsnaam in logo/titel overal hard in de code  
- Andere kleuren, lettertypes of layout  
- Extra pagina’s of andere menustructuur  
- Hosting, domein en beheerwachtwoord op de server  

Die dingen staan in de [technische handleiding](docs/technische-handleiding.md).

---

## Hoe zet ik de website online?

Om de site op het internet te zetten heb je **hosting** nodig. Hosting is de plek op het internet waar de bestanden van je website bewaard worden en vanaf waar bezoekers je site kunnen openen. Vaak koop je daarbij ook een **domeinnaam** (het adres, zoals `jouwgroep.be`).

Algemene werkwijze die bij deze repository past:

1. Kies een hoster die **PHP**-websites ondersteunt (exacte provider staat niet vast in deze code).
2. Zet de websitebestanden op de server (hoe je dat doet — uploadpaneel, SFTP, … — hangt van je hoster af).
3. Zorg op de server voor een beheerlogin (via `.env` of een apart configbestand — **niet** via GitHub delen).
4. Controleer of de site laadt, of inloggen werkt, en of opslaan in de beheeromgeving lukt.
5. Maak back-ups van je inhoudsbestand en van geüploade foto’s/PDF’s. GitHub is **geen** volledige back-up daarvan.

Wat je zelf moet regelen (staat niet kant-en-klaar in deze map):

- Welke hoster en welk pakket  
- Exacte map op de server  
- Domein en beveiligde verbinding (https)  
- Wie de rekeningen en wachtwoorden beheert  

Meer nuance: [docs/hosting-en-back-ups.md](docs/hosting-en-back-ups.md) en [docs/technische-handleiding.md](docs/technische-handleiding.md).

---

## Waar vind ik meer uitleg?

| Handleiding | Wanneer lezen? |
| --- | --- |
| [docs/handleiding-scoutsleiding.md](docs/handleiding-scoutsleiding.md) | Je wilt teksten, agenda, foto’s of brieven beheren. |
| [docs/website-beheren.md](docs/website-beheren.md) | Je wilt weten wáár welke inhoud thuishoort. |
| [docs/overdracht.md](docs/overdracht.md) | De website gaat over naar nieuwe verantwoordelijken. |
| [docs/github-voor-beginners.md](docs/github-voor-beginners.md) | Iemand noemt GitHub, branches of “de code”. |
| [docs/hosting-en-back-ups.md](docs/hosting-en-back-ups.md) | Online zetten, back-ups of “de site is kapot”. |
| [docs/technische-handleiding.md](docs/technische-handleiding.md) | Je helpt technisch (code, tests, serverdetails). |

---

## Problemen?

Probeer eerst dit:

1. **Site laadt niet** — Andere browser of telefoon? Wifi/data oké? Noteer de exacte fout of het witte scherm.
2. **Inloggen lukt niet** — Controleer gebruikersnaam/wachtwoord. Probeer niet eindeloos opnieuw (er kan een limiet zijn). Vraag wie de login beheert.
3. **Wijziging niet zichtbaar** — Heb je opgeslagen? Pagina vernieuwen (soms Ctrl+F5). Foto’s/achtergronden staan meteen online na een geslaagde upload.
4. **Net bestanden op de server gezet en alles kapot** — Stop met verder uploaden. Lees [hosting en back-ups](docs/hosting-en-back-ups.md).
5. **Geen idee waar je moet zijn** — Terug naar deze README, of [handleiding-scoutsleiding.md](docs/handleiding-scoutsleiding.md) voor inhoud.

Werkt het nog niet? Noteer wat je deed en wat je zag, en vraag technische hulp met [docs/technische-handleiding.md](docs/technische-handleiding.md) erbij.
