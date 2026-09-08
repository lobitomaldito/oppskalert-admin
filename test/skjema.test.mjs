// test/skjema.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../build/index.mjs';
import { lagSlug } from '../build/samling.mjs';

const js = readFileSync(new URL('../editor/skjema.js', import.meta.url), 'utf8');
const editJs = readFileSync(new URL('../editor/edit.js', import.meta.url), 'utf8');

function lagProsjekt() {
  const rot = mkdtempSync(join(tmpdir(), 'oa-skjema-'));
  mkdirSync(join(rot, 'templates'));
  mkdirSync(join(rot, 'content'));
  mkdirSync(join(rot, 'static', 'css'), { recursive: true });
  writeFileSync(join(rot, 'templates', 'index.html'), '<html><body><h1 data-edit="t">Standard</h1></body></html>');
  writeFileSync(join(rot, 'content', 'index.json'), JSON.stringify({ t: 'Bakt' }));
  writeFileSync(join(rot, 'static', 'css', 'site.css'), 'body{margin:0}');
  return rot;
}

test('ES5-nivaa: ingen pilfunksjoner, let eller const, ingen template literals utenfor kommentarer', () => {
  const utenKommentarer = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/=>/.test(utenKommentarer), false, 'pilfunksjon funnet');
  assert.equal(/\b(let|const)\s/.test(utenKommentarer), false, 'let eller const funnet');
  assert.equal(/`/.test(utenKommentarer), false, 'template literal funnet');
});

test('ingen tankestrek i fila', () => {
  assert.equal(js.includes('—'), false);
});

test('knappen bygges bak en sjekk paa [data-samling]', () => {
  const vakt = js.indexOf("querySelector('[data-samling]')");
  assert.ok(vakt >= 0, 'fant ingen sjekk paa [data-samling]');

  const lagKnapp = js.indexOf("createElement('button')");
  assert.ok(lagKnapp >= 0, 'fant ikke stedet knappen lages');
  assert.ok(vakt < lagKnapp, 'samlingssjekken maa staa foer knappen lages');

  // Ingen samling paa siden gir ingen knapp i det hele tatt, ikke en skjult en.
  const start = js.slice(js.indexOf('function start'), lagKnapp);
  assert.match(start, /if\s*\(!navn\)\s*return;/, 'mangler tidlig retur naar siden ikke har en samling');
  assert.equal(/hidden\s*=\s*true/.test(start), false, 'knappen skal utelates, ikke skjules');
});

test('overlegget legges paa document.body, utenfor redigeringsomraadet', () => {
  assert.match(js, /document\.body\.appendChild\(overlegg\)/);
  // editRegion() i edit.js er <main>. Overlegget maa aldri havne der inne,
  // for Angre bytter hele innerHTML i det omraadet.
  assert.equal(/querySelector\(['"]main['"]\)/.test(js), false, 'overlegget maa ikke bygges inne i <main>');
});

test('bildet bruker motorens egen prepImage, ikke en kopi', () => {
  assert.equal(/function prepImage/.test(js), false, 'skjema.js definerer sin egen prepImage');
  assert.match(js, /window\.oppskalertAdmin/, 'henter ikke verktoeyet edit.js deler');
  assert.match(js, /\bv\.prepImage\(/, 'kaller ikke den delte prepImage');
  // Bildet skal legges i koe og reise med publiseringen, aldri lastes opp for seg.
  assert.match(js, /ventendeBilder = \[\{ sti: 'static\/assets\/uploads\/'/);
});

test('edit.js deler prepImage og sier fra naar baren staar', () => {
  assert.match(editJs, /window\.oppskalertAdmin\s*=/);
  assert.match(editJs, /prepImage:\s*prepImage/);
  assert.match(editJs, /dispatchEvent\(new Event\('adm:klar'\)\)/);
});

test('publiseringen sender tom edits, bildekoeen og samlingen til /api/save', () => {
  assert.match(js, /fetch\(['"]\/api\/save['"]/);
  assert.match(js, /edits:\s*\{\}/);
  assert.match(js, /bilder:\s*ventendeBilder/);
  assert.match(js, /samling:\s*\{\s*navn:/);
});

test('innlegget baerer feltene serveren og bygget venter seg', () => {
  ['slug', 'tittel', 'ingress', 'brodtekst', 'bilde', 'dato', '_kladd'].forEach((felt) => {
    assert.match(js, new RegExp('\\b' + felt + ':'), 'mangler feltet ' + felt);
  });
});

// skjema.js sin lagSlug er en ES5-tvilling av lagSlug i build/samling.mjs.
// To implementasjoner av samme regel driver fra hverandre om ingen sammenligner
// dem. Her hentes selve funksjonskroppen ut av kildeteksten og kjoeres, saa en
// retting i den ene uten den andre gir en roed test i stedet for to slugger som
// stille peker paa hver sin fil.
function hentLagSlug(kilde) {
  const treff = kilde.match(/\n {2}function lagSlug\(tittel\) \{\n([\s\S]*?)\n {2}\}\n/);
  assert.ok(treff, 'fant ikke lagSlug i editor/skjema.js');
  return new Function('tittel', treff[1]);
}

test('lagSlug i skjema.js gir samme slug som lagSlug i build/samling.mjs', () => {
  const klient = hentLagSlug(js);
  const titler = [
    'Ærlig øl på Åsen!',
    '  --Hei--  ',
    '',
    'Blåbær & fløte, 2026',
    'Nytt   innlegg   om   ØL',
    '???',
    'Vår 2026: Åpent hus på Grünerløkka'
  ];
  titler.forEach((tittel) => {
    assert.equal(klient(tittel), lagSlug(tittel), 'ulik slug for tittelen ' + JSON.stringify(tittel));
  });
});

test('lagSlug i skjema.js gir de forventede sluggene', () => {
  const klient = hentLagSlug(js);
  assert.equal(klient('Ærlig øl på Åsen!'), 'aerlig-oel-paa-aasen');
  assert.equal(klient('  --Hei--  '), 'hei');
  assert.equal(klient(''), 'innlegg');
  assert.equal(klient('???'), 'innlegg');
});

// Innleggsfeltene er HTML: build/index.mjs setter dem inn med set_content(),
// som er raa innsetting. Skjemaet leser ren tekst ut av <input>/<textarea>, og
// maa derfor selv lage gyldig, escaped HTML. Samme uttrekksgrep som for
// lagSlug: funksjonskroppen hentes ut av kildeteksten og kjoeres.
function hentKropp(kilde, navn) {
  const re = new RegExp('\\n {2}function ' + navn + '\\(tekst\\) \\{\\n([\\s\\S]*?)\\n {2}\\}\\n');
  const treff = kilde.match(re);
  assert.ok(treff, 'fant ikke ' + navn + ' i editor/skjema.js');
  return treff[1];
}

function hentTekstTilHtml(kilde) {
  return new Function('tekst',
    'function escapeHtml(tekst) {' + hentKropp(kilde, 'escapeHtml') + '}\n' + hentKropp(kilde, 'tekstTilHtml'));
}

test('brodteksten deles i avsnitt: to avsnitt gir to <p>', () => {
  const tilHtml = hentTekstTilHtml(js);
  assert.equal(tilHtml('Foerste avsnitt.\n\nAndre avsnitt.'),
    '<p>Foerste avsnitt.</p><p>Andre avsnitt.</p>');
  // Flere tomme linjer paa rad er fortsatt ett skille, ikke tomme avsnitt.
  assert.equal(tilHtml('A\n\n\n\nB'), '<p>A</p><p>B</p>');
  // Enkelt linjeskift inne i et avsnitt overlever som <br>.
  assert.equal(tilHtml('Linje en\nLinje to'), '<p>Linje en<br>Linje to</p>');
  assert.equal(tilHtml('   '), '');
  assert.equal(tilHtml(''), '');
});

test('brodteksten escapes: <, & og > kommer ut som synlig tekst', () => {
  const tilHtml = hentTekstTilHtml(js);
  assert.equal(tilHtml('A & <b>test</b>'), '<p>A &amp; &lt;b&gt;test&lt;/b&gt;</p>');
  // & FOERST, ellers escaper vi vaar egen escaping: &lt; skal ikke bli &amp;lt;
  assert.equal(tilHtml('<script>alert(1)</script>'),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.doesNotMatch(tilHtml('<script>x</script>'), /<script/);
  // Skrev klienten selv "&lt;", er det fire tegn hun vil se paa siden, og de
  // maa escapes en gang til for aa overleve som tekst.
  assert.equal(tilHtml('a &lt; b'), '<p>a &amp;lt; b</p>');
  // & foerst: escapes < foer &, kommer et enkelt < ut som &amp;lt; og vises
  // som teksten "&lt;" i stedet for som "<".
  assert.equal(tilHtml('a < b'), '<p>a &lt; b</p>');
});

test('tittel og ingress escapes ogsaa, de settes inn med samme raa set_content', () => {
  const escape = new Function('tekst', hentKropp(js, 'escapeHtml'));
  assert.equal(escape('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escape('Bygg & anlegg'), 'Bygg &amp; anlegg');
  assert.equal(escape(''), '');
  // Feltene i innlegget skal gaa gjennom en av de to funksjonene, aldri raatt.
  assert.match(js, /tittel: escapeHtml\(/);
  assert.match(js, /ingress: escapeHtml\(/);
  assert.match(js, /brodtekst: tekstTilHtml\(/);
});

test('escape-lytteren fjernes igjen naar overlegget lukkes', () => {
  assert.match(js, /document\.addEventListener\('keydown', paaEscape\)/);
  const lukk = js.slice(js.indexOf('function lukk()'), js.indexOf('function apne('));
  assert.match(lukk, /document\.removeEventListener\('keydown', paaEscape\)/,
    'lukk() lar lytteren staa igjen, en per aapning');
});

test('Cmd/Ctrl+Z i edit.js lar INPUT og TEXTAREA beholde nettleserens tekst-angre', () => {
  const gren = editJs.slice(editJs.indexOf("e.key === 'z'"));
  const unntak = gren.slice(0, gren.indexOf('e.preventDefault()'));
  assert.match(unntak, /tagName === 'INPUT'/, 'INPUT er ikke unntatt foer preventDefault');
  assert.match(unntak, /tagName === 'TEXTAREA'/, 'TEXTAREA er ikke unntatt foer preventDefault');
  assert.match(unntak, /isContentEditable/, 'contenteditable er ikke lenger unntatt');
});

test('forhaandsvisningen kan faktisk skjules: [hidden] staar etter display:block', () => {
  const blokk = js.indexOf('.adm-skjema__bilde{display:block');
  const skjult = js.indexOf('.adm-skjema__bilde[hidden]{display:none}');
  assert.ok(blokk >= 0, 'fant ikke regelen for forhaandsvisningen');
  assert.ok(skjult >= 0, 'display:block slaar [hidden] uten en egen regel');
  assert.ok(blokk < skjult, '[hidden]-regelen maa staa sist for aa vinne ved lik spesifisitet');
});

test('skjema.js havner i dist/admin etter et bygg', () => {
  const rot = lagProsjekt();
  build({ rot });
  assert.ok(existsSync(join(rot, 'dist', 'admin', 'skjema.js')));
});
