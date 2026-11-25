# Kontrollpanel i oppskalert-admin (v1.8.0)

Første kunde: Cécile Moroni. Avklart med Aleksander 25.11.2026.

## Hva kunden ser

En knapp **Kontrollpanel** i admin-baren, med et tall når det ligger nye omtaler.
Den åpner `/admin/panel` (samme PIN), med faner for det siden har merket:

| Fane | Hva kunden gjør |
|---|---|
| Omtaler | Leser nye omtaler fra skjemaet på siden. «Publiser» legger omtalen på siden, med firmalogo. «Avvis» fjerner den. |
| Show | Legger til, endrer og fjerner show med full dato, sted og billettlenke. Show som er passert, forsvinner av seg selv. |
| Logoer | Laster opp firmalogoer. Tom kant kuttes og hvit bakgrunn blir gjennomsiktig, så alle ser like store ut. |
| Media | Legger til nye TV- og avissaker. |
| Nøkkeltall | Endrer tallene (antall show, snitt, vurderinger). |

Alt annet redigeres som før, rett på siden.

## Slik bygges det

1. **Merking i malen (opt-in).** `data-panel="Show"` på en `data-editable-list`
   gir en fane med et skjema for lista. Feltene kommer fra `data-list-field` og
   `data-list-image-field` i kortet. `data-panel-type="dato|lenke|logo"` på et felt
   gir riktig inngang. `data-panel="Nøkkeltall"` på `data-edit`-elementer samler
   dem i én fane. `data-panel-omtaler` merker listene en godkjent omtale skal inn i.
2. **Bygget** leser merkene og skriver `dist/admin/panel.json` (faner, sider,
   felt, standardinnhold fra malen), som `samlinger.json` i dag.
3. **Lesing og lagring.** Ny handling `les-side` i `/api/save` henter
   `content/<side>.json` fra GitHub, så panelet ser det kunden lagret sist.
   Lagring går gjennom dagens `/api/save` med `page` og `edits`, ett commit.
4. **Show med dato.** Datoen lagres som `2026-12-16` og vises slik malen viser
   den (`16.12`). Bygget tar ut passerte show, og et lite skript skjuler dem
   mellom byggene.
5. **Omtaler.** Ny `api/tilbakemelding.js`: skjemaet på siden sender hit
   (honningkrukke og sperre som `henvendelse.js`), og omtalen lagres i Supabase-
   tabellen `tilbakemeldinger` (RLS uten policyer). Panelet leser og merker dem
   med PIN. Publiser skriver omtalen inn i de merkede listene og merker raden
   som publisert.
6. **Logoer.** I nettleseren: nesten-hvite piksler blir gjennomsiktige (bare når
   bildet ikke er gjennomsiktig fra før), tom kant kuttes, logoen skaleres inn i
   400 × 160 og lagres som png. Originalfargene beholdes. Samme behandling når en
   omtale publiseres med logo.

## Test

`node:test` for `tilbakemelding.js` (lagring, sperre, PIN), skanningen som lager
`panel.json`, `les-side`, datofilteret og logobehandlingen (ren funksjon på
piksler). Hele suiten skal være grønn før tag.

## Céciles side etterpå

Merkene i malene (show på stand-up, logoer og omtaler på forsiden og /omtaler,
media, nøkkeltall), `/tilbakemelding` koblet til `api/tilbakemelding.js`, pakken
til v1.8.0, doctor 0 feil, og det bygde resultatet sammenlignet før og etter.

## Ikke med nå

E-postvarsel om nye omtaler, Instagram-høydepunktene, dra-og-slipp for
rekkefølge (piler opp og ned i stedet).

## Anslag

5–6 timer: pakken 4, Céciles side 1, test og gjennomgang 1.
