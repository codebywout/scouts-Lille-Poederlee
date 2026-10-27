# Handleiding voor scoutsleiding — website beheren

Deze handleiding is voor leiding die de **inhoud** van [scoutslille.be](https://scoutslille.be) bijwerkt. Je hebt geen programmeerkennis nodig.

Technische termen (kort):

- **Beheeromgeving / admin** — pagina’s achter login waar je inhoud wijzigt.
- **Publieke website** — wat bezoekers zien zonder inloggen.
- **Opslaan** — je wijziging naar de live server sturen.

Alles hieronder is gebaseerd op de code in deze repository (`admin.html`, `assets/js/admin.js`). Handelingen die we niet live hebben kunnen uitproberen, staan als **te controleren**.

---

## 1. Inloggen

1. Open op de live website het pad **/login** (bijvoorbeeld `https://scoutslille.be/login`).
2. Vul gebruikersnaam en wachtwoord in van het **beheeraccount**.
3. Na een geslaagde login kom je in de beheeromgeving (`/admin`).

**Wachtwoorden staan niet in deze repository.** Die krijg je bij de overdracht (zie [overdracht.md](overdracht.md)).

Lukt inloggen niet?

- Controleer hoofdletters en spaties.
- Probeer niet tientallen keren opnieuw (er kan een beveiligingslimiet zijn).
- Vraag de persoon die hosting/login beheert om hulp — zie overdrachtchecklist.

---

## 2. De beheeromgeving in één oogopslag

Bovenaan kies je een onderdeel:

**Site**

| Knop | Wat je daar beheert |
| --- | --- |
| Home | Planning/agenda, veelgestelde vragen (FAQ), contact (e-mail, adres) |
| Nieuws | Nieuwsberichten |
| Over ons | Introtekst + groepsleiding |
| Inschrijven | Lidgeld en rekeningnummer |
| Foto’s | Foto’s die op takpagina’s / Over ons getoond worden |
| Achtergronden | Achtergrondfoto’s van pagina’s |
| Tweedehands | Tweedehands-aanbod |

**Takken** — Kapoenen, Welpen, Jongverkenners, Verkenners, Jins:

- Takleiding (namen, telefoon, wie takleider is)
- Maandplanning (PDF)
- Brieven (PDF)

Verder:

- Knop **Instellingen** (tandwiel) — Google Drive (optioneel), backup/herstel van sitegegevens, zoeken naar ongebruikte uploads. Sommige onderdelen vragen een extra wachtwoord (**te controleren** op jullie live site).
- **Backup downloaden** — link om gegevens te downloaden (**te controleren** of dit hetzelfde is als Instellingen → Backup).
- **Bekijk live** — opent de bijbehorende publieke pagina.
- **Opslaan** — publiceert je wijzigingen.

---

## 3. Teksten en contactgegevens

### Contact (e-mail en adres)

1. Kies **Home**.
2. Scroll naar **Contact**.
3. Pas e-mail en/of adres aan.
4. Klik **Opslaan**.
5. Controleer de footer/contactzone op de publieke homepage.

### Over ons — introtekst

1. Kies **Over ons**.
2. Pas het veld **Tekst** aan.
3. Opslaan → controleer `/over-ons`.

### Inschrijven — lidgeld en rekeningnummer

1. Kies **Inschrijven**.
2. Vul **Lidgeld (€)** en **Rekeningnummer** in.
3. Opslaan → controleer `/inschrijven`.

> Let op: het rekeningnummer is gevoelige informatie. Zet geen extra privégegevens in vrije tekstvelden.

---

## 4. Agenda, nieuws en FAQ

### Agenda (planning op de homepage)

1. Kies **Home** → sectie **Planning**.
2. **+ Activiteit** voor een nieuw item, of bewerk een bestaand item.
3. Vul dag/maand (start en eventueel einde), titel, tekst, optioneel link en foto in.
4. Opslaan → controleer de homepage.

### FAQ

1. Home → **Veelgestelde vragen**.
2. **+ Vraag** of bestaand item bewerken.
3. Opslaan.

### Nieuws

1. Kies **Nieuws**.
2. Voeg berichten toe of pas ze aan via de editor in die sectie.
3. Opslaan → controleer `/nieuws`.

> Concepten/publicatiestatus: in de technische docs staat dat concepten admin-only kunnen blijven. **Te controleren** op live: of elk nieuwsitem meteen zichtbaar is voor bezoekers na opslaan.

---

## 5. Leiding en takinformatie

### Groepsleiding

1. **Over ons** → **Groepsleiding**.
2. **+ Groepsleider** of bestaande rij aanpassen (naam, telefoon).
3. Opslaan → controleer Over ons.

### Takleiding

1. Kies de **tak** (bijv. Welpen).
2. Pas leiders aan; markeer desgevraagd wie takleider is (veld aanwezig in de data/UI).
3. Opslaan → controleer de takpagina.

---

## 6. Foto’s uploaden en beheren

1. Kies **Foto’s**.
2. Upload of vervang de foto voor de gewenste plek (tak / Over ons — labels in het scherm).
3. Bij een geslaagde upload kan de site de foto meteen plaatsen (bevestigd in de admin-code voor tak-/Over ons-foto’s).
4. Controleer de publieke pagina.

**Achtergronden:** sectie **Achtergronden**. Upload, bekijk voorbeeld, publiceer pas als je tevreden bent. Bij een mislukte upload blijft de oude achtergrond staan (zo geformuleerd in de admin-UI).

---

## 7. Brieven en maandplanningen

Open de betreffende **tak**.

### Maandplanning

1. Kies minstens één maand.
2. Kies een **PDF**.
3. Na upload/opslaan verschijnt de planning op de takpagina.
4. Verwijderen kan via de knop **Verwijderen** bij een bestaande planning.

### Brieven

1. Vul een **naam** voor de brief in.
2. Kies een **PDF**.
3. Na opslaan staat de brief bij die tak.
4. Verwijderen via **Verwijderen** bij de brief.

Bestanden worden via de API naar `uploads/` op de server gestuurd. Ze verdwijnen niet automatisch uit GitHub (staan daar meestal niet).

---

## 8. Wijzigingen controleren op de publieke website

Na elke belangrijke wijziging:

1. Klik **Bekijk live**, of open scoutslille.be in een nieuw tabblad.
2. Vernieuw de pagina (soms helpt een harde refresh: Ctrl+F5).
3. Controleer desktop én telefoon als het om layout/foto’s gaat.

Werkt iets in de admin wel, maar niet publiek? Noteer welk onderdeel en vraag technische hulp — mogelijk cache of een mislukte opslag.

---

## 9. Veelvoorkomende fouten

| Probleem | Wat je kunt proberen |
| --- | --- |
| Opslaan lukt niet | Ben je nog ingelogd? Opnieuw inloggen en opnieuw proberen. |
| Foto/PDF wordt geweigerd | Juist bestandstype? PDF voor brieven/planning; gangbare afbeeldingen voor foto’s. Bestand niet té groot (**exacte limiet te bevestigen** op hosting). |
| Oude foto blijft zichtbaar | Harde refresh; andere browser. Anders: technische cache/CDN-hulp. |
| Verkeerde tak bijgewerkt | Controleer of je de juiste tak-tegel had geselecteerd. |
| Login lukt niet | Zie §1; geen wachtwoorden in GitHub zoeken. |

---

## 10. Foutieve wijziging of verwijdering

1. **Niet panikeren** — stop met verdere willekeurige wijzigingen.
2. Kun je het zelf herstellen? Zet de tekst/leiding terug en sla opnieuw op.
3. Heb je een recente **JSON-backup** (Instellingen → Backup downloaden / herstellen)? Dan kun je die terugzetten — **alleen** als je weet dat het de juiste backup is. Herstellen overschrijft alle sitegegevens in die backup.
4. Ontbreekt een foto of PDF? Die zat in `uploads/` op de server. Herstel via hostingback-up of vraag technische hulp. GitHub heeft die bestanden meestal niet.
5. Documenteer wat er misging voor de volgende overdracht.

---

## Wat deze handleiding níet behandelt

- PHP/HTML/CSS wijzigen
- GitHub commits of pull requests → [github-voor-beginners.md](github-voor-beginners.md)
- Hostingaccounts en serverback-ups → [hosting-en-back-ups.md](hosting-en-back-ups.md)

Meer over welk type inhoud waar hoort: [website-beheren.md](website-beheren.md).
