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
npm i "github:lobitomaldito/oppskalert-admin#v1.3.1"
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

`init` setter også `"type": "module"` i `package.json`. Re-eksportene er ESM,
og uten typen laster Vercel dem som CommonJS: hvert kall til `/api/save` og
`/api/verify-pin` svarer `FUNCTION_INVOCATION_FAILED`, og loggen viser
`ERR_REQUIRE_ESM`. `npm init -y` skriver `"type": "commonjs"` på nyere npm, så
dette rammer nesten alle nye prosjekter. `dev` og bygget merker ingenting, feilen
viser seg først etter deploy. Retter du `package.json` for hånd:
`npm pkg set type=module`. Har siden egne endepunkter i `api/` skrevet med
`require` eller `module.exports`, må de skrives om til `import`/`export`.
`doctor` flagger begge tilfellene (regelen `api-modultype`).

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

### Oppgradere

Et prosjekt får en rettelse først når avhengigheten peker på den nye taggen.
Bytt taggen og installer på nytt, kjør så `doctor` og bygget:

```bash
npm i "github:lobitomaldito/oppskalert-admin#v1.5.1"
npx oppskalert-admin doctor .
node build.mjs
```

**v1.5.1:** et png-bilde uten gjennomsiktighet (skjermbilde, bokomslag) lagres
nå som jpg når panelet krymper det. Før forble det png, kvaliteten virket ikke,
og et enkelt bilde kunne fylle hele publiseringskøen og gi meldingen «For mange
bilder på én gang». En png med gjennomsiktige piksler forblir png. Er ett bilde
alene over grensen, sier panelet nå «Bildet er for stort» i stedet. jpg-bilder
laget av webp eller avif med gjennomsiktighet får hvit bunn, før ble den svart.

**v1.5.0:** samlinger får en egen redigeringsside (`/admin/samling`) med
liste, nytt innlegg, rediger, skjul og slett, og `editor/skjema.js` gir store
knapper inn dit fra nettsiden. **Endring for prosjekter med samling:** det gamle
«Nytt innlegg»-overlegget i admin-baren er borte; knappen står nå over lista og
går til redigeringssiden. Legg `<script src="/admin/skjema.js" defer></script>`
også i innleggsmalen for å få Rediger-knappen der. Nytt: egen mal per samling
(`_<navn>.html`), felttypene valg, galleri og rekkefølge, relaterte innlegg,
`data-samling-sist`, og handlingene `oppdater`, `slett` og `les` i `/api/save`.
Bildevelgeren i panelet godtar også avif og heic, som gjøres om til jpg i
nettleseren (heic bare i Safari).

**v1.4.0:** `doctor` fanger fire nye ting, hentet fra en sjekkliste over vanlige
vibekoding-feil: lenker uten mål (`href="#"`, tom `href`, et internt anker uten
matchende `id`), manglende `<title>`/meta description/favicon på en side,
manglende `templates/404.html` og en header/nav uten lenke hjem (alle fire som
feil), og et hardkodet årstall ved siden av `©` (varsel). Et prosjekt som
allerede manglet noe av dette feiler på `doctor` etter oppgraderingen; rett
opp det som meldes, det var reelle mangler før også.

**v1.3.1:** `doctor` feiler når `api/*.js` bruker `import`/`export` og
`package.json` mangler `"type": "module"`, og `init` setter typen. Et prosjekt
som allerede kjører på Vercel har typen fra før, ellers hadde publiseringen aldri
virket. Gir `doctor` denne feilen etter oppgraderingen, kjør
`npm pkg set type=module` før neste deploy.

**v1.3.0: alle prosjekter bør oppgradere.** To feil i admin-baren er rettet:

