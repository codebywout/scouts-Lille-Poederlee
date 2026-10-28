# Hosting, back-ups en herstel

Deze handleiding legt uit welke onderdelen nodig zijn om de website online te houden en hoe je voorkomt dat inhoud of bestanden verloren gaan. Een volledige back-up bestaat uit meer dan één download: de websitegegevens, de geüploade bestanden en de code met de noodzakelijke serverinstellingen moeten afzonderlijk veiliggesteld worden.

## Welke onderdelen moet je bewaren?

### Websitegegevens

In de beheeromgeving kun je via **Backup downloaden** een JSON-bestand downloaden. Dat bestand bevat de opgeslagen gegevens van de website, zoals teksten, agenda, nieuws, contactinformatie en verwijzingen naar foto’s en documenten.

Bewaar de download buiten de website, bijvoorbeeld in een beveiligde cloudmap en op een tweede veilige locatie. Geef het bestand een herkenbare datum in de naam, zoals `scouts-site-data-2026-10-28.json`, zodat je later weet welke versie je terugzet.

Dit JSON-bestand bevat niet de eigenlijke foto’s en PDF’s. Het bewaart gegevens en verwijzingen, niet alle bestanden waarnaar die gegevens verwijzen.

### Foto’s en PDF’s

De bestanden die via de beheeromgeving zijn geüpload, staan op de hosting in de map `uploads/`. Daar kunnen foto’s, PDF’s, gegenereerde afbeeldingsvarianten en andere mediabestanden staan. De map `uploads/originals/` bevat private originelen en hoort bij een volledige mediaback-up.

Maak een afzonderlijke kopie van de volledige map `uploads/` en bewaar die buiten de hosting. De precieze stappen verschillen per hoster. Bij een hostingpaneel met een bestandsbeheerder, zoals Plesk, kan je de map doorgaans via de bestandsbeheerder downloaden of eerst als archief verpakken. Als je geen toegang hebt tot de bestanden, vraag dan aan de hostingbeheerder hoe een volledige kopie gemaakt en teruggezet kan worden. Controleer dat de kopie ook de submap `originals/` bevat.

Zonder deze kopie kunnen foto's of PDF’s ontbreken, zelfs wanneer je de JSON-gegevens wel kunt herstellen.

### Programmacode en serverinstellingen

De programmacode wordt bijgehouden in [GitHub](https://github.com/codebywout/scouts-Lille-Poederlee). GitHub is nuttig om codewijzigingen terug te vinden en een vorige versie van de code te herstellen, maar bevat niet automatisch de actuele gegevens of uploads van de live website.

Voor een volledige herstelling zijn ook de noodzakelijke serverinstellingen nodig. Afhankelijk van de installatie zijn dat bijvoorbeeld `.env`, `auth-config.php` en configuratiebestanden voor Google Drive. Die bestanden kunnen wachtwoordhashes, tokens of sleutels bevatten. Bewaar ze versleuteld of op een andere veilige manier en zet ze nooit in een publieke GitHub-repository of in gewone documentatie.

## Hoe maak je een bruikbare back-up?

Download regelmatig de JSON-back-up via de beheeromgeving. Zorg daarnaast voor een afzonderlijke back-up van de volledige map `uploads/` en voor een veilige kopie van de noodzakelijke serverconfiguratie. De programmacode kan je via GitHub terughalen, zolang je weet welke versie op de server stond en welke lokale wijzigingen nog niet waren gepubliceerd.

Bewaar de kopieën buiten de webhosting. Als de hosting zelf uitvalt of bestanden verloren gaan, helpt een back-up die alleen op diezelfde hosting staat mogelijk niet. Controleer af en toe of de back-upbestanden nog leesbaar zijn en of je weet waar ze staan. Een back-up is pas echt nuttig als je ze ook kunt terugzetten.

## Automatische back-up naar Google Drive

De website ondersteunt een optionele wekelijkse back-up van de gegevens naar een ingestelde Google Drive-map. Deze taak bewaart `site-data.json`; ze is **geen automatische back-up van de volledige map `uploads/`, de programmacode of de serverinstellingen**.

De functie werkt alleen als Google Drive op de server correct is ingesteld, de gebruikte Google-account of serviceaccount schrijfrechten heeft op de back-upmap en de cron-taak op de hosting is geconfigureerd. De cron-taak staat in het hostingpaneel en niet in de gewone websitebeheeromgeving.

De taak gebruikt per ISO-week een naam zoals `scouts-site-data-2026-W44.json`. Als de taak in dezelfde week opnieuw loopt, wordt het bestand van die week bijgewerkt; in een nieuwe week wordt een nieuw weekbestand gemaakt. De serverinstelling `SCOUTS_GOOGLE_DRIVE_BACKUP_FOLDER_ID` kan de standaardmap vervangen.

Voor technische configuratie kan de beheerder het script `tools/backup-site-data-to-drive.php` op de server uitvoeren of de beveiligde route `/api/cron/backup-drive` gebruiken. De taak vereist een sterk geheim `SCOUTS_CRON_SECRET` dat alleen in de serverconfiguratie staat. Gebruik bij voorkeur de CLI-methode of een POST-request met de secret in een header. Een secret in de URL kan in serverlogs terechtkomen en is daarom alleen een laatste redmiddel. De technische implementatie en foutdiagnose staan in de [technische handleiding](technische-handleiding.md).

Test de automatische back-up nadat je die instelt en controleer of het verwachte bestand in de juiste Drive-map verschijnt. Als de taak faalt, bevat de melding aan de aanroeper niet noodzakelijk de technische details; raadpleeg dan de serverlogs.

## Herstellen na gegevensverlies

Bepaal eerst wat ontbreekt. Als alleen tekst of andere websitegegevens verloren zijn, kan je de juiste JSON-back-up gebruiken. Herstellen via de beheeromgeving overschrijft de huidige opgeslagen gegevens, dus controleer de datum en inhoud van het back-upbestand vóór je bevestigt.

Als foto’s of PDF’s ontbreken, moet je de betreffende bestanden terugzetten vanuit de kopie van `uploads/`. Alleen de JSON-back-up terugzetten herstelt die bestanden niet.

Als code of serverinstellingen ontbreken, herstel dan de juiste codeversie uit GitHub en zet de noodzakelijke serverconfiguratie terug vanuit de veilige configuratiekopie. Bij een technische storing of twijfel over de juiste bestanden: wijzig niet willekeurig bestanden op de server. Maak eerst een kopie van de huidige toestand en vraag de hostingbeheerder om hulp.

Een volledige hersteltest hoort te controleren of de website opent, je kunt inloggen, opgeslagen tekst zichtbaar is en foto’s en PDF’s nog laden. Test herstel waar mogelijk in een aparte testomgeving, niet door de live website zomaar te overschrijven.
