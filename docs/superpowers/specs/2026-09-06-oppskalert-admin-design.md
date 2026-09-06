# Oppskalert Admin: én motor, ett seksjonsbibliotek

Dato: 2026-09-06
Status: til gjennomlesing

## 1. Problemet, målt

Undersøkelse av `~/Desktop/Antigravity/Nettsider` 2026-09-06:

| Måling | Verdi |
|---|---|
| Prosjektmapper | 55 |
| Har admin i det hele tatt | 10 |
| Har hele stacken (build + content + api/save) | 4 |
| Ulike `edit.js` i omløp | 5 (883 / 906 / 940 / 985 / 1195 linjer) |

Fem konkrete utslag:

1. **Alphaneg ligger 210 linjer foran malen.** Tre ting bare den har: serverside
   PIN-verifisering (`api/verify-pin.js`), aktivering med fem trykk på
   kredittlinja, og en chat-assistent. Ingen annen side har fått dem.
2. **Malen mangler PIN-verifisering.** PIN-en ligger i `sessionStorage` og
   sjekkes aldri mot server igjen, så en forfalsket verdi bygger editoren.
   Alphaneg tettet dette. Schei, koflaath, Melanie Dahl og begge
   Birgitta-versjonene har fortsatt hullet.
3. **Melanie Dahl (906 linjer) og koflaath (940) er frosset** på juli- og
   august-motoren.
4. **Admin-CSS er hardkodet til Schei sine farger.** 12 forekomster av
   `#da762b`, 12 av `#f4ecdd`, null CSS-variabler.
5. **Instrumentering er ettermontering.** Melanie Dahl: 134 `data-edit` og 33
   lister på 8 sider, alt satt inn etter at siden sto ferdig.

I tillegg: `rebuildMs` er hardkodet til 50 000 i malen, mens skillet selv
dokumenterer 200 s målt på et Nuxt-prosjekt med 286 ruter. Tekst og bilder
commit-es hver for seg, så ett bildebytte pluss én tekstendring gir to
Vercel-bygg.

**Rotårsak:** motoren distribueres ved kopiering. En kopi kan ikke oppdateres,
bare forkes. De fem utslagene over er symptomer på den ene tingen.

## 2. Mål

- Én motor, én kilde, versjonert. En rettelse skal nå alle sider som oppgraderer.
- Nye sider får admin uten ekstra arbeid, fordi seksjonene er instrumentert fra før.
- Admin-baren arver sidens farger uten håndretting.
- Byggeregler håndheves av en kommando, ikke av hukommelse.

## 3. Ikke-mål

- **De 45 sidene uten admin etterinstalleres ikke.** Bestemt 2026-09-06.
- **De 4 sidene som allerede har full stack løftes ikke i denne spec-en.**
  Konsekvens verdt å vite: Melanie Dahl og koflaath beholder PIN-hullet fra
  punkt 1.2 til de eventuelt løftes. Egen avgjørelse, egen spec.
- Nuxt-formen (Birgitta v3 og v4) dekkes ikke. Egen runde.
- Chat-assistenten portes, men står av som standard. Bestemt 2026-09-06.
- Ingen felles dashbord på tvers av kunder. Panelet er per side, som i dag.

## 4. Arkitektur

### 4.1 Pakken

Nytt repo `oppskalert-admin`, **offentlig** på GitHub under en av egne kontoer
(`lobitomaldito` er den som er innlogget i `gh` nå; `mackeesy` er like gyldig).

Begrunnelsen for at det skal være offentlig:

- Det finnes ingen npm-konto på denne maskinen, så npm-registeret er utelukket.
- Et **privat** repo som avhengighet krever en personlig tilgangsnøkkel limt inn
  i `package.json` i hver eneste kunderepo. Det er en hemmelighet i klartekst,
  committet, replikert per kunde, og uaktuelt.
- Et **offentlig** repo installeres av Vercel uten noen form for auth.

Motoren inneholder ingen kundedata og ingen hemmeligheter. PIN, GitHub-token og
repo-navn er miljøvariabler i den enkelte kundesiden.

Fallback hvis repoet likevel skal være lukket: `oppskalert-admin init --vendor`
kopierer motoren inn i prosjektet og legger igjen en `.admin-version`-fil.
`doctor` leser versjonen derfra i stedet, og varsler når en nyere finnes. Det er
fortsatt kopier, men kopier som vet hva de er.

### 4.2 Innhold i pakken

```
oppskalert-admin/
  package.json
  bin/oppskalert-admin.mjs       CLI: init, doctor, tid
  build/
    index.mjs                    build(config)
    bake.mjs                     data-edit, data-edit-image, fokuspunkt
    mirror.mjs                   data-content-src
  editor/
    edit.js                      nettleser-motoren
    edit.css                     kun CSS-variabler, ingen hex
  api/
    save.js                      innhold, via _git.mjs
    save-image.js                bilde, via _git.mjs
    verify-pin.js
    _rateLimit.mjs
    _git.mjs                     Git Trees API, ett commit
  seksjoner/<navn>/
    seksjon.html                 markup med instrumentering
    seksjon.css                  kun struktur, all hud via var()
    seksjon.json                 innholdsform og standardverdier
  doctor/regler/*.mjs            én fil per regel
```

