# GitHub voor beginners

GitHub is een website waarop de **bestanden van dit project** (de code) en de handleidingen bewaard worden.  
Dat is **niet** hetzelfde als de werkende scoutswebsite die bezoekers openen.

Je hebt GitHub **niet** nodig om agenda, foto’s of brieven te beheren. Daarvoor gebruik je de [beheeromgeving](handleiding-scoutsleiding.md).

---

## Belangrijke woorden

| Term | Betekenis in gewone taal |
| --- | --- |
| **Repository (repo)** | De map met alle projectbestanden op GitHub, inclusief geschiedenis. |
| **Branch** | Een parallelle werklijn. `main` is meestal de stabiele hoofdtak. Andere branches zijn experimenten of features. |
| **Commit** | Een opgeslagen momentopname van wijzigingen, met een korte uitleg. |
| **Pull request (PR)** | Een voorstel: “bekijk mijn branch en zet die in `main` als het oké is.” |
| **CI / Actions** | Automatische controles die GitHub draait (syntax, tests). Groen ≈ controles geslaagd; rood ≈ iets faalde. |
| **Push** | Jouw commits naar GitHub sturen. |
| **Merge** | Een branch in een andere laten samenkomen (vaak PR → `main`). |

---

## Live website ≠ code op GitHub

| | Live website (hosting) | GitHub |
| --- | --- | --- |
| Wat bezoekers zien | Ja | Nee (tenzij je de bestanden leest) |
| Inhoud na “Opslaan” in beheer | Direct op de live site | **Niet** automatisch |
| Foto’s en PDF’s | Op de server | Meestal **niet** op GitHub |
| Programmacode van de site | Staat ook op de server | Wel op GitHub |
| Volledige back-up van alles? | Hangt van hostingback-ups af | **Nee** — geen garantie voor alle live foto’s en gegevens |

Wijzigingen in de beheeromgeving gaan **niet** vanzelf naar GitHub. Bestanden op GitHub gaan **niet** vanzelf naar de live website. In dit project controleren de automatische tests op GitHub alleen of bepaalde dingen kloppen; ze zetten de site **niet** online.

---

## Voorbeeldrepository

Een bestaande kopie van dit project staat o.a. hier:

[https://github.com/codebywout/scouts-Lille-Poederlee](https://github.com/codebywout/scouts-Lille-Poederlee)

Jouw groep kan een **eigen** kopie of repository gebruiken. Vraag na of die publiek of privé is. In tracked gegevensbestanden kunnen persoonsgegevens staan — bespreek met de technische verantwoordelijke wat veilig is.

---

## Wijzigingen bekijken (klikpad, bij benadering)

GitHub wijzigt soms knopnamen; je hebt ook de juiste rechten nodig.

1. Open de repository-URL hierboven.
2. **Code** → zie bestanden op de huidige branch (vaak `main`).
3. Bovenaan: branch-dropdown om een andere branch te kiezen.
4. Tab **Commits**: geschiedenis van opslagmomenten.
5. Open een bestand → **History** / schuldgeschiedenis om oude versies te zien.
6. Tab **Pull requests**: voorstellen die nog niet (of wel) gemerged zijn.
7. Bij een PR: tab **Files changed** om de diff te zien.
8. Tab **Actions**: resultaten van CI-controles.

Zonder inlog zie je bij een publieke repo vaak wel code; wijzigen vereist rechten.

---

## Geslaagde of mislukte controles herkennen

1. Ga naar **Actions** in de repo.
2. Klik de nieuwste run op jouw branch/PR.
3. Groen vinkje: jobs geslaagd.
4. Rood kruis: open de mislukte run en vraag een ontwikkelaar wat er fout ging.

Rode controles = niet gedachteloos naar `main` mergen. Vraag technische hulp.

---

## Een wijziging voorstellen zonder de live site te raken

Veilige gewoonte voor code (niet voor gewone inhoud):

1. Laat een ontwikkelaar een **nieuwe branch** maken (niet meteen op `main` werken).
2. Wijzigingen committen op die branch.
3. **Pull request** openen naar `main`.
4. Wachten tot CI groen is en iemand reviewt.
5. Pas na merge: bewust **apart** de bestanden op de hosting bijwerken (handmatig — zie technische handleiding). Dat is een tweede stap.

Zolang niemand de server bijwerkt, blijft jullie **live website** ongewijzigd door alleen activiteit op GitHub.

---

## Wat je níet zomaar mag doen

| Actie | Waarom niet |
| --- | --- |
| Bestanden op GitHub wissen “om op te ruimen” | Kan code of beveiligingsbestanden breken; lost live inhoud niet op |
| Rechtstreeks naar `main` pushen zonder review | Fouten komen sneller in de hoofdtak; CI/review worden overgeslagen |
| Serverbestanden overschrijven met een willekeurige Git-kopie | Risico: `uploads/` of verse `site-data.json` wissen/vervangen |
| Secrets (wachtwoorden, `.env`) in de repo zetten | Lekrisico, vooral bij publieke repo |
| Denken dat “revert op GitHub” alle foto’s terugbrengt | Code-rollback ≠ dataherstel |

---

## Wanneer een ontwikkelaar inschakelen?

- CI blijft rood
- Je wilt layout, menu, nieuwe pagina’s of login/serverconfig
- Iets met Git-conflicten, merge, of “detached” branches
- Verdachte bestanden of een mogelijke datalek
- Deploy naar hosting
- Repository privé maken / rechten herstructureren

Voor teksten en media: blijf bij de [beheeromgeving](handleiding-scoutsleiding.md).

---

## Verder lezen

- [overdracht.md](overdracht.md) — wie GitHub-admin wordt
- [hosting-en-back-ups.md](hosting-en-back-ups.md) — live server vs. Git
- [technische-handleiding.md](technische-handleiding.md) — branches, deploy, tests
