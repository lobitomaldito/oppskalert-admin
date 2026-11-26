// test/instagram.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import instagram, { synk, tall, altTekst, innloggingsUrl } from '../api/instagram.js';

// Falsk Meta, Supabase og GitHub i én fetch. Innholdsfila lever i `lagret`.
let lagret, commits, supabase;
const ekteFetch = globalThis.fetch;
const svar = (body, type = 'application/json', status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });

beforeEach(() => {
  lagret = { ig_bio: 'urørt' };
  commits = 0;
  supabase = [];
  Object.assign(process.env, {
    GITHUB_REPO: 'meg/side', GITHUB_TOKEN: 't', IG_BRUKER: 'kunde', IG_APP_ID: '11', IG_CONFIG_ID: '22',
    IG_APP_SECRET: 's', SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x', CRON_SECRET: 'hemmelig'
  });
  delete process.env.GITHUB_BRANCH;
  delete process.env.IG_REDIRECT_URI;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('/oauth/access_token')) return svar({ access_token: 'TOK' });
    if (url.includes('/me/assigned_instagram_accounts')) return svar({ data: [{ id: '17841', username: process.env.TEST_KONTO || 'kunde' }] });
    if (url.includes('/17841?')) return svar({ username: 'kunde', media_count: 408, followers_count: 34812 });
    if (url.includes('/17841/media')) return svar({ data: [
      { id: '1', media_type: 'IMAGE', media_url: 'https://cdn/1', caption: 'Kveld på Latter #standup\nlinje to' },
      { id: '2', media_type: 'VIDEO', thumbnail_url: 'https://cdn/2' },
      { id: '3', media_type: 'CAROUSEL_ALBUM', media_url: 'https://cdn/3v' }
    ] });
    if (url === 'https://cdn/3v') return svar('video', 'video/mp4');
    if (url.startsWith('https://cdn/')) return svar('jpeg', 'image/jpeg');
    if (url.startsWith('https://sb/')) {
      supabase.push({ url, metode: init.method || 'GET', kropp: init.body && JSON.parse(init.body), hoder: init.headers });
      return svar(init.method === 'POST' ? '' : [{ token: 'TOK', ig_id: '17841' }], 'application/json', init.method === 'POST' ? 201 : 200);
    }
    if (url.includes('/contents/content/index.json')) return svar({ content: Buffer.from(JSON.stringify(lagret)).toString('base64') });
    if (url.endsWith('git/trees')) {
      lagret = JSON.parse(JSON.parse(init.body).tree.find((f) => f.path === 'content/index.json').content);
      return svar({ sha: 'TRE1' });
    }
    if (url.endsWith('git/ref/heads/main')) return svar({ object: { sha: 'HEAD1' } });
    if (url.endsWith('git/commits/HEAD1')) return svar({ tree: { sha: 'TRE0' } });
    if (url.endsWith('git/blobs')) return svar({ sha: 'BLOB' });
    if (url.endsWith('git/commits')) { commits++; return svar({ sha: 'NY' }); }
    if (url.endsWith('git/refs/heads/main')) return svar({});
    throw new Error(`Uventet kall: ${url}`);
  };
});
afterEach(() => { globalThis.fetch = ekteFetch; delete process.env.TEST_KONTO; });

function lagRes() {
  const r = { kode: 0, kropp: null, til: null, hoder: {} };
  r.status = (k) => { r.kode = k; return r; };
  r.json = (b) => { r.kropp = b; return r; };
  r.send = (b) => { r.kropp = b; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.hoder[k] = v; return r; };
  r.redirect = (k, url) => { r.kode = k; r.til = url; return r; };
  return r;
}
const lagReq = (query = {}, headers = {}) => ({ method: 'GET', query, headers: { host: 'kundedemo.oppskalert.no', ...headers } });

test('første henting laster ned bilder, hopper over video uten bilde og beholder andre felt', async () => {
  const a = await synk('TOK', '17841');
  assert.equal(a.nye, 2);
  assert.deepEqual(lagret.insta, [
    { bilde: '/assets/img/insta/ig-1.jpg', tittel: 'Kveld på Latter' },
    { bilde: '/assets/img/insta/ig-2.jpg', tittel: 'Innlegg fra Instagram' }
  ]);
  assert.equal(lagret.ig_folgere, '34,8k');
  assert.equal(lagret.ig_innlegg, '408');
  assert.equal(lagret.ig_bio, 'urørt');
});

test('ingen commit når ingenting er nytt', async () => {
  await synk('TOK', '17841');
  const b = await synk('TOK', '17841');
  assert.equal(b.endret, false);
  assert.equal(commits, 1);
});

test('?koble sender til Meta med tilbake-adresse fra host', async () => {
  const res = lagRes();
  await instagram(lagReq({ koble: '' }), res);
  assert.equal(res.kode, 302);
  const u = new URL(res.til);
  assert.equal(u.searchParams.get('config_id'), '22');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://kundedemo.oppskalert.no/api/instagram');
  process.env.IG_REDIRECT_URI = 'https://kunde.no/api/instagram';
  assert.match(innloggingsUrl(process.env.IG_REDIRECT_URI), /redirect_uri=https%3A%2F%2Fkunde\.no/);
});

test('?code med riktig konto lagrer nøkkelen og henter', async () => {
  const res = lagRes();
  await instagram(lagReq({ code: 'abc' }), res);
  assert.equal(res.kode, 200);
  assert.match(res.kropp, /Ferdig!/);
  const lagring = supabase.find((k) => k.metode === 'POST');
  assert.deepEqual({ side: lagring.kropp.side, token: lagring.kropp.token, ig_id: lagring.kropp.ig_id }, { side: 'kunde', token: 'TOK', ig_id: '17841' });
  assert.deepEqual(Object.keys(lagring.hoder).filter((h) => h !== 'Content-Type' && h !== 'Prefer'), ['apikey']);
  assert.equal(commits, 1);
});

test('?code med en annen konto er testmodus: ingenting lagres', async () => {
  process.env.TEST_KONTO = 'oppskalert';
  const res = lagRes();
  await instagram(lagReq({ code: 'abc' }), res);
  assert.match(res.kropp, /Innloggingen virker/);
  assert.match(res.kropp, /@oppskalert/);
  assert.equal(supabase.length, 0);
  assert.equal(commits, 0);
});

test('cron uten riktig nøkkel avvises, med riktig nøkkel hentes det', async () => {
  const feil = lagRes();
  await instagram(lagReq({}, { authorization: 'Bearer feil' }), feil);
  assert.equal(feil.kode, 401);
  const ok = lagRes();
  await instagram(lagReq({}, { authorization: 'Bearer hemmelig' }), ok);
  assert.equal(ok.kode, 200);
  assert.equal(ok.kropp.nye, 2);
});

test('tall og alt-tekst', () => {
  assert.equal(tall(34000), '34k');
  assert.equal(tall(9500), '9500');
  assert.equal(altTekst('#bare #tagger'), 'Innlegg fra Instagram');
  assert.equal(altTekst('x'.repeat(200)).length, 118);
});
