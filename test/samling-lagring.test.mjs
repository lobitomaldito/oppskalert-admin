// test/samling-lagring.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { flett } from '../api/_samling.mjs';
import save from '../api/save.js';
import { nullstill } from '../api/_rateLimit.mjs';

function lagRes() {
  const r = { kode: 0, kropp: null };
  r.status = (k) => { r.kode = k; return r; };
  r.json = (b) => { r.kropp = b; return r; };
  return r;
}
const lagReq = (body, metode = 'POST') => ({
  method: metode, body, headers: { 'x-forwarded-for': '9.9.9.9' }, socket: {}
});

// Falsk GitHub for de testene som skal helt gjennom til commitFiler(). Samler
// kallene saa vi kan sjekke at samlingsfila havner i SAMME tre som resten.
function falskGitHub(svar) {
  const kall = [];
  const hent = async (url, init) => {
    kall.push({ url, metode: init?.method || 'GET', kropp: init?.body ? JSON.parse(init.body) : null });
    const nokkel = Object.keys(svar).find((k) => url.includes(k));
    const v = svar[nokkel];
    if (v === 'IKKE_FUNNET') return { ok: false, status: 404, text: async () => 'Not Found' };
    return { ok: true, status: 200, text: async () => JSON.stringify(v ?? {}) };
  };
  return { hent, kall };
}

beforeEach(() => {
  nullstill();
  process.env.ADMIN_PIN = 'hemmelig';
  process.env.GITHUB_REPO = 'meg/side';
  process.env.GITHUB_TOKEN = 'token';
});

let opprinneligFetch;
beforeEach(() => { opprinneligFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = opprinneligFetch; });

// --- flett(): rene enhetstester ---

test('flett legger et nytt innlegg foerst naar slugen ikke finnes fra foer', () => {
  const res = flett([{ slug: 'gammel', tittel: 'A' }], { slug: 'ny', tittel: 'B' });
  assert.deepEqual(res, [{ slug: 'ny', tittel: 'B' }, { slug: 'gammel', tittel: 'A' }]);
});

test('flett erstatter kjent slug paa plassen sin, uten aa flytte den til start', () => {
  const res = flett(
    [{ slug: 'a', tittel: '1' }, { slug: 'b', tittel: '2' }, { slug: 'c', tittel: '3' }],
    { slug: 'b', tittel: 'oppdatert' }
  );
  assert.deepEqual(res, [
    { slug: 'a', tittel: '1' },
    { slug: 'b', tittel: 'oppdatert' },
    { slug: 'c', tittel: '3' }
  ]);
});

test('flett bevarer alle andre felt paa uroerte innlegg naar ett annet erstattes', () => {
  const res = flett(
    [
      { slug: 'a', tittel: '1', bilde: 'x.jpg', dato: '2026-01-01' },
      { slug: 'b', tittel: '2' }
    ],
    { slug: 'b', tittel: 'ny' }
  );
  assert.deepEqual(res[0], { slug: 'a', tittel: '1', bilde: 'x.jpg', dato: '2026-01-01' });
  assert.deepEqual(res[1], { slug: 'b', tittel: 'ny' });
});

test('flett behandler en naavaerende som ikke er en tabell som tom', () => {
  assert.deepEqual(flett(null, { slug: 'x' }), [{ slug: 'x' }]);
  assert.deepEqual(flett(undefined, { slug: 'x' }), [{ slug: 'x' }]);
  assert.deepEqual(flett({ ikke: 'en liste' }, { slug: 'x' }), [{ slug: 'x' }]);
});

test('to fletter etter hverandre beholder begge innleggene', () => {
  let liste = flett([], { slug: 'foerste', tittel: 'A' });
  liste = flett(liste, { slug: 'andre', tittel: 'B' });
  assert.deepEqual(liste, [
    { slug: 'andre', tittel: 'B' },
    { slug: 'foerste', tittel: 'A' }
  ]);
});

// --- api/save.js: validering ---

test('save avviser ugyldig navn paa samlingen med 400', async () => {
  const res = lagRes();
  await save(lagReq({
    page: 'index', pin: 'hemmelig', edits: {},
    samling: { navn: '', innlegg: { slug: 'gyldig-slug' } }
  }), res);
  assert.equal(res.kode, 400);
  assert.match(res.kropp.error, /navn/i);
});

