# Lokaal testen

## Server starten

Open PowerShell in `C:\Users\woutp\Desktop\scouts` en voer uit:

```text
C:\php\php.exe -d upload_max_filesize=20M -d post_max_size=21M -S localhost:8000 router.php
```

De lokale `.env` moet `SCOUTS_ADMIN_USERNAME` en een `SCOUTS_ADMIN_PASSWORD_HASH` bevatten. De meegeleverde genegeerde ontwikkelconfiguratie gebruikt `admin` en het wachtwoord `scouts2025`. Maak voor eigen gebruik een nieuwe hash:

```text
C:\php\php.exe -r "echo password_hash('KIES-EEN-WACHTWOORD', PASSWORD_DEFAULT), PHP_EOL;"
```

Gebruik nooit een plaintext wachtwoord in Git of in productie.

## Website

- Homepage: <http://localhost:8000>
- Login: <http://localhost:8000/login>

## API testen

Voer deze voorbeelden uit in PowerShell terwijl de server draait:

```powershell
Invoke-WebRequest http://localhost:8000/api/session | Select-Object StatusCode, Content
Invoke-WebRequest http://localhost:8000/api/site-data | Select-Object StatusCode, Content
```

Login en bewaar de sessiecookie met curl:

```text
curl.exe -c cookies.txt -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"scouts2025\"}" http://localhost:8000/api/login
curl.exe -b cookies.txt http://localhost:8000/api/session
```

Test daarna opslaan en resetten met een geldige JSON-body. Gebruik voor uploaden een echte afbeelding:

```text
curl.exe -b cookies.txt -H "Content-Type: application/json" --data-binary "@data/site-data.json" -X POST http://localhost:8000/api/site-data
curl.exe -b cookies.txt -X POST http://localhost:8000/api/site-data/reset
curl.exe -b cookies.txt -F "photo=@pad\naar\foto.jpg" -F "filename=over-ons" http://localhost:8000/api/uploads/photo
curl.exe -b cookies.txt -X DELETE http://localhost:8000/api/uploads/photo/over-ons
curl.exe -b cookies.txt -X POST http://localhost:8000/api/logout
```

Controleer dat mutaties zonder cookie HTTP `401` geven, dat `/data/site-data.json` niet opent en dat een ongeldige upload JSON met een foutstatus teruggeeft.