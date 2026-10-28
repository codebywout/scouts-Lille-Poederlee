# Handleiding voor scoutsleiding

Je beheert de inhoud van de website via de beheeromgeving achter `/login`, bijvoorbeeld [scoutslille.be/login](https://scoutslille.be/login). Je hoeft hiervoor geen code of bestanden op de server aan te passen.

## Wat gebeurt er wanneer je iets wijzigt?

Teksten en gegevens, zoals agenda, nieuws, FAQ, leiding en tweedehandsaanbod, worden pas op de website gepubliceerd nadat je op **Opslaan** klikt. Controleer na het opslaan de gewone website om na te gaan of de wijziging goed zichtbaar is.

Foto’s en pagina-achtergronden werken anders: zodra een upload succesvol is, wordt het bestand verwerkt en meteen gepubliceerd. Een extra klik op Opslaan is daarvoor niet nodig. Als een upload van een pagina-achtergrond mislukt, blijft de bestaande achtergrond behouden.

Voor een maandplanning selecteer je eerst de tak en de maand en upload je daarna het PDF-bestand. Een nieuwe upload voor dezelfde maand vervangt de vorige planning. Als Google Drive gekoppeld is voor planningen, kan ook de overeenkomstige PDF in Drive vervangen worden. Controleer na de upload dus of je de juiste maand en het juiste bestand hebt gekozen.

Wanneer de website na een wijziging nog de oude versie toont, kan je browser een eerdere versie hebben bewaard. Gebruik **Ctrl+F5** om de pagina volledig te vernieuwen. Controleer daarna opnieuw de live website.

De beheeromgeving is bedoeld om de inhoud te wijzigen, niet om het volledige ontwerp aan te passen. De groepsnaam en het logo in de kop, de algemene kleuren, de menustructuur en nieuwe pagina’s zijn onderdeel van de programmacode. Daarvoor is technische hulp nodig.

## Persoonsgegevens

Publiceer alleen persoonsgegevens die nodig zijn voor de werking van de groep. Behandel rekeningnummers op de inschrijfpagina, telefoonnummers en andere persoonlijke gegevens zorgvuldig. Voeg geen bijkomende privé-informatie toe in vrije tekstvelden als die niet nodig is.

## Back-ups en herstellen

Met **Backup downloaden** download je een JSON-bestand met de opgeslagen websitegegevens, zoals teksten, agenda en contactinformatie. De eigenlijke foto’s en PDF’s op de server zitten niet in dit bestand. Het bestand alleen is daarom geen volledige back-up van de website.

Een herstel via Instellingen overschrijft de huidige websitegegevens met de gegevens uit het gekozen bestand. Gebruik dit alleen wanneer je zeker weet dat je het juiste bestand hebt; een verkeerde back-up kan recentere wijzigingen vervangen. Voor een volledige back-up, inclusief foto’s, PDF’s, code en serverinstellingen, lees je [Back-ups en hosting](hosting-en-back-ups.md).

## Problemen oplossen

Als opslaan mislukt, controleer dan of je nog ingelogd bent en probeer opnieuw. Kijk na de poging ook op de gewone website of de wijziging gepubliceerd is.

Als een foto of PDF niet wordt aanvaard, controleer dan of je het juiste soort bestand gebruikt en probeer indien nodig een kleiner bestand. Als een foto, PDF of tekst per ongeluk is verwijderd, stop dan met verdere wijzigingen die het herstel moeilijker kunnen maken. Voor teksten kan een recente JSON-back-up helpen; voor ontbrekende foto’s en PDF’s is een kopie van de uploads op de hosting nodig.

Verwijder of vervang geen bestanden rechtstreeks op de server tenzij je weet waarvoor ze dienen. De technische documentatie voor code, hosting en herstel staat in de [technische handleiding](technische-handleiding.md).
