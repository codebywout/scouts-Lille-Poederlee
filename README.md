# Scouts Lille-Poederlee

Website en beheeromgeving voor Scouts Lille-Poederlee. De website bevat informatie over de verschillende takken, activiteiten, inschrijvingen, uniformen, tweedehandsmateriaal en contactgegevens.

## Overzicht

De applicatie bestaat uit:

- een publieke website met HTML-, CSS- en JavaScript-pagina's;
- een beveiligde adminomgeving voor het beheren van site-inhoud;
- een PHP API voor authenticatie, sitegegevens en bestandsuploads;
- een JSON-datastore voor de bewerkbare inhoud;
- lokale opslag van afbeeldingen en documenten in `uploads/`;
- optionele integratie met Google Drive voor maandplanningen.

De huidige versie draait volledig op PHP en gebruikt geen Node.js-dependencies of externe package manager.

## Vereisten

- PHP 8.1 of nieuwer;
- PHP-extensies `session` en `json`;
- `fileinfo` voor extra uploadvalidatie;
- `GD` voor het converteren van afbeeldingen naar JPG;
- schrijfpermissies voor `data/` en `uploads/`.

`fileinfo` en `GD` zijn aanbevolen. De API kan zonder deze optionele extensies werken met de beschikbare validatie- en opslagmogelijkheden.

## Lokaal starten

1. Maak een lokale `.env` aan met de adminconfiguratie:

   ```text
   SCOUTS_ADMIN_USERNAME=admin
   SCOUTS_ADMIN_PASSWORD_HASH=<gegenereerde-password-hash>
   ```

2. Genereer een password-hash met PHP:

   ```powershell
   php -r "echo password_hash('KIES-EEN-WACHTWOORD', PASSWORD_DEFAULT), PHP_EOL;"
   ```

3. Start de ingebouwde PHP-server vanuit de projectmap:

   ```powershell
   php -d upload_max_filesize=20M -d post_max_size=21M -S localhost:8000 router.php
   ```

4. Open de website op <http://localhost:8000> en de adminlogin op <http://localhost:8000/login>.

Gebruik nooit een plaintext wachtwoord in Git of in productie. `.env` en gevoelige configuratiebestanden worden door `.gitignore` uitgesloten.

## Belangrijke mappen en bestanden

```text
api/                    PHP API-routes
assets/css/             Stylesheets
assets/js/              Frontendlogica
assets/images/          Afbeeldingen en branding
data/                   Sitegegevens en standaarddata
pages/                  Publieke subpagina's
uploads/                Geüploade afbeeldingen en documenten
admin.html              Admininterface
admin-gate.php          Adminsessiecontrole
config.php              Algemene PHP-configuratie
router.php              Lokale PHP-router
.htaccess               Apache-beveiliging en API-routing
```

## API

De belangrijkste routes zijn:

- `GET /api/session` - controleert de huidige sessie;
- `POST /api/login` - meldt een beheerder aan;
- `POST /api/logout` - beëindigt de sessie;
- `GET /api/site-data` - leest de sitegegevens;
- `POST /api/site-data` - slaat sitegegevens op;
- `POST /api/site-data/reset` - herstelt de standaardgegevens;
- `POST /api/uploads/photo` - uploadt een afbeelding;
- `DELETE /api/uploads/photo/{filename}` - verwijdert een afbeelding.

Muterende routes vereisen een geldige adminsessie en origincontrole.

## Productie

Voor productie kan de PHP-applicatie worden uitgerold naar een Apache/Plesk-hostingomgeving. Zorg daarbij voor:

- PHP 8.1 of nieuwer;
- HTTPS;
- een uniek adminwachtwoord;
- correcte schrijfpermissies voor `data/` en `uploads/`;
- bescherming van `.env`, adminconfiguratie en server-side data;
- `AllowOverride` wanneer `.htaccess` wordt gebruikt.

`router.php` is bedoeld voor lokaal gebruik. Op Apache verzorgt `.htaccess` de routing naar de PHP API.

## Veiligheid

Commit nooit wachtwoorden, API-sleutels, Google-service-accountbestanden, OAuth-tokens of andere productiegeheimen. Controleer uploads en toegangsrechten bij iedere deployment.

## Licentie

Voeg hier de gewenste projectlicentie toe wanneer deze repository publiek wordt gepubliceerd.
