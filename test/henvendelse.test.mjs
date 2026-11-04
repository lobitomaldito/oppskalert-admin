// test/henvendelse.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import henvendelse, { nullstill } from '../api/henvendelse.js';

function lagRes() {
  const r = { kode: 0, kropp: null, til: null };
  r.status = (k) => { r.kode = k; return r; };
  r.json = (b) => { r.kropp = b; return r; };
  r.redirect = (k, url) => { r.kode = k; r.til = url; return r; };
  return r;
}
const lagReq = (body, { metode = 'POST', ip = '9.9.9.9', json = true } = {}) => ({
  method: metode, body,
  headers: { 'x-vercel-forwarded-for': ip, accept: json ? 'application/json' : 'text/html', host: 'gunndemo.oppskalert.no' },
  socket: {}
});
const gyldig = (ekstra = {}) => ({ skjema: 'Bestilling', navn: 'Kari Nordmann', epost: 'kari@example.no', melding: 'Hei', ...ekstra });

let sendt;
const ekteFetch = globalThis.fetch;
beforeEach(() => {
  nullstill();
  sendt = [];
  process.env.RESEND_API_KEY = 're_test';
  process.env.AVSENDER_EPOST = 'skjema@oppskalert.no';
  process.env.KONTAKT_EPOST = 'gunn@example.no';
  delete process.env.SIDENAVN;
  globalThis.fetch = async (url, opt) => { sendt.push({ url, kropp: JSON.parse(opt.body), opt }); return { ok: true, status: 200, text: async () => '' }; };
});
afterEach(() => { globalThis.fetch = ekteFetch; });

test('gyldig henvendelse sendes til kunden med svar-til avsenderen', async () => {
  const res = lagRes();
  await henvendelse(lagReq(gyldig({ tjeneste: 'Fotsoneterapi', dag: 'Torsdag 6. november', tid: '10.00' })), res);
  assert.deepEqual([res.kode, res.kropp], [200, { ok: true }]);
  assert.equal(sendt.length, 1);
  const m = sendt[0].kropp;
  assert.equal(sendt[0].url, 'https://api.resend.com/emails');
  assert.equal(sendt[0].opt.headers.Authorization, 'Bearer re_test');
  assert.deepEqual(m.to, ['gunn@example.no']);
  assert.equal(m.reply_to, 'kari@example.no');
  assert.equal(m.from, 'gunndemo.oppskalert.no <skjema@oppskalert.no>');
  assert.equal(m.subject, 'Bestilling fra nettsiden: Kari Nordmann');
  assert.match(m.text, /Tjeneste: Fotsoneterapi/);
  assert.match(m.text, /Dag: Torsdag 6\. november/);
  assert.match(m.text, /\n\nHei$/);
});

test('flere mottakere i KONTAKT_EPOST, skilt med komma', async () => {
  process.env.KONTAKT_EPOST = 'gunn@example.no, meg@example.no,';
  await henvendelse(lagReq(gyldig()), lagRes());
  assert.deepEqual(sendt[0].kropp.to, ['gunn@example.no', 'meg@example.no']);
});

test('SIDENAVN styrer navnet i Fra-feltet', async () => {
  process.env.SIDENAVN = 'Gunn K. Finnby';
  await henvendelse(lagReq(gyldig()), lagRes());
  assert.equal(sendt[0].kropp.from, 'Gunn K. Finnby <skjema@oppskalert.no>');
});

test('telefon holder som kontaktvei uten e-post, og svar-til utelates', async () => {
  const res = lagRes();
  await henvendelse(lagReq({ navn: 'Ola', telefon: '404 12 836' }), res);
  assert.equal(res.kode, 200);
  assert.equal(sendt[0].kropp.reply_to, undefined);
  assert.equal(sendt[0].kropp.subject, 'Henvendelse fra nettsiden: Ola');
});

test('mangler navn eller kontaktvei gir 400 og sender ingenting', async () => {
  for (const kropp of [{ epost: 'a@b.no' }, { navn: 'Ola' }]) {
    const res = lagRes();
    await henvendelse(lagReq(kropp), res);
    assert.equal(res.kode, 400);
  }
  assert.equal(sendt.length, 0);
});

