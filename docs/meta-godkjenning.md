# Meta-godkjenning av Instagram-henteren

Mål: at alle kunder kan koble Instagram til nettsiden sin med ett klikk, uten
testerlister. Det krever **Advanced Access** på `instagram_business_basic`, og
det krever bedriftsverifisering og App Review hos Meta.

Henteren bruker Instagram-innloggingen fra v1.9.0 (se README, «Instagram på
forsiden»). Kunden trenger ingen Facebook-side, bare en bedrifts- eller
skaperkonto på Instagram.

## Rekkefølge

| # | Steg | Hvem | Tid |
|---|---|---|---|
| 1 | Bedriftsverifisering av porteføljen «Oppskalert» | Aleksander | 15 min + Metas behandling (dager) |
| 2 | Instagram-innlogging i Meta-appen, nye nøkler i Vercel | Aleksander eller Claude i Chrome | 20 min |
| 3 | Test med @oppskalert på en kundeside | Aleksander | 5 min |
| 4 | Instagram-avsnitt på oppskalert.no/personvern + sletteside | Claude | 30 min |
| 5 | Appinnstillinger: ikon, kategori, personvern- og slettelenke | Aleksander eller Claude i Chrome | 10 min |
| 6 | Skjermopptak av innloggingen | Aleksander | 15 min |
| 7 | Send inn App Review med tekstene under | Aleksander | 15 min |
| 8 | Etter godkjenning: sett appen til Live | Aleksander | 2 min |

Steg 1 kan gå parallelt med 2 til 6. Innsendingen (7) krever at 1 er godkjent.

## 1. Bedriftsverifisering

Business Settings → Security Center → Start verification.

- Juridisk navn og org.nr. må stemme med Brønnøysund. Personvernsiden oppgir
  org.nr. **935 067 049** og sier at Oppskalert er et datterselskap av
  PotentialAIze AS. Bruk navnet som står i Enhetsregisteret for det nummeret.
- Dokument: firmaattest fra Brønnøysundregistrene (PDF fra altinn.no eller
  brreg.no), eller en faktura fra strøm eller telefon med firmanavn og adresse.
- Domenet oppskalert.no kan bekreftes med DNS-post eller metatag, som Meta viser.
- Telefon og adresse må være de samme som i dokumentet.

## 2. Instagram-innlogging i Meta-appen

developers.facebook.com → appen «Oppskalert nettsider» (ID 1895893015108979).

1. Use cases → legg til / åpne Instagram → **API setup with Instagram login**.
   Meta sier at én app ikke kan bruke både Facebook-innlogging og
   Instagram-innlogging. Krever dashbordet at Facebook Login for Business
   fjernes, gjør det, eller lag en ny app av typen Business med navnet
   «Oppskalert nettsider».
2. Kopier **Instagram app ID** og **Instagram app secret** (ikke Facebook-appens).
3. Vercel → Team Settings → Environment Variables: sett `IG_APP_ID` og
   `IG_APP_SECRET` til de nye verdiene. Slett `IG_CONFIG_ID`.
4. Business login settings → OAuth redirect URIs: legg inn
   `https://<domenet>/api/instagram` for hver kundeside (nå:
   `https://cecilemoronidemo.oppskalert.no/api/instagram`).
5. App roles → Roles → Instagram Testers: legg til `oppskalert`, og godta på
   https://www.instagram.com/accounts/manage_access/.

## 3. Test

Oppgrader kundesiden til `oppskalert-admin#v1.9.0`, bygg, åpne
`/api/instagram?koble` og logg inn som @oppskalert. Siden skal vise
«Innloggingen virker» med antall innlegg lest. Ingenting lagres. Dette er også
det ene vellykkede API-kallet Meta krever før innsending.

## 4. Personvern og sletting

Meta krever en personvernlenke som beskriver hva appen gjør med dataene.
Legg dette inn på oppskalert.no/personvern (norsk) og som egen engelsk side
oppskalert.no/privacy/instagram (reviewerne leser engelsk):

> **Instagram on client websites**
>
> Oppskalert builds websites for small businesses. When a client chooses to
> connect their Instagram professional account to their own website, our app
> "Oppskalert nettsider" reads that account's username, follower count, post
> count, and the images and captions of its latest 18 posts. We use this only
> to show the client's own posts on the client's own website, updated once a
> night.
>
> We store an access token for the connected account in our database
> (Supabase, EU), and copies of the post images in the website's code
> repository. We do not read messages, comments, insights or any other account,
> and we never share or sell the data.
>
> The client can disconnect at any time by removing the app under Instagram →
> Settings → Website permissions → Apps and websites, or by emailing
> team@oppskalert.no. On request we delete the stored token within 30 days and
> remove the images from the website.

Sletteinstruksjoner (Meta: App settings → Basic → Data deletion instructions
URL): pek til samme side med ankeret `#delete`, der siste avsnitt står.

## 5. Appinnstillinger

App settings → Basic:

- App icon: 1024 × 1024 px, Oppskalert-merket.
- Privacy policy URL: `https://oppskalert.no/privacy/instagram`
- Data deletion instructions URL: `https://oppskalert.no/privacy/instagram#delete`
- Category: Business and pages
- Contact email: team@oppskalert.no
- Business: koble til den verifiserte porteføljen fra steg 1.

## 6. Skjermopptak (manus)

Ta opp med QuickTime, engelsk språk i nettleseren, 1 til 2 minutter. Legg på
korte tekstskilt (Meta ber om det). Bruk @oppskalert.

1. Vis en kundeside uten Instagram-innlegg. Skilt: «Client website before
   connecting Instagram».
2. Åpne `https://<kundeside>/api/instagram?koble`. Skilt: «The client clicks
   the connect link we send them».
3. Instagram-innloggingen: logg inn og vis tillatelsessiden med
   `instagram_business_basic`. Trykk Allow. Skilt: «The client grants
   instagram_business_basic».
4. Siden «Innloggingen virker» med brukernavnet og antall innlegg. Skilt:
   «The app reads the username, user ID and latest posts».
5. Vis kundesiden med Instagram-rutenettet fylt. Skilt: «The client's own posts
   are shown on the client's own website».

## 7. App Review: tekster

**Use case for `instagram_business_basic`**

> Oppskalert builds and hosts websites for small businesses in Norway. Each
> client can connect their own Instagram professional account to their own
> website. We use instagram_business_basic to read the connected account's
> username, user ID, follower count, media count and the media URL and caption
> of its latest posts. Once a night a server job downloads the latest 18 images
> and publishes them in an Instagram section on the client's website, together
> with the follower and post count. The data is shown only on the website of the
> account owner who connected it. We do not publish, comment, message or read
> any other account.

**Instructions for the reviewer**

> 1. Open https://cecilemoronidemo.oppskalert.no/api/instagram?koble
> 2. Log in with the test Instagram account below and tap Allow.
> 3. The page "Innloggingen virker" (Norwegian for "The login works") shows the
>    account's username and how many posts were read. In test mode nothing is
>    stored.
> 4. For a connected client, the result is visible in the Instagram section at
>    the bottom of https://cecilemoronidemo.oppskalert.no
>
> Test account: [brukernavn og passord til en egen testkonto, aldri den ekte
> @oppskalert-kontoen hvis den har tofaktor]

**Data handling (svarene)**

- Data processors: Supabase (token), Vercel (hosting), GitHub (images in the
  website repository).
- Responsible entity: Oppskalert, org.nr. 935 067 049, Norway.
- Requests from public authorities: none received; we follow Norwegian law.

## 8. Etter godkjenningen

App mode → Live. README-steg 2 (Instagram Tester) utgår da for nye kunder.