### 4.3 Hvordan en kundeside ser ut

```
kundeside/
  package.json          "oppskalert-admin": "git+https://github.com/<konto>/oppskalert-admin.git#v1.0.0"
  admin.config.mjs      repo, branch, rebuildMs, hvilke seksjoner som brukes
  build.mjs             tre linjer: import { build }, build(config)
  api/save.js           export { default } from 'oppskalert-admin/api/save.js'
  api/save-image.js     samme form
  api/verify-pin.js     samme form
  templates/*.html      komponert av seksjoner
  content/*.json        det klienten redigerer
  static/css/tokens.css sidens tokens, inkludert --adm-*
  static/css/site.css   sidens eget uttrykk
```

`api/`-filene må ligge som ekte filer i prosjektet fordi Vercel ruter på
filsti. Ett re-eksport-uttrykk holder: Node File Trace følger importen inn i
`node_modules` og tar med det som trengs. Forutsetter `node_modules` på rotnivå,
som er tilfellet her.

Versjonen pinnes per side. En kundeside oppgraderes når du velger det, ikke når
motoren endres. Det er hele poenget med å slutte å kopiere.

### 4.4 Seksjonskontrakten

Hver seksjon er tre filer med én jobb hver, slik at de kan leses, testes og
byttes hver for seg.

**`seksjon.html`** bærer instrumenteringen. `data-edit`, `data-edit-image`,
`data-editable-list` er allerede på plass. Ingen inline `style`. Ingen
hardkodede farger eller fontstørrelser.

**`seksjon.css`** inneholder **kun struktur**: `display`, `grid-template`,
`flex`, `gap`, `aspect-ratio`, `object-fit`. All hud (font, farge, størrelse,
ramme, skygge) leses fra `var(--…)` som siden definerer.

Skillet er ikke pyntearbeid. Det følger direkte av gotcha 1 i det eksisterende
skillet: avstand mellom kort må komme fra en flex-wrapper med `gap`, ikke fra
`margin-bottom` på hvert kort, ellers får kortet klienten legger til feil
mellomrom. Når strukturen er felles og huden er sidens egen, oppstår ikke det
problemet på nytt per side.

**`seksjon.json`** beskriver innholdsformen: hvilke nøkler seksjonen har,
hvilke som er lister, hvilke som er bilder, og hva standardverdien er. `doctor`
validerer `content/*.json` mot denne. `init` bruker den til å skrive et
startinnhold slik at en fersk side aldri viser tomme felter.

### 4.5 De 13 seksjonene

Utledet fra `data-edit`-nøklene i de fire instrumenterte sidene, ikke gjettet.
Tallet i parentes er målt bruk.

| Seksjon | Målt |
|---|---|
| `hero` | 54 nøkler |
| `dor-hero` (bilde bak overlay inne i `<a>`) | 8 |
| `tidslinje` (cv, erfaring, utdanning) | 41 |
| `jus-side` (personvern, vilkår) | 25 |
| `kontakt` | 21 |
| `lead-capture` | 18 |
| `tjenesteliste` (tjenester, kurs, pakker, pris) | 14 |
| `om` (portrett og tekst) | 10 |
| `kortliste` (generisk) | 8 lister |
| `omtaler` (omtaler, presse, testimonials) | 7 |
| `prosess` (nummererte steg) | 7 |
| `galleri` | 4 lister |
| `faq` | ny, men opplagt for målgruppa |

### 4.6 Tokens

`edit.css` bytter sine 32 hardkodede hex-forekomster (7 unike verdier) mot
fem variabler: `--adm-aksent`, `--adm-flate`, `--adm-tekst`, `--adm-fare`,
`--adm-ok`. Hover-varianter avledes med `color-mix`. Hver har en nøytral
grå fallback i `var()`-uttrykket, så en side som glemmer å sette dem får en
brukbar admin-bar i stedet for en usynlig.

Seksjonene leser sidens egne tokens (`--font-display`, `--font-brod`,
`--farge-tekst`, `--rom-seksjon` og så videre). Navnene fastsettes i
implementeringsplanen, avledet fra tokens som allerede brukes i eksisterende
sider.

## 5. Dataflyt

Uendret der den virker i dag, med én rettelse.

1. Klienten logger inn (fem trykk på kredittlinja, `?edit`, eller lenka i bunnen).
2. `POST /api/verify-pin` bekrefter PIN-en **før** editoren bygges. Ingenting
   rendres for en uverifisert PIN.
3. Klienten redigerer. Endringer autolagres i `localStorage` etter 1,2 s.
4. «Publiser» sender tekst og eventuelle nye bilder til `/api/save`.
5. **Rettelse: ett commit.** `_git.mjs` bruker Git Trees API og legger
   `content/<side>.json` og alle nye bilder i samme tre, samme commit. I dag
   går bilde og tekst gjennom Contents API hver for seg, som gir to commits og
   to Vercel-bygg.
6. Vercel bygger. `build.mjs` baker innholdet inn i HTML.
7. Besøkende får ren statisk HTML. Ingen kall på lesestien.

