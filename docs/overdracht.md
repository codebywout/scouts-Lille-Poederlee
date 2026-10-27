# Overdracht checklist — scoutswebsite

Gebruik dit document wanneer de groepsleiding of de technische verantwoordelijke wisselt.  
Het voorbeeld hieronder noemt soms Scouts Lille-Poederlee; vul overal **jullie** gegevens in.

**Vul geen wachtwoorden, tokens of privésleutels in dit bestand in.** Noteer alleen *wie* iets beheert en *waar* de geheimen veilig liggen (bijv. “wachtwoordkluis van de groepsleiding”).

Velden met `NOG IN TE VULLEN` moeten door de **huidige** beheerder worden ingevuld vóór of tijdens de overdracht.

---

## 1. Eigenaarschap en verantwoordelijken

| Rol | Naam / contact | Notities |
| --- | --- | --- |
| Eindverantwoordelijke website (groep) | `NOG IN TE VULLEN` | |
| Technisch contact (mag code/hosting) | `NOG IN TE VULLEN` | |
| Backup-contact bij uitval | `NOG IN TE VULLEN` | |
| Vorige verantwoordelijke (tot datum) | `NOG IN TE VULLEN` | |

---

## 2. GitHub

| Vraag | Antwoord |
| --- | --- |
| URL van **jullie** GitHub-repository | `NOG IN TE VULLEN` (voorbeeldproject: `https://github.com/codebywout/scouts-Lille-Poederlee`) |
| Wie wordt eigenaar / beheerder? | `NOG IN TE VULLEN` |
| Welke accounts krijgen schrijfrechten? | `NOG IN TE VULLEN` |
| Welke accounts van vertrekkende leiding worden verwijderd? | `NOG IN TE VULLEN` |
| Publiek of privé? | `NOG IN TE VULLEN` — let op: in gegevensbestanden kunnen persoonsgegevens staan; zie ook [technische-handleiding.md](technische-handleiding.md) |
| Wie mag naar `main` mergen? | `NOG IN TE VULLEN` |

**Veilige overdracht:** nodig GitHub-uitnodigingen over; deel geen personal access tokens in chat/e-mail zonder kluis.

---

## 3. Domeinnaam en hosting

| Onderdeel | Waarde |
| --- | --- |
| Domeinnaam | `NOG IN TE VULLEN` (voorbeeld in deze codebase: scoutslille.be) |
| Registrar (waar domein gekocht is) | `NOG IN TE VULLEN` |
| Hostingprovider / paneel (bijv. Plesk) | `NOG IN TE VULLEN` — in technische docs wordt Plesk als mogelijke context genoemd; **niet** als harde feit zonder bevestiging |
| Accountlogin hosting (gebruikersnaam alleen) | `NOG IN TE VULLEN` |
| Document root / pad op server | `NOG IN TE VULLEN` |
| Wie betaalt facturen / verlenging? | `NOG IN TE VULLEN` |
| SSL-certificaat (auto/handmatig) | `NOG IN TE VULLEN` |

---

## 4. Beheeromgeving (admin-login)

| Vraag | Antwoord |
| --- | --- |
| Wie mag inloggen op `/login`? | `NOG IN TE VULLEN` |
| Waar staat het wachtwoord veilig? (kluis, niet in Git) | `NOG IN TE VULLEN` |
| Wordt het wachtwoord bij overdracht **geroteerd** (nieuw wachtwoord)? | `NOG IN TE VULLEN` — aanbevolen: ja |
| Extra wachtwoord voor Google Drive-instellingen? | `NOG IN TE VULLEN` / niet van toepassing |

Login wordt op de server gezet via `.env` of `auth-config.php` (beide in `.gitignore`). **Nooit** de hash of het wachtwoord in GitHub zetten.

---

## 5. Externe diensten en integraties

Bevestigd of optioneel in de code:

| Dienst | Gebruikt? | Account / project-ID (geen secrets) | Wie beheert? |
| --- | --- | --- | --- |
| GitHub | Ja | repo hierboven | `NOG IN TE VULLEN` |
| Webhosting / DNS | Ja (live site) | `NOG IN TE VULLEN` | `NOG IN TE VULLEN` |
| Google Drive (optioneel in admin) | `NOG IN TE VULLEN` | `NOG IN TE VULLEN` | `NOG IN TE VULLEN` |
| Google Fonts (extern laden in HTML) | Ja (front-end) | n.v.t. | — |
| Facebook-pagina | Link in site-chrome | `NOG IN TE VULLEN` | `NOG IN TE VULLEN` |
| Instagram | Link in site-chrome | `NOG IN TE VULLEN` | `NOG IN TE VULLEN` |
| Groeps-e-mail (contact op site) | Adres staat in site-data / footer | `NOG IN TE VULLEN` | `NOG IN TE VULLEN` |

