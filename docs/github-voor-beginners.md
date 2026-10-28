# GitHub uitgelegd

Je hebt GitHub niet nodig om de gewone inhoud van de scoutswebsite te beheren. Teksten, agenda, nieuws, leiding, foto’s en PDF’s wijzig je via de beheeromgeving op de live website, na het inloggen via `/login`.

GitHub is de plaats waar de programmacode wordt bijgehouden. Die code bepaalt onder andere hoe de website eruitziet, hoe pagina’s werken en hoe de beheeromgeving gegevens opslaat. Een wijziging op GitHub verschijnt niet automatisch op de live website: iemand moet de aangepaste code eerst controleren en daarna op de hosting plaatsen.

De live website bewaart ook gegevens die niet in GitHub staan. De actuele website-inhoud staat op de server in `data/site-data.json`; geüploade foto’s en PDF’s staan in `uploads/`. Deze bestanden worden bewust niet gewoon meegecommit naar GitHub, omdat ze actuele groepsgegevens of productiemedia kunnen bevatten.

Daarom is GitHub op zichzelf geen volledige back-up. Voor herstel heb je naast de code ook een recente gegevensback-up, een kopie van de uploads en de nodige serverinstellingen nodig. Lees [Back-ups en hosting](hosting-en-back-ups.md) voor uitleg over die onderdelen.

De [repository van Scouts Lille-Poederlee](https://github.com/codebywout/scouts-Lille-Poederlee) bevat de code en de technische documentatie. Wijzig bestanden daar alleen als je weet welke code je aanpast. Zet nooit wachtwoorden, toegangstokens, privégegevens of echte serverconfiguratie in een publieke repository.

Wie code wil aanpassen, lokaal testen of de hosting wil bijwerken, vindt de technische stappen in de [technische handleiding](technische-handleiding.md).