test('save avviser ugyldig slug i samlingens innlegg med 400', async () => {
  const res = lagRes();
  await save(lagReq({
    page: 'index', pin: 'hemmelig', edits: {},
    samling: { navn: 'aktuelt', innlegg: { slug: 'Ugyldig Slug!' } }
  }), res);
  assert.equal(res.kode, 400);
  assert.match(res.kropp.error, /slug/i);
});

test('save avviser samling uten innlegg-objekt med 400, i stedet for aa krasje', async () => {
  const res = lagRes();
  await save(lagReq({
    page: 'index', pin: 'hemmelig', edits: {},
    samling: { navn: 'aktuelt' }
  }), res);
  assert.equal(res.kode, 400);
});

// trygSidenavn STRIPPER ulovlige tegn, den avviser dem ikke. Brukt paa
// samling.navn ville et mellomrom eller en & blitt stille fjernet, og
// publiseringen skrevet til en ANNEN fil enn den [data-samling] paa siden
// faktisk peker paa. slugErGyldig avviser i stedet, saa et slikt navn gir 400
// i stedet for et "vellykket" publisert innlegg som aldri dukker opp.
test('save avviser et samlingsnavn med mellomrom med 400, i stedet for aa skrive til feil fil', async () => {
  const res = lagRes();
  await save(lagReq({
    page: 'index', pin: 'hemmelig', edits: {},
    samling: { navn: 'aktuelt nytt', innlegg: { slug: 'gyldig-slug' } }
  }), res);
  assert.equal(res.kode, 400);
  assert.match(res.kropp.error, /navn/i);
});

// --- api/save.js: hele veien gjennom, med falsk GitHub ---

test('samlingen havner i samme commit som edits og bilder', async () => {
  const gammeltInnhold = Buffer.from(JSON.stringify({ tittel: 'Gammel' })).toString('base64');
  const gammelSamling = Buffer.from(JSON.stringify([{ slug: 'gammel-post', tittel: 'Gammel post' }])).toString('base64');
  const { hent, kall } = falskGitHub({
    'contents/content/aktuelt.json': { content: gammeltInnhold },
    'contents/content/samlinger/aktuelt.json': { content: gammelSamling },
    'git/ref/heads/main': { object: { sha: 'HEAD1' } },
    'git/commits/HEAD1': { tree: { sha: 'TRE0' } },
    'git/trees': { sha: 'TRE1' },
    'git/commits': { sha: 'COMMIT1' },
    'git/refs/heads/main': {}
  });
  globalThis.fetch = hent;

  const res = lagRes();
  await save(lagReq({
    page: 'aktuelt', pin: 'hemmelig', edits: { tittel: 'Ny tittel' },
    samling: { navn: 'aktuelt', innlegg: { slug: 'ny-post', tittel: 'Ny post' } }
  }), res);

  assert.equal(res.kode, 200);
  const commitKall = kall.filter((k) => k.url.endsWith('git/commits') && k.metode === 'POST');
  assert.equal(commitKall.length, 1);
  const tre = kall.find((k) => k.url.endsWith('git/trees')).kropp;
  const stier = tre.tree.map((t) => t.path);
  assert.ok(stier.includes('content/aktuelt.json'));
  assert.ok(stier.includes('content/samlinger/aktuelt.json'));

  const samlingBlob = tre.tree.find((t) => t.path === 'content/samlinger/aktuelt.json');
  const flettet = JSON.parse(samlingBlob.content);
  assert.deepEqual(flettet, [
    { slug: 'ny-post', tittel: 'Ny post' },
    { slug: 'gammel-post', tittel: 'Gammel post' }
  ]);
});

