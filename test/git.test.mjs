// test/git.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitFiler, lesFil } from '../api/_git.mjs';

// Falsk GitHub. Samler kallene saa vi kan sjekke rekkefoelgen og at det
// bare blir ETT commit.
function falskGitHub(overstyr = {}) {
  const kall = [];
  const svar = {
    'git/ref/heads/main': { object: { sha: 'HEAD1' } },
    'git/commits/HEAD1': { tree: { sha: 'TRE0' } },
    'git/blobs': { sha: 'BLOB1' },
    'git/trees': { sha: 'TRE1' },
    'git/commits': { sha: 'COMMIT1' },
    'git/refs/heads/main': {},
    ...overstyr
  };
  const hent = async (url, init) => {
    const n = Object.keys(svar).find((k) => url.endsWith(k));
    kall.push({ url, metode: init?.method || 'GET', kropp: init?.body ? JSON.parse(init.body) : null });
    if (svar[n] === 'FEIL') return { ok: false, status: 422, text: async () => 'Unprocessable' };
    return { ok: true, status: 200, text: async () => JSON.stringify(svar[n] ?? {}) };
  };
  return { hent, kall };
}

const grunn = { repo: 'meg/side', branch: 'main', token: 't', melding: 'Innhold' };

test('tekstfiler legges rett i treet, uten blob-kall', async () => {
  const { hent, kall } = falskGitHub();
  const res = await commitFiler({ ...grunn, filer: [{ sti: 'content/index.json', innhold: '{}' }], hent });
  assert.equal(res.sha, 'COMMIT1');
  assert.equal(kall.filter((k) => k.url.endsWith('git/blobs')).length, 0);
  const tre = kall.find((k) => k.url.endsWith('git/trees')).kropp;
  assert.deepEqual(tre.tree[0], { path: 'content/index.json', mode: '100644', type: 'blob', content: '{}' });
  assert.equal(tre.base_tree, 'TRE0');
});

test('binaerfiler lastes opp som blob foerst og refereres med sha', async () => {
  const { hent, kall } = falskGitHub();
  await commitFiler({ ...grunn, filer: [{ sti: 'static/assets/uploads/a.jpg', innhold: 'AAAA', base64: true }], hent });
  const blob = kall.find((k) => k.url.endsWith('git/blobs'));
  assert.deepEqual(blob.kropp, { content: 'AAAA', encoding: 'base64' });
  const tre = kall.find((k) => k.url.endsWith('git/trees')).kropp;
  assert.deepEqual(tre.tree[0], { path: 'static/assets/uploads/a.jpg', mode: '100644', type: 'blob', sha: 'BLOB1' });
});

test('tekst og bilder gir ETT commit til sammen', async () => {
  const { hent, kall } = falskGitHub();
  await commitFiler({
    ...grunn,
    filer: [
      { sti: 'content/index.json', innhold: '{"a":1}' },
      { sti: 'static/assets/uploads/a.jpg', innhold: 'AAAA', base64: true },
      { sti: 'static/assets/uploads/b.jpg', innhold: 'BBBB', base64: true }
    ],
    hent
  });
  const commits = kall.filter((k) => k.url.endsWith('git/commits') && k.metode === 'POST');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].kropp.parents[0], 'HEAD1');
  assert.equal(commits[0].kropp.tree, 'TRE1');
});

test('refen flyttes til det nye commit-et helt til slutt', async () => {
  const { hent, kall } = falskGitHub();
  await commitFiler({ ...grunn, filer: [{ sti: 'a.json', innhold: '{}' }], hent });
  const siste = kall[kall.length - 1];
  assert.equal(siste.metode, 'PATCH');
  assert.match(siste.url, /git\/refs\/heads\/main$/);
  assert.deepEqual(siste.kropp, { sha: 'COMMIT1' });
});

test('en feil fra GitHub kastes med status og utdrag', async () => {
  const { hent } = falskGitHub({ 'git/trees': 'FEIL' });
  await assert.rejects(
    () => commitFiler({ ...grunn, filer: [{ sti: 'a.json', innhold: '{}' }], hent }),
    /GitHub 422: Unprocessable/
  );
});

test('lesFil gir null naar fila ikke finnes', async () => {
  const hent = async () => ({ ok: false, status: 404, text: async () => 'Not Found' });
  assert.equal(await lesFil({ repo: 'a/b', branch: 'main', token: 't', sti: 'x.json', hent }), null);
});

test('lesFil dekoder base64 og parser json', async () => {
  const innhold = Buffer.from(JSON.stringify({ a: 1 })).toString('base64');
  const hent = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ content: innhold }) });
  assert.deepEqual(await lesFil({ repo: 'a/b', branch: 'main', token: 't', sti: 'x.json', hent }), { a: 1 });
});

test('lesFil kaster paa 500, saa en forbigaaende feil ikke leses som tom fil', async () => {
  const hent = async () => ({ ok: false, status: 500, text: async () => 'Server Error' });
  await assert.rejects(
    () => lesFil({ repo: 'a/b', branch: 'main', token: 't', sti: 'x.json', hent }),
    /GitHub 500/
  );
});

test('lesFil kaster paa oedelagt json i stedet for aa returnere tomt', async () => {
  const hent = async () => ({ ok: true, status: 200, text: async () => '{ ikke json' });
  await assert.rejects(
    () => lesFil({ repo: 'a/b', branch: 'main', token: 't', sti: 'x.json', hent }),
    /lar seg ikke lese/
  );
});

test('feiler et steg foer PATCH, staar branchen urort', async () => {
  const { hent, kall } = falskGitHub({ 'git/trees': 'FEIL' });
  await assert.rejects(() => commitFiler({ ...grunn, filer: [{ sti: 'a.json', innhold: '{}' }], hent }));
  assert.equal(kall.some((k) => k.metode === 'PATCH'), false);
});
