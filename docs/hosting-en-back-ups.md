# Online zetten en backups

## Hosting en domein

Je hebt **hosting** (PHP) en een **domeinnaam** nodig. Zet de websitebestanden op de hosting, stel de beheerlogin in, test homepage + `/login` + één tekstwijziging + één upload. Exacte paneelstappen verschillen per hoster.

Bewaar logingegevens veilig (niet in open chat).

## Wat moet je backuppen?

| Onderdeel | Waar | Opmerking |
| --- | --- | --- |
| Teksten/gegevens | Beheer → **Backup downloaden** (JSON) | Bevat geen foto’s/PDF’s |
| Foto’s en PDF’s | Map `uploads/` op de hosting | Apart regelen bij de hoster of handmatig |
| Programmacode | Vaak GitHub | Geen volledige inhoudsbackup |

Alleen de code kopiëren dekt **niet** recente uploads.

## Wekelijkse backup naar Google Drive

Upload van `site-data.json` naar de geconfigureerde backup-map (standaard `1d494gLWlxCcxmUN7b9TdPer1IbliEp_6`, of `SCOUTS_GOOGLE_DRIVE_BACKUP_FOLDER_ID` / Instellingen → Map-ID backups).

Bestandsnaam per ISO-week, bv. `scouts-site-data-2026-W44.json`. Zelfde week opnieuw → overschrijven; nieuwe week → nieuw bestand.

**Nodig:** Drive verbonden in Instellingen; schrijfrechten op de backup-map; secret `SCOUTS_CRON_SECRET` (≥ 16 tekens) in `.env` of `auth-config.php` (`define('SCOUTS_CRON_SECRET', '…');`).

Cron staat in het **hostingpaneel**, niet in de website-admin.

1. **Voorkeur — CLI:** `php /pad/naar/scouts/tools/backup-site-data-to-drive.php`  
2. **POST + header:**  
   `curl -fsS -X POST -H "X-Scouts-Cron-Secret: …" https://JOUWDOMEIN.be/api/cron/backup-drive`  
3. **Laatste redmiddel — URL ophalen:**  
   `https://JOUWDOMEIN.be/api/cron/backup-drive?token=…`  
   (token kan in logs belanden)

Bij fout krijgt de aanroeper een algemene melding; details staan in de serverlog. Test één keer na deploy.

## Als een server-upload misgaat

1. Stop verdere uploads.  
2. Vraag hulp aan wie de hosting beheert.  
3. Zet vorige bestanden terug **zonder** per ongeluk `uploads/` te wissen.  
4. Teksten herstellen kan met een JSON-backup uit de beheeromgeving — alleen met het juiste bestand.