// Skjemaet lager slugen fra tittelen uten aa kjenne de andre innleggene i
// samlingen (se editor/skjema.js). Kolliderer den likevel, skal flett() sin
// "kjent slug"-gren ALDRI treffe: det ville byttet ut et helt annet innlegg
// med det nye, stille. Kollisjonen skal i stedet gi et NYTT innlegg med en
// deconfliktert slug (-2), akkurat som lagSlug() sitt eget kollisjonsmoenster.
test('publisering med en slug som allerede finnes gir -2, i stedet for aa overskrive det gamle innlegget', async () => {
  const gammelSamling = Buffer.from(JSON.stringify([{ slug: 'nyhet', tittel: 'Forste nyhet' }])).toString('base64');
  const gh = falskGitHub({
    'contents/content/aktuelt.json': 'IKKE_FUNNET',
    'contents/content/samlinger/aktuelt.json': { content: gammelSamling },
    'git/ref/heads/main': { object: { sha: 'HEAD1' } },
    'git/commits/HEAD1': { tree: { sha: 'TRE0' } },
    'git/trees': { sha: 'TRE1' },
    'git/commits': { sha: 'COMMIT1' },
    'git/refs/heads/main': {}
  });
  globalThis.fetch = gh.hent;

  const res = lagRes();
  await save(lagReq({
    page: 'aktuelt', pin: 'hemmelig', edits: {},
    samling: { navn: 'aktuelt', innlegg: { slug: 'nyhet', tittel: 'Andre nyhet, samme tittel' } }
  }), res);

  assert.equal(res.kode, 200);
  const tre = gh.kall.find((k) => k.url.endsWith('git/trees')).kropp;
  const samlingBlob = tre.tree.find((t) => t.path === 'content/samlinger/aktuelt.json');
  const flettet = JSON.parse(samlingBlob.content);
  assert.equal(flettet.length, 2, 'det gamle innlegget skal fortsatt vaere med, ikke overskrevet');
  assert.equal(flettet[0].slug, 'nyhet-2');
  assert.equal(flettet[0].tittel, 'Andre nyhet, samme tittel');
  assert.deepEqual(flettet[1], { slug: 'nyhet', tittel: 'Forste nyhet' });
});

// lesFil() gir null naar fila ikke finnes enda, men kaster aldri paa gyldig
// JSON som ikke er en liste (f.eks. en "{}" noen har lagt inn for haand paa
// GitHub). Den formen skal avvises, ikke stille behandles som en tom samling:
// det ville slettet alle eksisterende innlegg i neste commit.
test('en samlingsfil som finnes men ikke er en tabell gir 500, i stedet for aa slette alt som stod der', async () => {
  const oedelagtSamling = Buffer.from(JSON.stringify({})).toString('base64');
  const gh = falskGitHub({
    'contents/content/aktuelt.json': 'IKKE_FUNNET',
    'contents/content/samlinger/aktuelt.json': { content: oedelagtSamling },
    'git/ref/heads/main': { object: { sha: 'HEAD1' } },
    'git/commits/HEAD1': { tree: { sha: 'TRE0' } },
    'git/trees': { sha: 'TRE1' },
    'git/commits': { sha: 'COMMIT1' },
    'git/refs/heads/main': {}
  });
  globalThis.fetch = gh.hent;

  const res = lagRes();
  await save(lagReq({
    page: 'aktuelt', pin: 'hemmelig', edits: {},
    samling: { navn: 'aktuelt', innlegg: { slug: 'nytt-innlegg', tittel: 'Nytt' } }
  }), res);

  assert.equal(res.kode, 500);
  const commitKall = gh.kall.filter((k) => k.url.endsWith('git/commits') && k.metode === 'POST');
  assert.equal(commitKall.length, 0, 'ingen commit skal skje naar samlingsfila er oedelagt');
});

test('uten samling i requesten fungerer publisering akkurat som foer (regresjon)', async () => {
  const gammeltInnhold = Buffer.from(JSON.stringify({ tittel: 'Gammel' })).toString('base64');
  const { hent, kall } = falskGitHub({
    'contents/content/aktuelt.json': { content: gammeltInnhold },
    'git/ref/heads/main': { object: { sha: 'HEAD1' } },
    'git/commits/HEAD1': { tree: { sha: 'TRE0' } },
    'git/trees': { sha: 'TRE1' },
    'git/commits': { sha: 'COMMIT1' },
    'git/refs/heads/main': {}
  });
  globalThis.fetch = hent;

  const res = lagRes();
  await save(lagReq({ page: 'aktuelt', pin: 'hemmelig', edits: { tittel: 'Ny tittel' } }), res);

  assert.equal(res.kode, 200);
  const tre = kall.find((k) => k.url.endsWith('git/trees')).kropp;
  assert.equal(tre.tree.length, 1);
  assert.equal(tre.tree[0].path, 'content/aktuelt.json');
});

// --- behandle(): redigeringssidens fire handlinger ---

import { behandle } from '../api/_samling.mjs';

const TO = [{ slug: 'a', tittel: 'A', pris: '100' }, { slug: 'b', tittel: 'B' }];

test('behandle ny: legges foerst, og en slug i bruk faar -2', () => {
  const r = behandle(TO, { innlegg: { slug: 'a', tittel: 'Ny A' } });
  assert.equal(r.slug, 'a-2');
  assert.deepEqual(r.liste.map((i) => i.slug), ['a-2', 'a', 'b']);
});