---

## 6. Wachtwoorden en herstelgegevens (veilig overdragen)

Checklist — **vink af, vul geen geheimen in**:

- [ ] Beheerwachtwoord website overgedragen via wachtwoordkluis / persoonlijk, niet via open chat
- [ ] Hostingwachtwoord overgedragen en bij voorkeur gewijzigd
- [ ] Domeinregistrar-wachtwoord overgedragen
- [ ] GitHub-toegang via uitnodiging, niet via gedeeld account-wachtwoord indien vermijdbaar
- [ ] Eventuele Google-service-account JSON of OAuth-bestanden: locatie op server + wie erbij kan (`NOG IN TE VULLEN`)
- [ ] Herstelcodes 2FA (GitHub/Google/hosting) overgedragen of opnieuw ingesteld
- [ ] Lijst “waar staan geheimen?” bijgewerkt: `NOG IN TE VULLEN` (bijv. kluisnaam)

---

## 7. Accounts overzetten

- [ ] Hostingaccount: eigenaar/e-mail aangepast naar nieuwe verantwoordelijke
- [ ] Domeinaccount: idem
- [ ] GitHub: nieuwe admins; oude verwijderd
- [ ] Google-account(s) voor Drive/Fonts-console indien van toepassing
- [ ] Socialmedia-accounts die in de footer gelinkt zijn
- [ ] Facturatie-e-mail hosting/domein

---

## 8. Controle dat alles werkt

Na overdracht samen doorlopen:

- [ ] Jullie live website laadt (homepage + één takpagina)
- [ ] Inloggen op `/login` met **nieuw** wachtwoord lukt
- [ ] Kleine testwijziging in admin → opslaan → zichtbaar op publieke site → wijziging terugzetten of laten
- [ ] Foto- of PDF-upload testen (klein bestand) — daarna opruimen indien testdata
- [ ] Backup downloaden (JSON) lukt
- [ ] Hostingpaneel login lukt voor nieuwe beheerder
- [ ] DNS/domeinpaneel login lukt
- [ ] GitHub: nieuwe beheerder kan de repo zien; CI-run bekijken op een PR indien van toepassing
- [ ] Vorige beheerder: toegang ingetrokken waar afgesproken

---

## 9. Jaarlijkse onderhoudstaken

| Taak | Frequentie | Wie | Laatst gedaan |
| --- | --- | --- | --- |
| Wachtwoorden rotatie (admin, hosting) | Jaarlijks / bij wissel | `NOG IN TE VULLEN` | `NOG IN TE VULLEN` |
| Controleren of SSL nog geldig is | Jaarlijks | `NOG IN TE VULLEN` | `NOG IN TE VULLEN` |
| Domein- en hostingverlenging | Volgens factuur | `NOG IN TE VULLEN` | `NOG IN TE VULLEN` |
| Back-up `site-data.json` + `uploads/` controleren | Minstens jaarlijks (vaker aangeraden) | `NOG IN TE VULLEN` | `NOG IN TE VULLEN` |
| Leiding/telefoons/agenda/nieuws actualiseren | Start werkjaar + bij wijzigingen | Leiding | |
| Privacy: telefoons/IBAN in publieke data herzien | Bij overdracht + jaarlijks | `NOG IN TE VULLEN` | |
| GitHub-toegang opruimen | Bij elke leidingwissel | `NOG IN TE VULLEN` | |

---

## 10. Website uitvalt — wat gebeurt er?

1. Check of het internet/DNS-breed is of alleen jullie site.
2. Contacteer: `NOG IN TE VULLEN` (technisch) en/of hosting support.
3. Geen paniek-uploads of wissen van `uploads/` / `data/`.
4. Volg [hosting-en-back-ups.md](hosting-en-back-ups.md) voor onderscheid code-rollback vs. dataherstel.
5. Communiceer naar ouders via jullie bestaande kanalen (niet via deze repo).

---

## 11. Periodiek bij te werken informatie

- Contact e-mail en adres (admin → Home)
- Groeps- en takleiding + telefoons
- Lidgeld / rekeningnummer
- Agenda, nieuws, FAQ
- Brieven en maandplanningen per tak
- Foto’s / achtergronden
- Deze overdrachtstabel zelf (namen en `NOG IN TE VULLEN`)

---

## Gerelateerde documenten

- [handleiding-scoutsleiding.md](handleiding-scoutsleiding.md)
- [hosting-en-back-ups.md](hosting-en-back-ups.md)
- [github-voor-beginners.md](github-voor-beginners.md)
- [technische-handleiding.md](technische-handleiding.md)