## 6. `oppskalert-admin doctor`

Én kommando som kjøres før deploy. Hver regel er en egen fil under
`doctor/regler/` med en fixture, slik at regelsettet kan vokse uten at
kommandoen blir uleselig.

Startsettet:

| Regel | Fanger |
|---|---|
| `kjent-seksjon` | markup som ikke matcher noen seksjonskontrakt |
| `ingen-inline-margin` | `style="margin…"` på et `data-list-item` |
| `strong-og-b` | CSS som styler `strong` uten `b` (gotcha 2) |
| `admin-tokens` | manglende `--adm-*` i sidens `:root` |
| `ingen-google-fonts` | `fonts.googleapis.com` eller `fonts.gstatic.com` |
| `malt-byggetid` | `rebuildMs` som fortsatt står på standardverdien |
| `innhold-mot-kontrakt` | nøkler i `content/*.json` som ingen seksjon har |
| `tankestrek` | `—` i `content/*.json` og i templates |
| `ikke-x-men-y` | mønsteret fra CLAUDE.md, flagget til gjennomlesing |

De to siste er tekstsjekker, ikke byggefeil. De rapporterer kandidater og
stopper ikke deploy.

`oppskalert-admin tid` kjører ett ekte publiseringsløp mot prosjektets egen
Vercel-oppsett, måler tiden fra push til endringen er ute, og skriver verdien
inn i `admin.config.mjs`. Det fjerner den hardkodede 50 s.

## 7. Sikkerhet

- PIN verifiseres serverside før editoren bygges (portert fra Alphaneg).
- `_rateLimit.mjs` beholdes: fem bom fra samme IP gir 15 minutters sperre, og
  manglende `ADMIN_PIN` feiler lukket.
- **Kjent begrensning, dokumenteres:** rate-limiteren er i minnet per
  funksjonsinstans og nullstilles ved kald start. For én admin per side er det
  akseptabelt. Det skal stå i README, ikke oppdages senere.
- Skjulte listeelementer og tomme bildefelter ligger i HTML-en med
  `display:none`. Greit for uferdig innhold, aldri for noe som skal være hemmelig.
- Motorrepoet er offentlig og skal aldri inneholde kundedata, PIN-er eller tokens.

## 8. Feilhåndtering

- Feil PIN ved publisering: prompt for ny PIN uten å laste siden på nytt, så
  ulagrede endringer overlever (finnes i Alphaneg i dag).
- Svar som ikke er JSON (404 fra feilrutet `/api`, 502-side): leses som tekst
  først og vises som en setning, ikke som en rå `SyntaxError`. Finnes i Alphaneg.
- GitHub svarer med annet enn 2xx: feilkoden vises til klienten, og innholdet
  blir liggende i `localStorage` så ingenting går tapt.
- Angre (`↶`) erstatter `innerHTML` i redigeringsområdet og fyrer
  `adm:restored`. All side-JS bundet inne i `<main>` må lytte på den og være
  idempotent, med `WeakSet` og ikke markørklasse. Dette er gotcha 8 i dagens
  skill og flyttes inn i seksjonskontrakten som et krav, slik at hver seksjon
  som binder JS testes mot det.

## 9. Testing

Motoren har ingen tester i dag. Den får det.

- **`build/bake.mjs`:** gyldne filer. Template pluss innhold gir forventet HTML.
  Dekker `data-edit`, bilder, fokuspunkt, speiling, skjulte elementer.
- **`doctor/regler/*`:** én fixture per regel, både et treff og et rent tilfelle.
- **Seksjonene:** hver seksjon bygges med sin egen `seksjon.json` og sjekkes
  mot kontrakten, så en seksjon aldri kan påstå en nøkkel den ikke bruker.
- **Røyktest:** start `dev-server.mjs`, `POST /api/save`, bekreft at den
  gjenbygde HTML-en inneholder det nye innholdet.

## 10. Rekkefølge

| Trinn | Innhold | Anslag |
|---|---|---|
| 1 | Repo, pakkeform, motor portert fra Alphaneg, CSS-variabler, `_git.mjs` med ett commit | 1 dag |
| 2 | 13 seksjoner med struktur-CSS og innholdsform | 2 dager |
| 3 | `doctor` med startsettet av regler, og `tid` | en halv dag |
| 4 | Tester og README | en halv dag |

Til sammen ca. fire dager. Anslagene forutsetter at motoren portes som den er
fra Alphaneg og ikke skrives om.

Første kundeside bygget på pakken blir prøven. Går den gjennom uten
håndredigering av motorfiler, virker modellen.

## 11. Åpne avgjørelser

1. **Konto for motorrepoet:** `lobitomaldito` (innlogget i `gh` nå) eller
   `mackeesy`. Begge er egne kontoer.
2. **Offentlig repo bekreftes.** Anbefalt og teknisk nødvendig for at Vercel
   skal installere uten en committet nøkkel. Alternativet er `--vendor`.
3. **Token-navn** for seksjonene fastsettes i implementeringsplanen, avledet fra
   det eksisterende sidene allerede bruker.
