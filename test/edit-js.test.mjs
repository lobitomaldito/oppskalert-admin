import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const js = readFileSync(new URL('../editor/edit.js', import.meta.url), 'utf8');

test('ingen kall til det fjernede save-image-endepunktet', () => {
  assert.equal(js.includes('/api/save-image'), false);
});

test('ingen chat-kode i pakken, siden endepunktet og stilarket ikke finnes', () => {
  assert.equal(/CHAT_PAA|data-admin-chat|\/api\/chat/.test(js), false);
});

test('publisering sender bilder sammen med teksten', () => {
  assert.match(js, /bilder:\s*ventendeBilder/);
});

test('PIN verifiseres mot server foer editoren bygges', () => {
  assert.match(js, /verifyPin\(storedPin\)/);
});

test('ES5-nivaa: ingen pilfunksjoner, let eller const', () => {
  const utenKommentarer = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/=>/.test(utenKommentarer), false, 'pilfunksjon funnet');
  assert.equal(/\b(let|const)\s/.test(utenKommentarer), false, 'let eller const funnet');
});

test('ingen tankestrek i fila', () => {
  assert.equal(js.includes('—'), false);
});

test('et trykk paa en samlingslenke navigerer ikke bort under redigering', () => {
  assert.match(js, /closest\('\[data-samling-lenke\]'\)\) e\.preventDefault\(\)/);
});

test('avif og heic kan velges og gjoeres alltid om til jpg foer opplasting', () => {
  assert.match(js, /fileInput\.accept = '[^']*\.avif[^']*\.heic/);
  assert.match(js, /TIL_JPG = \/\^image\\\/\(avif\|heic\|heif\)\$/);
  assert.match(js, /if \(!tilJpg && Math\.max\(sw, sh\) <= 1800/);
});

// Henter en funksjon ut av edit.js og kjoerer den alene. Hele fila kan ikke
// kjoeres i node, editoren bygges foerst etter en PIN-sjekk mot serveren.
function funksjon(navn, globale = {}) {
  const start = js.indexOf('function ' + navn + '(');
  const slutt = js.indexOf('\n  }\n', start) + 4;
  return vm.runInNewContext(js.slice(start, slutt) + '; ' + navn, globale);
}

test('png blir jpg naar bildet ikke har gjennomsiktige piksler', () => {
  const harAlfa = funksjon('harAlfa');
  assert.equal(harAlfa([10, 20, 30, 255, 40, 50, 60, 255]), false);
  assert.equal(harAlfa([10, 20, 30, 255, 40, 50, 60, 254]), true);
  assert.equal(harAlfa([0, 0, 0, 0]), true);
  assert.match(js, /isPng && harAlfa\(ctx\.getImageData\(0, 0, w, h\)\.data\) \? 'image\/png' : 'image\/jpeg'/);
  assert.match(js, /if \(!isPng\) \{ ctx\.fillStyle = '#fff'; ctx\.fillRect\(0, 0, w, h\); \}\s*ctx\.drawImage/);
});

test('ett bilde over grensen er for stort, mange smaa er for mange', () => {
  const koeFeil = funksjon('koeFeil', { MAKS_KOE: 100 });
  assert.equal(koeFeil(50, 0), '');
  assert.equal(koeFeil(100, 0), '');
  assert.match(koeFeil(101, 0), /^✗ Bildet er for stort\./);
  assert.match(koeFeil(101, 40), /^✗ Bildet er for stort\./);
  assert.match(koeFeil(60, 60), /^✗ For mange bilder på én gang\./);
  assert.match(js, /var feil = koeFeil\(Math\.floor\(String\(data\)\.length \* 3 \/ 4\), koeStorrelse\(\)\);/);
});

test('skjul-knappen har ord, ikke oeye-ikon, og fjerning spoer foerst', () => {
  assert.equal(/👁|🙈/.test(js), false);
  assert.match(js, /'Vis' : 'Skjul'/);
  assert.match(js, /a === 'del'[^;]*window\.confirm/);
});

test('Enter i et avsnitt eller en overskrift gir linjeskift, ikke <div>', () => {
  const flatBlokker = funksjon('flatBlokker');
  assert.equal(
    flatBlokker('Kjøp kurs.&nbsp; &nbsp;&nbsp;<div>Reformer har egne priser.&nbsp;</div>'),
    'Kjøp kurs.<br>Reformer har egne priser.&nbsp;'
  );
  assert.equal(flatBlokker('Klippekort og&nbsp;<div>drop-in</div>'), 'Klippekort og<br>drop-in');
  assert.equal(flatBlokker('<div>En</div><div><br></div><div>To</div>'), 'En<br><br>To');
  assert.equal(flatBlokker('Uten blokker <strong>her</strong>'), 'Uten blokker <strong>her</strong>');
  assert.match(js, /normalizeHtml\(cleanFieldHtml\(el\)\.trim\(\), el\)/);
  assert.match(js, /execCommand\('insertLineBreak'\)/);
});

// Cécile Moroni 27.11.2026: tjenestekortene paa forsiden er lenker. Under
// redigering navigerte et trykk paa teksten eller paa overlegget over bildet
// bort fra siden, og det som ikke var publisert forsvant.
test('et trykk i en lenke rundt et listeelement navigerer aldri under redigering', async () => {
  const { parse } = await import('node-html-parser');
  const lenkeTrykk = funksjon('lenkeTrykk');
  const dom = parse(`
    <ul data-editable-list="kort">
      <li data-list-item><a class="kort" href="/stand-up"><img data-list-image-field="bilde"><span data-list-field="tittel">Stand-up</span><i class="overlegg"></i></a></li>
    </ul>
    <a id="rundt" href="/x"><div data-list-item><img data-list-image-field="b"><b data-list-field="t">T</b></div></a>
    <div data-list-item><a id="les" href="/y">Les mer</a></div>
    <a id="knapp" href="/z"><span data-edit="cta">Bestill</span></a>
    <a id="vanlig" href="/w">Vanlig lenke</a>`);
  const lister = dom.querySelectorAll('[data-editable-list]');
  const kort = dom.querySelector('a.kort');
  // Bli paa siden uten bildemeny. Svaret kommer fra en annen vm-kontekst, derfor ikke deepEqual.
  const blir = (t) => { const s = lenkeTrykk(t, lister); assert.ok(s); assert.equal(s.bilde, null); };

  // Overlegget (eller selve lenken, som er maalet naar a::after tar klikket): bildemenyen.
  assert.equal(lenkeTrykk(dom.querySelector('.overlegg'), lister).bilde, kort.querySelector('img'));
  assert.equal(lenkeTrykk(kort, lister).bilde, kort.querySelector('img'));
  assert.equal(lenkeTrykk(kort.querySelector('img'), lister).bilde, kort.querySelector('img'));
  // Teksten: bli paa siden, ingen bildemeny, saa markoeren havner i teksten.
  blir(kort.querySelector('span'));
  // En lenke rundt et element utenfor en aktiv liste: bli, men ingen meny.
  blir(dom.querySelector('#rundt img'));
  // Lenke inne i et element uten bilde, og tekstfelt i en knapp: bli paa siden.
  blir(dom.querySelector('#les'));
  blir(dom.querySelector('#knapp span'));
  // En vanlig lenke rores ikke.
  assert.equal(lenkeTrykk(dom.querySelector('#vanlig'), lister), null);
  // Klikkvakten bruker svaret og stopper navigasjonen.
  assert.match(js, /var lt = e\.target\.closest && lenkeTrykk\(e\.target, listContainers\);\s*if \(lt\) \{\s*e\.preventDefault\(\);/);
});
