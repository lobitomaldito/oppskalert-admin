# oppskalert-admin

Motoren som gir en statisk nettside et redigeringspanel klienten kan bruke selv.
Klienten skriver rett på siden, trykker Publiser, og innholdet blir committet til
git. Vercel bygger, og besøkende får ren statisk HTML uten kall på lesestien.

Én pakke, versjonert. En rettelse her når alle sider som oppgraderer.

## Slik henger det sammen

```
templates/*.html  +  content/<side>.json   ->  build  ->  dist/*.html
```

Malene bærer instrumenteringen (`data-edit` og resten). `content/<side>.json` er
det klienten har skrevet. Byggesteget baker innholdet inn i malen og skriver
`dist/`. Editoren `dist/admin/edit.js` lastes bare for den som har oppgitt riktig
PIN, så en besøkende henter ingenting ekstra.

Publisering går til `POST /api/save`, som skriver `content/<side>.json` og
eventuelle nye bilder i ett commit via GitHub Git Trees API. Ett commit betyr
ett bygg, også når tekst og bilder endres i samme runde.

## Installering i et prosjekt

Krever Node 18 eller nyere.

```bash
npm i "github:lobitomaldito/oppskalert-admin#v1.0.0"
npx oppskalert-admin init .
```

`init` skriver fire filer og hopper over dem som finnes fra før:

| Fil | Innhold |
|---|---|
| `build.mjs` | tre linjer som kaller `build()` fra pakken |
| `api/save.js` | re-eksport av pakkens handler |
| `api/verify-pin.js` | re-eksport av pakkens handler |
| `static/css/tokens.css` | de fem `--adm-*`-fargene admin-baren arver |

`api/`-filene må ligge som ekte filer i prosjektet fordi Vercel ruter på filsti.
Ett re-eksport-uttrykk holder, Node File Trace følger importen inn i
`node_modules`.

Fjern `node-html-parser` fra prosjektets egne `dependencies` hvis den ligger der.
Pakken tar den med seg.

I `vercel.json`:

```json
{ "buildCommand": "node build.mjs", "outputDirectory": "dist", "cleanUrls": true }
```

I hver mal under `templates/`:

```html
<body data-page-key="index">
  ...
  <script src="admin/edit.js" defer></script>
</body>
```

`data-page-key` avgjør hvilken `content/<side>.json` siden leser og skriver.
Uten den starter editoren ikke.

Admin åpnes ved å skrive `admin` på tastaturet, eller ved å trykke fem ganger på
kredittlinja i bunnen (`.footer__credit`) på mobil. Et element med
`data-admin-login` gir en synlig innloggingslenke i tillegg.

## Miljøvariabler

Settes i Vercel, på prosjektet.

| Variabel | Påkrevd | Beskrivelse |
|---|---|---|
| `ADMIN_PIN` | ja | PIN-en klienten logger inn med. Mangler den, svarer API-et 500 og ingen slipper inn. |
| `GITHUB_REPO` | ja | `konto/repo` som publiseringen committer til. |
| `GITHUB_TOKEN` | ja | Token med skrivetilgang til innholdet i repoet. |
| `GITHUB_BRANCH` | nei | Standard `main`. |
| `ADMIN_REBUILD_MS` | nei | Nedtellingen klienten ser etter Publiser. Standard 50000. |

`ADMIN_REBUILD_MS` skal måles på det enkelte prosjektet:

```bash
npx oppskalert-admin tid          # forklarer målingen
npx oppskalert-admin tid 62000    # skriver admin-tid.json med den målte verdien
```

Sett den samme verdien i Vercel. En nedtelling som går ut før siden er klar leser
som en feil, og da trykker klienten Publiser en gang til.

## Instrumentering

Attributtene i malen bestemmer hva klienten kan redigere.

