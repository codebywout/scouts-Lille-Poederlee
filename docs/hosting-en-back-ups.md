# Online zetten en backups

Startpagina: [README.md](../README.md).

## Wat betekenen hosting en domeinnaam?

- **Hosting** = de plek op het internet waar de websitebestanden bewaard worden.  
- **Domeinnaam** = het adres dat mensen intypen, zoals `jouwgroep.be`.

Zonder hosting is de site niet bereikbaar voor bezoekers buiten je eigen computer.

## Website online zetten (eenvoudig)

1. Kies een hoster die PHP-websites aankan. (Welke hoster jullie kiezen, staat niet in deze handleiding.)
2. Regel een domeinnaam.
3. Zet de websitebestanden op de hosting. De eerste keer vraag je best hulp aan de hoster of iemand met ervaring.
4. Laat een beheerlogin instellen. Bewaar gebruikersnaam en wachtwoord veilig.
5. Test:
   - Opent de homepage?
   - Lukt `/login`?
   - Kun je één tekst opslaan?
   - Kun je één foto uploaden?
6. Vul daarna jullie echte inhoud in via de beheeromgeving.

Concrete serverinstellingen (mapnamen, paneelklikken) verschillen per hoster. Vul die in bij [overdracht.md](overdracht.md) als je ze kent.

## Backups — zodat je niets kwijtraakt

Maak onderscheid:

1. **Teksten en gegevens** (agenda, nieuws, contact, …)  
   → In de beheeromgeving: **Backup downloaden**. Bewaar dat bestand veilig.  
   → Optioneel: **wekelijks automatisch** naar Google Drive (zie hieronder).
2. **Foto’s en PDF’s**  
   → Die staan op de hosting. Vraag na hoe jullie die ook kunnen downloaden of laten backuppen.
3. **De programmacode van de website**  
   → Vaak apart bewaard (bijvoorbeeld op GitHub). Dat is geen volledige backup van al jullie foto’s.

**Belangrijk:** een kopie van alleen de programmacode bevat niet automatisch alle recente foto’s en brieven.

## Wekelijkse backup naar Google Drive

De site kan elke week `site-data.json` uploaden naar Drive-map  
`1d494gLWlxCcxmUN7b9TdPer1IbliEp_6` (of een andere map via `SCOUTS_GOOGLE_DRIVE_BACKUP_FOLDER_ID`).

Bestandsnaam per ISO-week, bv. `scouts-site-data-2026-W44.json`. Dezelfde week opnieuw draaien overschrijft dat bestand; een nieuwe week maakt een nieuw bestand.

**Voorwaarden**

1. Google Drive is verbonden in **Instellingen** (zelfde account als maandplanningen).
2. Dat Google-account mag schrijven in de backup-map.
3. Op de server een lange geheime sleutel (min. 16 tekens), op één van deze manieren:
   - bestand `.env` in de projectmap (vaak verborgen omdat de naam met een punt begint), regel `SCOUTS_CRON_SECRET=...`
   - of in `auth-config.php` (vaak één map **boven** de website, of naast `config.php`):  
     `define('SCOUTS_CRON_SECRET', 'jouw-lange-geheime-sleutel');`

**.env zie je niet?** Dat is normaal: het staat niet in Git en is op de server soms verborgen. Gebruik dan `auth-config.php` — dezelfde plek waar ook de admin-login staat.

**Cron hoort niet in de website-admin**, maar in het **hostingcontrolepaneel** (Combell, Superhosting, Hostinger, …): zoek naar “Cronjobs”, “Geplande taken” of “Scheduled tasks”.

**Voorkeur 1 — CLI op de server** (geen secret in URL/logs):

```text
php /pad/naar/scouts/tools/backup-site-data-to-drive.php
```

**Voorkeur 2 — HTTP POST met header** (bv. cron die `curl` kan draaien):

```text
curl -fsS -X POST -H "X-Scouts-Cron-Secret: JOUW-GEHEIME-SLEUTEL" https://JOUWDOMEIN.be/api/cron/backup-drive
```

**Laatste redmiddel — URL ophalen** (sommige hosters kunnen alleen een GET-URL):

```text
https://JOUWDOMEIN.be/api/cron/backup-drive?token=JOUW-GEHEIME-SLEUTEL
```

Let op: een token in de URL kan in serverlogs of monitoring terechtkomen. Gebruik dit alleen als header/CLI niet kan.

Bij een mislukte backup krijgt de aanroeper alleen een algemene foutmelding; details staan in de serverlog.

Test één keer handmatig na deploy; controleer daarna of het JSON-bestand in de Drive-map staat.

## Als iets misging na een upload naar de server

1. Stop met verder bestanden uploaden.
2. Vraag hulp aan wie de hosting beheert.
3. Zet zo nodig de vorige werkende websitebestanden terug — **zonder** per ongeluk jullie foto’s te wissen.
4. Teksten herstellen kan soms met een eerdere backup uit de beheeromgeving. Doe dat alleen als je zeker weet dat het de juiste backup is.

## Wat nog openstaat

Noteer bij jullie groep (zie ook [overdracht.md](overdracht.md)):

- Naam van de hoster  
- Wie betaalt en wie mag inloggen  
- Waar backups bewaard worden  
- Hoe vaak iemand een backup downloadt  
