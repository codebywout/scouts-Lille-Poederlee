# Scoutswebsite — start hier

Deze map bevat alles voor een **scoutswebsite met beheeromgeving**.  
De site is oorspronkelijk gemaakt voor [Scouts Lille-Poederlee](https://scoutslille.be). Andere scoutsgroepen kunnen dezelfde basis gebruiken voor hun **eigen** website.

Je hoeft **niet** te kunnen programmeren om gewone inhoud te beheren (teksten, agenda, foto’s, brieven). Dat doe je in de **beheeromgeving**: een beveiligde pagina op de website waar je na inloggen wijzigingen maakt.

**Kort: waar begin ik?**

| Jouw situatie | Begin hier |
| --- | --- |
| Ik beheer alleen teksten en foto’s op een bestaande live site | [Handleiding voor scoutsleiding](docs/handleiding-scoutsleiding.md) |
| Wij willen deze website voor onze eigen groep | Lees verder: *Is deze website geschikt…* en *Hoe zet ik de website online?* |
| Iemand vraagt technische hulp of “de code” | [Technische handleiding](docs/technische-handleiding.md) of [GitHub voor beginners](docs/github-voor-beginners.md) |

---

## Wat is dit?

Dit is een kant-en-klare website voor een scoutsgroep:

- Een **publieke site** die bezoekers zien (homepage, takken, nieuws, inschrijven, …).
- Een **beheeromgeving** waar leiding inhoud bijwerkt zonder code te wijzigen.

De bestanden kunnen op **GitHub** staan. GitHub is een website om projectbestanden te bewaren en te delen. Dat is **niet** hetzelfde als de werkende website die ouders en leden openen.

---

## Wat kan je ermee?

Dit staat echt in deze code:

| Onderdeel | Wat je ermee kunt |
| --- | --- |
| Homepage | Planning/agenda, veelgestelde vragen, contact |
| Takpagina’s | Kapoenen, Welpen, Jongverkenners, Verkenners en Jins — met leiding, brieven en maandplanning |
| Nieuws | Berichten plaatsen en tonen |
| Over ons | Tekst en groepsleiding |
| Inschrijven | Info zoals lidgeld en rekeningnummer |
| Foto’s & achtergronden | Beelden uploaden via de beheeromgeving (meteen op de site) |
| Uniform & tweedehands | Informatiepagina’s (tweedehands ook via beheer bij te werken) |
| Inloggen + beheer | Inhoud wijzigen na login |

Dagelijks werk: [docs/handleiding-scoutsleiding.md](docs/handleiding-scoutsleiding.md).

---

## Is deze website geschikt voor mijn scoutsgroep?

**Ja, als basis.** Jullie vullen hem met jullie eigen gegevens. Scouts Lille-Poederlee is alleen het **voorbeeld** — hun teksten, foto’s en contactgegevens hoef je niet te houden.

Wat je meestal aanpast:

1. **Contact, leiding, agenda, nieuws, FAQ, lidgeld** — via de beheeromgeving.
2. **Foto’s, achtergronden, brieven, maandplanningen** — via de beheeromgeving.
3. **Domeinnaam en hosting** — zelf regelen (zie *Hoe zet ik de website online?*).
4. **Login voor beheerders** — zelf instellen op de server. Wachtwoorden horen **niet** in GitHub.
5. **Groepsnaam in logo/kop/voettekst, kleuren, menu of andere taknamen** — zit in de code. Daarvoor heb je meestal technische hulp nodig.

De takken in deze versie zijn de klassieke Vlaamse indeling (Kapoenen t.e.m. Jins). Andere indelingen vragen codewijzigingen.

**Hoe krijg je de bestanden?** Via GitHub (bijvoorbeeld als ZIP-download of met hulp van iemand die Git kent), of als kopie van wie de site al beheert. Exacte knoppen op GitHub kunnen wijzigen; vraag zo nodig technische hulp.

---

## Hoe bekijk ik de website?

### Optie A — Een live voorbeeld bekijken

Open in je browser bijvoorbeeld [scoutslille.be](https://scoutslille.be).  
Dat toont de **live site van Lille-Poederlee** (hun inhoud), niet automatisch “jouw lege nieuwe site”.

Wil je de beheeromgeving van *jullie* live site gebruiken: ga naar `/login` op **jullie** adres (voorbeeldvorm: `https://jullie-domein.be/login`).

### Optie B — Lokaal op je computer (testen)

**Lokaal** = de website op *jouw* computer bekijken, zonder ze meteen op het internet te zetten.

Dit vraagt al wat technische stappen. Voor de meeste leiding is Optie A of de live site van jullie groep genoeg. Voor lokaal testen heb je **PHP** nodig (het programma waarmee deze site draait) en hulp bij de eerste installatie.

Kort overzicht (details in de technische handleiding):

1. PHP installeren tot `php -v` werkt.
2. Een beheerlogin instellen (bestand `.env`, op basis van `.env.example`).
3. Op Windows het script `start-server.ps1` starten.
4. In de browser openen: `http://localhost:8000`.

Volledige stappen: [docs/technische-handleiding.md](docs/technische-handleiding.md) (lokaal starten).

---

## Hoe pas ik de website aan?

### Zelf, via de beheeromgeving (geen programmeren)

1. Log in op `/login` van **jullie** website.
2. Kies het juiste onderdeel (Home, Nieuws, een tak, Foto’s, Achtergronden, …).
3. Wijzig de inhoud.
4. Sla op waar de site dat vraagt. Foto’s en achtergronden staan meteen online na een geslaagde upload.
5. Controleer de publieke pagina (knop **Bekijk live** of jullie gewone websiteadres).

Geschikt voor o.a. contact, agenda, nieuws, FAQ, leiding, foto’s, achtergronden, brieven en maandplanningen (PDF), lidgeld en rekeningnummer.

- Stap voor stap: [docs/handleiding-scoutsleiding.md](docs/handleiding-scoutsleiding.md)  
- Waar hoort wat?: [docs/website-beheren.md](docs/website-beheren.md)

### Met technische hulp

Niet via de beheeromgeving:

- Groepsnaam/logo in de kop en voettekst  
- Andere kleuren of layout  
- Extra pagina’s of ander menu  
- Hosting, domein en serverlogin  

Zie [docs/technische-handleiding.md](docs/technische-handleiding.md).

---

## Hoe zet ik de website online?

Je hebt **hosting** nodig: een plek op het internet waar de websitebestanden staan, zodat bezoekers de site kunnen openen. Vaak koop je ook een **domeinnaam** (het adres, zoals `jouwgroep.be`).

Algemene stappen die bij dit project passen:

1. Kies een hoster die **PHP**-websites ondersteunt (welke hoster staat **niet** vast in deze map).
2. Zet de websitebestanden op de server (hoe: hangt van je hoster af — uploadpaneel, SFTP, …).
3. Stel op de server een beheerlogin in. Deel die gegevens niet via GitHub.
4. Controleer: site laden, inloggen, iets opslaan in de beheeromgeving, een foto uploaden.
5. Maak back-ups van jullie teksten/gegevens én van geüploade foto’s en PDF’s. GitHub is **geen** volledige back-up daarvan.

Zelf te regelen (staat niet kant-en-klaar hier):

- Hoster en pakket  
- Map op de server  
- Domein en beveiligde verbinding (https)  
- Wie rekeningen en wachtwoorden beheert  

Meer: [docs/hosting-en-back-ups.md](docs/hosting-en-back-ups.md).

---

## Waar vind ik meer uitleg?

| Handleiding | Wanneer |
| --- | --- |
| [docs/handleiding-scoutsleiding.md](docs/handleiding-scoutsleiding.md) | Teksten, agenda, foto’s of brieven beheren |
| [docs/website-beheren.md](docs/website-beheren.md) | Weten wáár welke inhoud thuishoort |
| [docs/overdracht.md](docs/overdracht.md) | Website overdragen aan nieuwe verantwoordelijken |
| [docs/github-voor-beginners.md](docs/github-voor-beginners.md) | Uitleg over GitHub in gewone taal |
| [docs/hosting-en-back-ups.md](docs/hosting-en-back-ups.md) | Online zetten, back-ups, herstel |
| [docs/technische-handleiding.md](docs/technische-handleiding.md) | Code, tests, serverdetails |

---

## Problemen?

1. **Site laadt niet** — Andere browser of telefoon? Internet oké? Noteer wat je ziet.
2. **Inloggen lukt niet** — Controleer gebruikersnaam en wachtwoord. Probeer niet eindeloos opnieuw. Vraag wie de login beheert.
3. **Wijziging niet zichtbaar** — Opgeslagen? Pagina vernieuwen (soms Ctrl+F5). Foto’s/achtergronden staan meteen online na een geslaagde upload.
4. **Net bestanden op de server gezet en alles kapot** — Stop met uploaden. Lees [hosting en back-ups](docs/hosting-en-back-ups.md).
5. **Geen idee waar te beginnen** — Deze README, of [handleiding-scoutsleiding.md](docs/handleiding-scoutsleiding.md) voor inhoud.

Nog vast? Noteer wat je deed en wat je zag, en vraag technische hulp met de [technische handleiding](docs/technische-handleiding.md) erbij.
