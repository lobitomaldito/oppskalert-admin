// test/doctor.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kjor } from '../doctor/index.mjs';
import margin from '../doctor/regler/ingen-inline-margin.mjs';
import strongB from '../doctor/regler/strong-og-b.mjs';
import tokens from '../doctor/regler/admin-tokens.mjs';
import fonts from '../doctor/regler/ingen-google-fonts.mjs';
import byggetid from '../doctor/regler/malt-byggetid.mjs';
import strek from '../doctor/regler/tankestrek.mjs';
import ikkeXmenY from '../doctor/regler/ikke-x-men-y.mjs';
import sidenokkel from '../doctor/regler/sidenokkel.mjs';
import apiModultype from '../doctor/regler/api-modultype.mjs';
import dodeLenker from '../doctor/regler/dode-lenker.mjs';
import sidehode from '../doctor/regler/sidehode.mjs';
import sidestruktur from '../doctor/regler/sidestruktur.mjs';
import hardkodetArstall from '../doctor/regler/hardkodet-arstall.mjs';

const p = (filer) => ({ rot: '/x', filer });

test('inline margin paa et listeelement er en feil', () => {
  const funn = margin.sjekk(p([{ sti: 'templates/a.html', tekst: '<li data-list-item style="margin-bottom:1rem">x</li>' }]));
  assert.equal(funn.length, 1);
  assert.equal(funn[0].linje, 1);
  assert.match(funn[0].melding, /gap/);
});

test('gap i en flex-wrapper er greit', () => {
  assert.deepEqual(margin.sjekk(p([{ sti: 'a.css', tekst: '.kort-stabel{display:flex;gap:1rem}' }])), []);
});