- Sidens `--adm-*`-farger ble overstyrt. `edit.js` legger `edit.css` sist i
  `<head>`, og fallbackene der sto på `:root` med samme spesifisitet som sidens
  egne, så hver side fikk den blå standardbaren. Fallbackene står nå på
  `:where(:root)` med spesifisitet 0, og `:root` i sidens `tokens.css` vinner.
  `init` skriver `html:root`, som vinner også mot eldre versjoner. Et prosjekt
  som har omgått feilen med `html:root` kan beholde det.
- Baren har fått mobiloppsett. Under 600 px ligger den i full bredde med to
  rader: knappene øverst, statusteksten under, kuttet med ellipse. Under 360 px
  viker Admin-merket for knappene. En lang feilmelding vises derfor bare
  delvis på mobil.

Taggen tar også med samlinger (se egen seksjon), som står av til prosjektet
oppretter `content/samlinger/`.

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

## `kobler`: koble en side til admin-panelet

```bash
oppskalert-admin kobler [sti]
```

Setter de fire miljøvariablene over i Vercel, på riktig prosjekt, uten å lime
inn i fire felter i et nettgrensesnitt. Forutsetter at prosjektet allerede er
lenket med `vercel link`, og at det har en GitHub-remote (`git remote get-url
origin`).

| Variabel | Hvordan den settes |
|---|---|
| `ADMIN_PIN` | genereres, seks tilfeldige siffer |
| `GITHUB_REPO` | leses fra git sin origin-remote |
| `GITHUB_TOKEN` | limes inn av deg, se under |
| `ADMIN_REBUILD_MS` | måles: en merkefil committes, pushes, og kommandoen poller den
  live siden til den nye verdien dukker opp der |

Kommandoen viser hva den vil gjøre og venter på en bekreftelse før den setter
noe som helst. Til slutt kjører den `doctor` automatisk og skriver resultatet,
så du vet om noe mangler før lenken går til kunden.

**Tokenet er det ene manuelle steget.** GitHub har ikke noe endepunkt for å
lage et fine-grained tilgangstoken, så det må lages for hånd i nettleseren.
De to veiene rundt det er begge dårligere sikkerhet: gjenbruk av ditt
personlige token gir hver kundeside skrivetilgang til alt kontoen din eier
(lekker én side, ryker alle), og en delt GitHub-app må ha privatnøkkelen sin
liggende i hvert eneste kundeprosjekt (lekker én, kan angriperen lage tokens
for samtlige). Et fine-grained token per kundeside begrenser skaden ved
lekkasje til den ene siden.

Kommandoen åpner GitHub-skjemaet for deg. Velg:

- **Repository access:** Only select repositories, og velg det ene repoet
  siden ligger i. Ikke «All repositories».
- **Permissions:** under Repository permissions, sett **Contents** til
  **Read and write**. Alt annet kan stå på «No access».

Lim inn det ferdige tokenet når kommandoen ber om det. Det vises ikke mens du
skriver, og det havner aldri på disk, i en logg eller på en kommandolinje.
`vercel env add` leser det fra stdin.