test('ugyldig e-post gir 400', async () => {
  const res = lagRes();
  await henvendelse(lagReq(gyldig({ epost: 'ikke-en-adresse' })), res);
  assert.equal(res.kode, 400);
  assert.match(res.kropp.feil, /e-post/i);
});

test('honningkrukka svarer ok og sender ingenting', async () => {
  const res = lagRes();
  await henvendelse(lagReq(gyldig({ nettside: 'http://spam.example' })), res);
  assert.equal(res.kode, 200);
  assert.equal(sendt.length, 0);
});

test('utfylt raskere enn tre sekunder regnes som robot', async () => {
  // _t er millisekunder siden skjemaet ble aapnet, maalt i nettleseren. Et
  // tidsstempel ville gjort en klient med klokka for langt fram til en robot.
  const res = lagRes();
  await henvendelse(lagReq(gyldig({ _t: '500' })), res);
  assert.equal(res.kode, 200);
  assert.equal(sendt.length, 0);
  await henvendelse(lagReq(gyldig({ _t: '8000' })), lagRes());
  assert.equal(sendt.length, 1);
});

test('linjeskift i navnet kan ikke lage nye linjer i emnet', async () => {
  await henvendelse(lagReq(gyldig({ navn: 'Kari\r\nBcc: x@y.no' })), lagRes());
  assert.doesNotMatch(sendt[0].kropp.subject, /[\r\n]/);
});

test('ukjente feltnavn med rare tegn droppes, og antall felt har tak', async () => {
  const mange = {};
  for (let i = 0; i < 40; i++) mange[`felt${i}`] = 'x';
  await henvendelse(lagReq(gyldig({ 'ond<script>': 'x', ...mange })), lagRes());
  const t = sendt[0].kropp.text;
  assert.doesNotMatch(t, /script/);
  assert.ok((t.match(/^Felt\d+:/gm) || []).length <= 20);
});

test('sjette innsending fra samme IP innen ti minutter gir 429', async () => {
  for (let i = 0; i < 5; i++) await henvendelse(lagReq(gyldig()), lagRes());
  const res = lagRes();
  await henvendelse(lagReq(gyldig()), res);
  assert.equal(res.kode, 429);
  assert.equal(sendt.length, 5);
  const annen = lagRes();
  await henvendelse(lagReq(gyldig(), { ip: '8.8.8.8' }), annen);
  assert.equal(annen.kode, 200);
});

test('manglende miljøvariabler gir 500 og sender ingenting', async () => {
  delete process.env.KONTAKT_EPOST;
  const res = lagRes();
  await henvendelse(lagReq(gyldig()), res);
  assert.equal(res.kode, 500);
  assert.match(res.kropp.feil, /ikke satt opp/);
  assert.equal(sendt.length, 0);
});

test('Resend feiler: 502', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => 'domain not verified' });
  const res = lagRes();
  await henvendelse(lagReq(gyldig()), res);
  assert.equal(res.kode, 502);
});

test('uten JavaScript: 303 tilbake til siden med anker, også ved feil', async () => {
  const ok = lagRes();
  await henvendelse(lagReq(gyldig({ _retur: '/kontakt' }), { json: false }), ok);
  assert.deepEqual([ok.kode, ok.til], [303, '/kontakt#skjema-sendt']);
  const feil = lagRes();
  await henvendelse(lagReq({ navn: 'Ola' }, { json: false, ip: '7.7.7.7' }), feil);
  assert.deepEqual([feil.kode, feil.til], [303, '/#skjema-feil']);
});

test('retur til en annen side enn vår egen avvises', async () => {
  for (const retur of ['//ond.example/', 'https://ond.example/', 'javascript:alert(1)']) {
    const res = lagRes();
    await henvendelse(lagReq(gyldig({ _retur: retur }), { json: false, ip: retur }), res);
    assert.equal(res.til, '/#skjema-sendt');
  }
});

test('GET gir 405', async () => {
  const res = lagRes();
  await henvendelse(lagReq({}, { metode: 'GET' }), res);
  assert.equal(res.kode, 405);
});