test('strong uten b er en feil, siden Bold setter inn b foer publisering', () => {
  const funn = strongB.sjekk(p([{ sti: 'static/css/site.css', tekst: '.cv strong { color: #fff }' }]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /\bb\b/);
});

test('strong og b sammen er greit', () => {
  assert.deepEqual(strongB.sjekk(p([{ sti: 'a.css', tekst: '.cv strong, .cv b { color:#fff }' }])), []);
});

test('et klassenavn som slutter paa -b teller ikke som b-elementet', () => {
  const funn = strongB.sjekk(p([{ sti: 'a.css', tekst: '.cv strong, .cv .tab-b { color:#fff }' }]));
  assert.equal(funn.length, 1);
});

test('strong b styrer b inne i strong, ikke fritt b, og skal ikke flagges', () => {
  assert.deepEqual(strongB.sjekk(p([{ sti: 'a.css', tekst: 'strong b { color:#fff }' }])), []);
});

test('manglende admin-tokens er en feil', () => {
  const funn = tokens.sjekk(p([
    { sti: 'static/css/tokens.css', tekst: ':root{--font-brod:x}' },
    { sti: 'templates/index.html', tekst: '<h1>en side som har glemt fargene</h1>' }
  ]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /--adm-aksent/);
});

test('fem tokens definert og fila lenket fra en mal er greit', () => {
  const css = ':root{--adm-aksent:#111;--adm-flate:#222;--adm-tekst:#333;--adm-fare:#444;--adm-ok:#555}';
  assert.deepEqual(tokens.sjekk(p([
    { sti: 'static/css/tokens.css', tekst: css },
    { sti: 'templates/index.html', tekst: '<link rel="stylesheet" href="/css/tokens.css">' }
  ])), []);
});

test('tokens definert men fila aldri lenket er en feil, siden baren da kjorer paa fallback', () => {
  const css = ':root{--adm-aksent:#111;--adm-flate:#222;--adm-tekst:#333;--adm-fare:#444;--adm-ok:#555}';
  const funn = tokens.sjekk(p([
    { sti: 'static/css/tokens.css', tekst: css },
    { sti: 'templates/index.html', tekst: '<h1>ingen lenke her</h1>' }
  ]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /ingen mal lenker/);
});

test('motorens egen fallback-css teller ikke som sidens token-fil', () => {
  const css = ':root{--adm-aksent:#111;--adm-flate:#222;--adm-tekst:#333;--adm-fare:#444;--adm-ok:#555}';
  const funn = tokens.sjekk(p([
    { sti: 'editor/edit.css', tekst: css },
    { sti: 'templates/index.html', tekst: '<h1>ingen tokens-fil</h1>' }
  ]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /mangler farger/);
});

test('et prosjekt uten maler er ingen nettside, og regelen sier ingenting', () => {
  assert.deepEqual(tokens.sjekk(p([{ sti: 'build/index.mjs', tekst: 'export function build(){}' }])), []);
});

test('google fonts er en feil', () => {
  const funn = fonts.sjekk(p([{ sti: 'templates/a.html', tekst: '<link href="https://fonts.googleapis.com/css2?family=Inter">' }]));
  assert.equal(funn.length, 1);
});

test('tankestrek er et varsel, ikke en byggefeil', () => {
  assert.equal(strek.alvor, 'varsel');
  const funn = strek.sjekk(p([{ sti: 'content/index.json', tekst: '{"a":"noe — noe annet"}' }]));
  assert.equal(funn.length, 1);
});

test('manglende admin-tid.json er et varsel om at byggetiden aldri ble maalt', () => {
  const funn = byggetid.sjekk(p([{ sti: 'templates/a.html', tekst: '<h1>x</h1>' }]));
  assert.equal(byggetid.alvor, 'varsel');
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /oppskalert-admin tid/);
});

test('admin-tid.json til stede er greit', () => {
  assert.deepEqual(byggetid.sjekk(p([{ sti: 'admin-tid.json', tekst: '{"rebuildMs":48000}' }])), []);
});

test('«ikke X, men Y» flagges til gjennomlesing', () => {
  assert.equal(ikkeXmenY.alvor, 'varsel');
  const funn = ikkeXmenY.sjekk(p([{ sti: 'content/a.json', tekst: '{"a":"Det handler ikke om pris."}' }]));
  assert.equal(funn.length, 1);
});

test('en ekte motstilling flagges ogsaa, og det er meningen', () => {
  // Regelen kan ikke skille en tic fra ekte informasjon. Derfor varsel og
  // ikke feil: hvert treff skal leses, ikke rettes blindt.
  const funn = ikkeXmenY.sjekk(p([{ sti: 'content/a.json', tekst: '{"a":"Klipp 2 kommer paa en onsdag, ikke en loerdag."}' }]));
  assert.equal(funn.length, 1);
});

test('vanlig tekst uten moensteret gaar rent gjennom', () => {
  assert.deepEqual(ikkeXmenY.sjekk(p([{ sti: 'content/a.json', tekst: '{"a":"Vi tar befaring i hele Harstad."}' }])), []);
});

test('en side-noekkel som matcher malfilnavnet gaar rent gjennom', () => {
  assert.deepEqual(sidenokkel.sjekk(p([
    { sti: 'templates/om.html', tekst: '<body data-page-key="om">x</body>' }
  ])), []);
});

test('en side-noekkel som ikke matcher malfilnavnet er en feil, siden publiseringen da gaar groent uten virkning', () => {
  const funn = sidenokkel.sjekk(p([
    { sti: 'templates/om.html', tekst: '<body data-page-key="om-oss">x</body>' }
  ]));
  assert.equal(sidenokkel.alvor, 'feil');
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /content\/om-oss\.json/);
  assert.match(funn[0].melding, /content\/om\.json/);
});

const SKALL = "export { default } from 'oppskalert-admin/api/save.js';\n";

test('api-skall med ESM og uten type i package.json er en feil, siden Vercel da krasjer med ERR_REQUIRE_ESM', () => {
  const funn = apiModultype.sjekk(p([
    { sti: 'package.json', tekst: '{"name":"x"}' },
    { sti: 'api/save.js', tekst: SKALL }
  ]));
  assert.equal(apiModultype.alvor, 'feil');
  assert.equal(funn.length, 1);
  assert.equal(funn[0].linje, 1);
  assert.match(funn[0].melding, /ingen "type"/);
  assert.match(funn[0].melding, /npm pkg set type=module/);
});

test('"type": "commonjs", som npm init -y skriver, er ogsaa en feil', () => {
  const funn = apiModultype.sjekk(p([
    { sti: 'package.json', tekst: '{"type":"commonjs"}' },
    { sti: 'api/verify-pin.js', tekst: '// skall\n' + SKALL }
  ]));
  assert.equal(funn.length, 1);
  assert.equal(funn[0].linje, 2);
  assert.match(funn[0].melding, /"type": "commonjs"/);
});

test('api-skall med "type": "module" gaar rent gjennom', () => {
  assert.deepEqual(apiModultype.sjekk(p([
    { sti: 'package.json', tekst: '{"type":"module"}' },
    { sti: 'api/save.js', tekst: SKALL },
    { sti: 'static/js/meny.js', tekst: 'export const x = 1;' }
  ])), []);
});

test('et CommonJS-endepunkt i api/ med "type": "module" er en feil', () => {
  const funn = apiModultype.sjekk(p([
    { sti: 'package.json', tekst: '{"type":"module"}' },
    { sti: 'api/kontakt.js', tekst: '// bruker require() for aa sende\nmodule.exports = (req, res) => res.end();' }
  ]));
  assert.equal(funn.length, 1);
  assert.equal(funn[0].linje, 2);
});

test('CommonJS-endepunkt uten type i package.json gaar rent gjennom', () => {
  assert.deepEqual(apiModultype.sjekk(p([
    { sti: 'package.json', tekst: '{}' },
    { sti: 'api/kontakt.js', tekst: 'const x = require("x");\nmodule.exports = x;' }
  ])), []);
});

test('href="#" er en dod lenke', () => {
  const funn = dodeLenker.sjekk(p([{ sti: 'templates/a.html', tekst: '<a href="#">Les mer</a>' }]));
  assert.equal(dodeLenker.alvor, 'feil');
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /Lenke uten mål/);
});

test('tom href er en dod lenke', () => {
  const funn = dodeLenker.sjekk(p([{ sti: 'templates/a.html', tekst: '<a href="">Les mer</a>' }]));
  assert.equal(funn.length, 1);
});

test('intern lenke til en id som ikke finnes er en dod lenke', () => {
  const funn = dodeLenker.sjekk(p([{ sti: 'templates/a.html', tekst: '<a href="#priser">Priser</a><section id="tjenester"></section>' }]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /#priser/);
});

test('intern lenke til en id som finnes gaar rent gjennom', () => {
  assert.deepEqual(dodeLenker.sjekk(p([
    { sti: 'templates/a.html', tekst: '<a href="#priser">Priser</a><section id="priser"></section>' }
  ])), []);
});

test('ekstern lenke og lenke til en annen mal gaar rent gjennom', () => {
  assert.deepEqual(dodeLenker.sjekk(p([
    { sti: 'templates/a.html', tekst: '<a href="https://example.com">Ekstern</a><a href="om-oss.html">Om oss</a>' }
  ])), []);
});

test('mangler tittel, beskrivelse og favicon er tre funn', () => {
  const funn = sidehode.sjekk(p([{ sti: 'templates/index.html', tekst: '<html><head></head><body>x</body></html>' }]));
  assert.equal(sidehode.alvor, 'feil');
  assert.equal(funn.length, 3);
});

test('tittel, beskrivelse og favicon til stede gaar rent gjennom', () => {
  const head = '<title>Firma AS</title><meta name="description" content="Vi gjor jobben."><link rel="icon" href="/favicon.png">';
  assert.deepEqual(sidehode.sjekk(p([{ sti: 'templates/index.html', tekst: `<html><head>${head}</head><body>x</body></html>` }])), []);
});

test('404-siden sjekkes ogsaa, selv om malFiler hopper over den', () => {
  const funn = sidehode.sjekk(p([{ sti: 'templates/404.html', tekst: '<html><head></head><body>x</body></html>' }]));
  assert.equal(funn.length, 3);
});

test('manglende 404.html er en feil', () => {
  const funn = sidestruktur.sjekk(p([{ sti: 'templates/index.html', tekst: '<header></header>' }]));
  assert.equal(sidestruktur.alvor, 'feil');
  assert.match(funn.map((f) => f.melding).join(' '), /404/);
});

test('header uten hjemlenke er en feil', () => {
  const funn = sidestruktur.sjekk(p([
    { sti: 'templates/404.html', tekst: 'x' },
    { sti: 'templates/index.html', tekst: '<header><a href="/priser">Priser</a></header>' }
  ]));
  assert.equal(funn.length, 1);
  assert.match(funn[0].melding, /forsiden/);
});

test('header med lenke til / er greit', () => {
  assert.deepEqual(sidestruktur.sjekk(p([
    { sti: 'templates/404.html', tekst: 'x' },
    { sti: 'templates/index.html', tekst: '<header><a href="/">Logo</a></header>' }
  ])), []);
});

test('ingen header/nav i det hele tatt gir ingen funn fra hjemlenke-sjekken', () => {
  assert.deepEqual(sidestruktur.sjekk(p([
    { sti: 'templates/404.html', tekst: 'x' },
    { sti: 'templates/index.html', tekst: '<main>x</main>' }
  ])), []);
});

test('hardkodet aarstall ved © er et varsel', () => {
  const funn = hardkodetArstall.sjekk(p([{ sti: 'templates/index.html', tekst: '<footer>© 2024 Firma AS</footer>' }]));
  assert.equal(hardkodetArstall.alvor, 'varsel');
  assert.equal(funn.length, 1);
});

test('&copy; med aarstall telles ogsaa', () => {
  const funn = hardkodetArstall.sjekk(p([{ sti: 'templates/index.html', tekst: '<footer>&copy; 2026 Firma AS</footer>' }]));
  assert.equal(funn.length, 1);
});

test('aarstall satt av JS gaar rent gjennom', () => {
  assert.deepEqual(hardkodetArstall.sjekk(p([
    { sti: 'templates/index.html', tekst: '<footer>© <span id="ar"></span> Firma AS</footer><script>document.getElementById("ar").textContent = new Date().getFullYear();</script>' }
  ])), []);
});

test('kjor skiller feil fra varsler', () => {
  const res = kjor(
    p([{ sti: 'content/a.json', tekst: '{"a":"x — y"}' }, { sti: 'templates/a.html', tekst: '<li data-list-item style="margin:1rem">x</li>' }]),
    [margin, strek]
  );
  assert.equal(res.feil.length, 1);
  assert.equal(res.varsler.length, 1);
});