test('behandle oppdater: bytter ut innlegget paa plassen sin og roerer ikke de andre', () => {
  const r = behandle(TO, { handling: 'oppdater', innlegg: { slug: 'b', tittel: 'B endret' } });
  assert.deepEqual(r.liste, [{ slug: 'a', tittel: 'A', pris: '100' }, { slug: 'b', tittel: 'B endret' }]);
});

test('behandle oppdater av en slug som ikke finnes gir 404, aldri et nytt innlegg', () => {
  assert.equal(behandle(TO, { handling: 'oppdater', innlegg: { slug: 'x', tittel: 'X' } }).feil.status, 404);
});

test('behandle slett fjerner bare det ene innlegget', () => {
  const r = behandle(TO, { handling: 'slett', slug: 'a' });
  assert.deepEqual(r.liste, [{ slug: 'b', tittel: 'B' }]);
  assert.equal(behandle(TO, { handling: 'slett', slug: 'x' }).feil.status, 404);
  assert.equal(behandle(TO, { handling: 'slett', slug: '../x' }).feil.status, 400);
});

test('behandle les skriver ingenting, og en ukjent handling avvises', () => {
  assert.deepEqual(behandle(TO, { handling: 'les' }), { liste: TO, skriv: false });
  assert.equal(behandle(TO, { handling: 'tull', innlegg: { slug: 'a' } }).feil.status, 400);
});

const FALSK_COMMIT = {
  'git/ref/heads/main': { object: { sha: 'HEAD1' } },
  'git/commits/HEAD1': { tree: { sha: 'TRE0' } },
  'git/trees': { sha: 'TRE1' },
  'git/commits': { sha: 'COMMIT1' },
  'git/refs/heads/main': {}
};
const lagret = (liste) => ({ content: Buffer.from(JSON.stringify(liste)).toString('base64') });

test('save les gir innleggene uten aa committe, og uten page og edits', async () => {
  const gh = falskGitHub({ 'contents/content/samlinger/varer.json': lagret(TO), ...FALSK_COMMIT });
  globalThis.fetch = gh.hent;
  const res = lagRes();
  await save(lagReq({ pin: 'hemmelig', samling: { navn: 'varer', handling: 'les' } }), res);
  assert.equal(res.kode, 200);
  assert.deepEqual(res.kropp.innlegg, TO);
  assert.equal(gh.kall.some((k) => k.metode === 'POST'), false);
});

test('save slett committer samlingen uten innlegget, og ingen sidefil', async () => {
  const gh = falskGitHub({ 'contents/content/samlinger/varer.json': lagret(TO), ...FALSK_COMMIT });
  globalThis.fetch = gh.hent;
  const res = lagRes();
  await save(lagReq({ pin: 'hemmelig', samling: { navn: 'varer', handling: 'slett', slug: 'a' } }), res);
  assert.equal(res.kode, 200);
  const tre = gh.kall.find((k) => k.url.endsWith('git/trees')).kropp;
  assert.deepEqual(tre.tree.map((t) => t.path), ['content/samlinger/varer.json']);
  assert.deepEqual(JSON.parse(tre.tree[0].content), [{ slug: 'b', tittel: 'B' }]);
});

test('save oppdater med bilder gir ett commit, og svaret har slugen', async () => {
  const gh = falskGitHub({ 'contents/content/samlinger/varer.json': lagret(TO), ...FALSK_COMMIT });
  globalThis.fetch = gh.hent;
  const res = lagRes();
  await save(lagReq({
    pin: 'hemmelig',
    bilder: [{ sti: 'static/assets/uploads/1-a.jpg', data: 'data:image/jpeg;base64,AAAA' }],
    samling: { navn: 'varer', handling: 'oppdater', innlegg: { slug: 'a', tittel: 'A', bilde: '/assets/uploads/1-a.jpg' } }
  }), res);
  assert.equal(res.kode, 200);
  assert.equal(res.kropp.slug, 'a');
  const stier = gh.kall.find((k) => k.url.endsWith('git/trees')).kropp.tree.map((t) => t.path).sort();
  assert.deepEqual(stier, ['content/samlinger/varer.json', 'static/assets/uploads/1-a.jpg']);
});

test('save avviser ukjent handling foer GitHub', async () => {
  const gh = falskGitHub({});
  globalThis.fetch = gh.hent;
  const res = lagRes();
  await save(lagReq({ pin: 'hemmelig', samling: { navn: 'varer', handling: 'tull' } }), res);
  assert.equal(res.kode, 400);
  assert.equal(gh.kall.length, 0);
});