| Attributt | Virkning |
|---|---|
| `data-edit="nokkel"` | Redigerbar tekst. Innholdet hentes fra `nokkel` i sidens JSON. |
| `data-edit-image="nokkel"` | Bilde. En `<img>` får `src`, alt annet får `background-image`. |
| `data-editable-list="nokkel"` | Beholder for en liste. Verdien i JSON er en tabell med objekter. |
| `data-list-item` | Ett kort i lista. Hvert kort er sin egen mal, etter indeks. |
| `data-list-field="felt"` | Redigerbar tekst inne i et kort. |
| `data-list-image-field="felt"` | Bilde inne i et kort. |
| `data-content-src="side"` | Elementet og alt under henter innholdet sitt fra en annen sides JSON. |

To detaljer verdt å kjenne:

**Fokuspunkt.** Nøkkelen `nokkel@pos` styrer utsnittet i et beskåret bilde, for
eksempel `"50% 22%"`. Den settes som `object-position` på en `<img>` og
`background-position` ellers. Uten den beholder nettleseren midten og kutter
gjerne hoder.

**Speiling.** Et blokk med `data-content-src` er skrivebeskyttet i editoren, slik
at speilet innhold har én eier. Endringen gjøres på siden som eier innholdet, og
viser likt begge steder.

## Innholdsfilene

`content/<side>.json` er flat. Tekstfelt og bildefelt ligger på toppnivå, lister
som tabeller.

```json
{
  "hero_tittel": "Schei Restaurering",
  "hero_bilde": "/assets/uploads/verksted-1757251200.jpg",
  "hero_bilde@pos": "50% 30%",
  "prosjekter": [
    { "tittel": "Kirkebenk, 1890", "tekst": "…", "bilde": "/assets/uploads/benk.jpg" }
  ]
}
```

Filene skrives av publiseringen. Ødelagt JSON stopper aldri et bygg: malen faller
tilbake til standardteksten sin, og bygget logger en advarsel.

Bilder klienten laster opp havner i `static/assets/uploads/`. Tillatte format er
jpg, png, webp og gif. Svg er utelatt med vilje, siden en svg kan bære `<script>`
og ville kjørt på kundens eget origin. Én publisering tar maks 3,5 MB til sammen,
og over det ber editoren om å ta tekst og bilder i hver sin runde.

## Kommandoer

```bash
oppskalert-admin init [sti]      # stillaserer build.mjs, api/ og tokens.css
oppskalert-admin doctor [sti]    # kjører byggereglene, avslutter med 1 ved feil
oppskalert-admin tid [ms]        # måler og lagrer byggetiden
oppskalert-admin dev [sti]       # lokal redigeringsløkke på http://localhost:8899
```

`doctor` håndhever fire ting som feil: inline `margin` på et listeelement, CSS som
styler `strong` uten å style `b`, manglende `--adm-*`-farger, og lenker til Google
Fonts. Tre ting varsles: umålt byggetid, tankestrek, og mulige «ikke X, men
Y»-setninger. Varsler er kandidater til gjennomlesing og stopper ingenting.

`dev` serverer `dist/`, tar imot publisering lokalt og bygger om med én gang. Det
er samme løkke som i produksjon, uten ventetiden på Vercel.

## Kjente begrensninger

**IP-sperren nullstilles ved kald start.** Fem feil PIN fra samme IP gir 15
minutters sperre, men telleren ligger i minnet per funksjonsinstans. Starter
instansen kaldt, er telleren null igjen. For en side med én admin er det
akseptabelt. Skal det holde mot en seriøs angriper, må telleren flyttes til delt
lagring, og da koster siden penger.

**Skjulte listeelementer ligger fortsatt i HTML-en.** Skjuler klienten et kort,
får det klassen `is-hidden-item` og `display:none`. Innholdet står i kildekoden og
kan leses av hvem som helst. Bruk skjuling til å ta noe midlertidig ut av visning,
aldri til noe som skal være hemmelig. Skal innholdet bort, slett kortet.

**`oppskalert-admin dev` hører hjemme på egen maskin.** Den har ingen sperre mot
gjetting, faller tilbake på PIN `1234` når `ADMIN_PIN` mangler, og skriver filer
i prosjektet. Eksponer den aldri på et nett andre når.

## Lisens

MIT.
