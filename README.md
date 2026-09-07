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
  <script src="/admin/edit.js" defer></script>
</body>
```

`data-page-key` avgjør hvilken `content/<side>.json` siden leser og skriver.
Uten den starter editoren ikke.

**Ikke lenk `/admin/edit.css` i `<head>`.** `edit.js` injiserer stilarket selv
når en verifisert admin er inne. Lenkes det i malen også, laster hver
besøkende 14,7 kB CSS de aldri bruker.

Admin åpnes ved å skrive `admin` på tastaturet, eller ved å trykke fem ganger på
kredittlinja i bunnen (`.footer__credit`) på mobil. Et element med
`data-admin-login` gir en synlig innloggingslenke i tillegg.

### Migrere et eksisterende prosjekt

Gjelder et prosjekt som fra før har sin egen, håndbygde versjon av panelet.
Rydd den bort før `init` kjører.

```bash
rm -f api/save.js api/save-image.js api/verify-pin.js api/_rateLimit.js
rm -rf build.mjs dev-server.mjs static/admin node_modules dist
npm pkg delete dependencies.node-html-parser
```

Første linje sletter admin-motorens egne filer i `api/` ved navn. Siden kan ha
egne endepunkter der, som et kontaktskjema, og en `rm -rf api` sletter dem
også. Andre filer i `api/` er sidens egne og skal stå.

Fortsett med installeringen over: `npm i`, så `npx oppskalert-admin init .`.
Kjør `oppskalert-admin doctor .` og `node build.mjs` etterpå for å bekrefte at
siden bygger med det nye panelet.

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
og ville kjørt på kundens eget origin. Én publisering tar maks 3,0 MB til sammen,
og over det ber editoren om å ta tekst og bilder i hver sin runde. Taket er satt i
dekodede byte: kroppen sendes som base64, som er en tredjedel større på tråden, og
over 4,5 MB avviser Vercel den før handleren kjører.

## Kommandoer

```bash
oppskalert-admin init [sti]      # stillaserer build.mjs, api/ og tokens.css
oppskalert-admin doctor [sti]    # kjører byggereglene, avslutter med 1 ved feil
oppskalert-admin tid [ms]        # måler og lagrer byggetiden
oppskalert-admin dev [sti]       # lokal redigeringsløkke på http://localhost:8899
```

`doctor` håndhever disse som feil: inline `margin` på et listeelement, CSS som
styler `strong` uten å style `b`, manglende `--adm-*`-farger, lenker til Google
Fonts, og manglende redigeringsmarkør på tekst og bilder (se Dekningskontrollen
under). Disse varsles: umålt byggetid, tankestrek, mulige «ikke X, men
Y»-setninger, manglende redigeringsmarkør i `li`, `h4` og topp-/bunntekst, og tre
eller flere like søsken-elementer på rad. Varsler er kandidater til
gjennomlesing og stopper ingenting.

`dev` serverer `dist/`, tar imot publisering lokalt og bygger om med én gang. Det
er samme løkke som i produksjon, uten ventetiden på Vercel.

## Dekningskontrollen

`doctor` sier hvilke felter i en mal som mangler redigeringsmarkør: `data-edit`,
`data-edit-image`, `data-list-item` og de andre attributtene fra
Instrumentering over. Skillet mellom feil og varsel er målt, ikke valgt.
Tabellen under er kalibreringen, fra 22 maler på fire kundesider som er
instrumentert for hånd.

| Tagg | Historisk dekning | Gir |
|---|---|---|
| `h3` | 100 % | feil |
| `blockquote` | 100 % | feil |
| `p` | 84 % | feil |
| `h2` | 81 % | feil |
| `h1` | 56 % | feil |
| `li` | 15 % | varsel |
| `h4` | 13 % | varsel |

`li` og `h4` er stort sett navigasjon og bunntekst, derfor varsel istedenfor
feil.

Fire avgrensninger, også målt:

- Maler editoren aldri åpner (`404.html`, en mal med
  `<meta http-equiv="refresh">`) hoppes over.
- Ren `{{PLASSHOLDER}}`-tekst hoppes over.
- Treff i `<header>`, `<footer>` og `<nav>` nedgraderes fra feil til varsel.
- `gjentatt-gruppe` (under) leser aldri `<head>`.

Effekt målt på de samme 22 malene: 75 feil ned til 39, falske positive fra
49 % til 23 %, uten at et eneste ekte funn forsvant.

`gjentatt-gruppe` varsler når tre eller flere søsken-elementer deler tagg og
klasse uten å være en `data-editable-list`. To like elementer er ofte bare et
layoutgrep (to kolonner), tre ligner en liste kunden selv burde få legge til og
fjerne rader i.

**`data-edit-ignore`** er avmeldingsmarkøren. Sett den på et element eller en
forelder, og alle tre dekningsreglene tier om det. Bruk den på juridisk tekst,
genererte datoer og annet som med rette skal stå fast.

## detail-modal.js og kollaps.js

To valgfrie filer i `editor/`, kopiert til `dist/admin/` av bygget som
`edit.js`. Begge må lenkes i malen med sin egen `<script>`-tag.

### Detaljvisning

```html
<script src="/admin/detail-modal.js" defer></script>
```

Klikk på et `[data-list-item]` som inneholder `[data-list-detail]` åpner et
fullskjerms overlegg. Kortet er en kort teaser, detaljblokken bærer den lange
teksten (beskrivelse, kreditering, lenker). Tekst-URL-er til YouTube og Vimeo i
detaljblokken blir innebygde spillere, både som ekte lenker og som ren tekst
limt inn av klienten.

`data-pos-modal` på bildet gir overlegget sitt eget utsnitt, uavhengig av
utsnittet kortet bruker (`nokkel@pos`, se Instrumentering over). Uten den
arver overlegget kortets utsnitt.

### Kollaps

```html
<script src="/admin/kollaps.js" defer></script>
```

`data-collapsible="N"` på en liste-beholder viser de første N
`[data-list-item]` for besøkende, med en «Vis 5 forestillinger til»-knapp for
resten. Tallet er antallet skjulte elementer, ordet kommer fra
`data-collapsible-noun`. Uten det attributtet står det bare «Vis 5 til».
Utvidet bytter knappen til «Vis færre». Admin ser alltid alle
elementene, uten kollaps.

## Kjente begrensninger

**IP-sperren teller per funksjonsinstans.** Fem feil PIN fra samme IP gir 15
minutters sperre, men telleren ligger i minnet i den instansen som tok imot
forsøket. Tre ting svekker den. En kald start nullstiller telleren.
`/api/save` og `/api/verify-pin` er to funksjoner på Vercel, med hver sin
modulinstans og hvert sitt kart, så de teller hver for seg. Og kjører Vercel
flere instanser samtidig, fordeler forsøkene seg utover dem, så den samlede
grensen ligger godt over fem uten at noen instans har startet kaldt. For en side
med én admin er det akseptabelt. Skal det holde mot en seriøs angriper, må
telleren flyttes til delt lagring, og da koster siden penger.

**Sett en PIN på minst seks siffer.** Sperren over er svakere enn de fem
forsøkene den ser ut til å gi, siden hver funksjonsinstans teller for seg. Fire
siffer er 10 000 kombinasjoner og lar seg gjette. Seks siffer er hundre ganger
flere, og det holder mot den gjettehastigheten sperren slipper gjennom.

**Skjulte listeelementer ligger fortsatt i HTML-en.** Skjuler klienten et kort,
får det klassen `is-hidden-item` og `display:none`. Innholdet står i kildekoden og
kan leses av hvem som helst. Bruk skjuling til å ta noe midlertidig ut av visning,
aldri til noe som skal være hemmelig. Skal innholdet bort, slett kortet.

**`oppskalert-admin dev` hører hjemme på egen maskin.** Den lytter bare på
127.0.0.1 og bruker samme PIN-sperre som produksjon, men den faller tilbake på
PIN `1234` når `ADMIN_PIN` mangler, og den skriver filer i prosjektet. Legg den
aldri ut gjennom en tunnel eller en proxy.

## Lisens

MIT.