PIN-en skrives til skjermen én gang, helt til slutt. Noter den og send den
videre til kunden. Kommandoen sender den ikke selv.

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
oppskalert-admin kobler [sti]    # setter miljøvariablene i Vercel, se egen seksjon under
```

`doctor` håndhever disse som feil: inline `margin` på et listeelement, CSS som
styler `strong` uten å style `b`, manglende `--adm-*`-farger, lenker til Google
Fonts, `api/*.js` med et modulsystem som ikke stemmer med `"type"` i
`package.json`, manglende redigeringsmarkør på tekst og bilder (se
Dekningskontrollen under), lenker uten mål (`href="#"`, tom `href`, eller et
internt anker uten matchende `id`), manglende `<title>`/meta description/
favicon på en side, manglende `templates/404.html`, og en header/nav uten
lenke hjem. Disse varsles: umålt byggetid, tankestrek, mulige «ikke X, men
Y»-setninger, manglende redigeringsmarkør i `li`, `h4` og topp-/bunntekst, tre
eller flere like søsken-elementer på rad, og et hardkodet årstall ved siden av
`©`. Varsler er kandidater til gjennomlesing og stopper ingenting.

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

## Samlinger (blogg, aktuelt, siste nytt)

Valgfritt, og helt av til noen faktisk oppretter `content/samlinger/`. Uten den
mappa bygger og oppfører motoren seg nøyaktig som før, og ingen av admin-flatene
under vises.

```
content/samlinger/aktuelt.json   ett innlegg per objekt i en tabell
templates/_aktuelt.html          malen for denne samlingen (valgfri)
templates/_innlegg.html          malen for samlinger uten sin egen
```

Navnet på `.json`-fila (uten endelsen) blir samlingens navn og URL-segment:
`aktuelt.json` bygger sidene på `/aktuelt/<slug>/`. Har samlingen en egen mal,
`templates/_<navn>.html`, brukes den; ellers `_innlegg.html`. Én mal per prosjekt holder
til vi ser et kundebehov for flere.

Et innlegg:

```json
{
  "slug": "nytt-bygg-i-sentrum",
  "tittel": "Nytt bygg i sentrum",
  "ingress": "Kort inngang, en til to setninger.",
  "brodtekst": "Den lange teksten.",
  "bilde": "/assets/uploads/nytt-bygg.jpg",
  "dato": "2026-03-01",
  "_kladd": false
}
```

`_kladd: true` gjør at innlegget ikke havner i `dist/` i det hele tatt, verken
som egen side eller i listeseksjonen på foreldresiden. Det er en annen
mekanisme enn `_skjult` på et vanlig listeelement, som bare gjemmes med CSS: et
utkast bygges aldri.

Malen instrumenteres med `data-innlegg="felt"` og `data-innlegg-image="felt"`,
samme prinsipp som `data-edit`/`data-edit-image` på en vanlig side, bare med
kilden i innleggets egne felt i stedet for sidas JSON.

Listeseksjonen på foreldresiden (typisk forsiden):

| Attributt | Virkning |
|---|---|
| `data-samling="navn"` | Beholder for lista. `navn` matcher `.json`-filens navn uten endelse. |
| `data-list-item` | Ett kort per innlegg. Første kort brukes som mal for alle, siden antall innlegg er ukjent. |
| `data-list-field="felt"` | Redigerbar tekst inne i kortet. |
| `data-list-image-field="felt"` | Bilde inne i kortet. |
| `data-samling-lenke` | Lenken til innleggets egen side. `href` settes automatisk. |
| `data-samling-antall="N"` | Begrenser lista til de N nyeste. Utelates attributtet, vises hele samlingen. Er verdien ikke et positivt tall, vises hele samlingen og bygget skriver et varsel. |

Hele `[data-samling]`-elementet låses som skrivebeskyttet i editoren (motoren
setter `data-content-src` på beholderen, og `edit.js` sjekker den med
`closest()`). Legg derfor aldri egne `data-edit`- eller
`data-edit-image`-elementer inne i beholderen utenom listemalen: de blir
uredigerbare. Trenger seksjonen en redigerbar overskrift eller ingress, sett
den utenfor `[data-samling]`.

Sitemap: har prosjektet en `static/sitemap.xml` med minst én absolutt `<loc>`
(`https://kundedomene.no/…`), legger bygget innleggssidene inn i den med samme
skjema og host. Finnes ingen slik fil, skrives ingen `dist/sitemap.xml`, og
bygget sier fra i stedet. Sitemap-protokollen krever fullt kvalifiserte URL-er,
og motoren kjenner ikke kundens domene fra noe annet sted.

### Redigeringssiden

Klienten skriver, retter, skjuler og sletter innlegg på `/admin/samling?navn=<samling>`:
en liste over innleggene, en stor knapp for nytt innlegg, og et skjema med de
feltene malen har. Siden logger inn med samme PIN som resten av panelet.
Innleggene hentes fra GitHub gjennom `/api/save`, med utkastene, så de aldri
ligger åpent i `dist/`. Hvert trykk på Publiser er ett commit og ett bygg,
bildene med. Bildene gjøres om til jpg (maks 1600 px) i nettleseren, også
avif og heic.

`editor/skjema.js` gir inngangene fra selve nettsiden, og bare for en innlogget
admin: en stor knapp foran hver `[data-samling]`-liste, som åpner et tomt
skjema, og en fast «Rediger»-knapp på hver innleggsside. Den må lenkes i malene
manuelt, både på siden med lista og i innleggsmalen:

```html
<script src="/admin/skjema.js" defer></script>
```

Skjemaets felt lages av innleggsmalen (bygget skriver dem til
`dist/admin/samlinger.json`). Hvert `data-innlegg`, `data-innlegg-image` og
`data-innlegg-galleri` utenfor `[data-relaterte]`, `<title>` og `<meta>` blir
ett felt:

| Merke i malen | Felt i skjemaet |
|---|---|
| `data-innlegg` på `h1`–`h6`, `span` o.l. | én linje |
| `data-innlegg` på `p`, `blockquote` | kort tekst |
| `data-innlegg` på `div`, `section`, `article` | lang tekst, tom linje gir nytt avsnitt |
| `data-innlegg-type="linje\|kort\|lang"` | overstyrer typen over |
| `data-innlegg-valg="Til salgs\|Solgt"` | valgknapper; lista får en hurtigknapp som bytter mellom de to første |
| `data-innlegg-image="felt"` | ett bilde |
| `data-innlegg-galleri="felt"` | inntil 8 bilder; bygget skriver ett `<img>` per adresse |
| `data-innlegg-etikett="Pris"` | overskriften på feltet |
| `data-innlegg-hjelp="F.eks. 2 500 kr"` | hjelpeteksten under |
| `data-innlegg-rekke="1"` | rekkefølgen i skjemaet, når den skal være en annen enn på siden |

På lista:

| Attributt | Virkning |
|---|---|
| `data-samling-ny="Legg ut nytt møbel til salgs"` | teksten på den store knappen og overskriften i skjemaet |
| `data-samling-tittel="Møbler til salgs"` | overskriften på redigeringssiden |
| `data-samling-sist="status=solgt"` | innlegg der feltet inneholder verdien, havner sist, før `data-samling-antall` kutter |

På `<body>` i innleggsmalen: `data-samling-rediger="Rediger møbelet"` gir
teksten på Rediger-knappen. Bygget setter selv `data-samling-innlegg="<samling>/<slug>"`.

### Relaterte innlegg

```html
<section data-relaterte="4" data-relaterte-sist="status=solgt">
  <h2>Flere møbler til salgs</h2>
  <div class="varer">
    <a data-relatert data-samling-lenke href="/tilsalgs/">
      <img data-innlegg-image="bilde" src="/tom.jpg" alt="">
      <span data-innlegg="tittel">Tittel</span>
    </a>
  </div>
</section>
```

`[data-relatert]` er kortmalen, klonet for hvert av de N neste innleggene i
listerekkefølge (nyeste først), fra innlegget etter dette og rundt. Uten andre
innlegg fjernes hele seksjonen. `<title>` og `<meta>` med `data-innlegg` får ren
tekst, og `{}` i malens tekst byttes mot verdien: `{} | Butikknavn`.

### API: handlinger på en samling

`POST /api/save` med `samling: { navn, handling, ... }` og uten `page`/`edits`:

| `handling` | Gjør |
|---|---|
| `ny` (standard) | legger `innlegg` først; en slug i bruk får `-2`, aldri overskriving |
| `oppdater` | bytter ut innlegget med samme slug, som må finnes (ellers 404) |
| `slett` | fjerner innlegget med `samling.slug` |
| `les` | svarer `{ ok, innlegg }` uten å committe |

Sidens egen `content/<side>.json` skrives bare når `edits` har innhold.

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
