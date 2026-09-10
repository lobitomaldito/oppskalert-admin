// test/skall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lagPin, lesRepo, settEnv, saneringToken, tokenHarGyldigFormat, sjekkToken } from '../bin/_skall.mjs';

test('pin er seks siffer', () => {
  for (let i = 0; i < 200; i++) assert.match(lagPin(), /^\d{6}$/);
});

test('pin er ikke alltid den samme', () => {
  const sett = new Set();
  for (let i = 0; i < 200; i++) sett.add(lagPin());
  assert.ok(sett.size > 150, `for lite spredning: ${sett.size} unike av 200`);
});

test('leser repo fra https-remote', () => {
  assert.equal(lesRepo(() => 'https://github.com/lobitomaldito/kundeside.git\n'), 'lobitomaldito/kundeside');
});

test('leser repo fra ssh-remote', () => {
  assert.equal(lesRepo(() => 'git@github.com:lobitomaldito/kundeside.git\n'), 'lobitomaldito/kundeside');
});

test('leser repo uten .git-endelse', () => {
  assert.equal(lesRepo(() => 'https://github.com/a/b\n'), 'a/b');
});

test('gir null naar det ikke finnes noen remote', () => {
  assert.equal(lesRepo(() => { throw new Error('no remote'); }), null);
});

test('settEnv sender verdien paa stdin og aldri som argument', () => {
  let sett;
  settEnv((cmd, args, opt) => { sett = { cmd, args, opt }; return ''; }, 'GITHUB_TOKEN', 'hemmelig', true);
  assert.equal(sett.cmd, 'vercel');
  assert.ok(sett.args.includes('env') && sett.args.includes('add') && sett.args.includes('GITHUB_TOKEN'));
  assert.ok(sett.args.includes('--force'));
  assert.equal(sett.args.some((a) => String(a).includes('hemmelig')), false, 'verdien laa paa kommandolinja');
  assert.equal(sett.opt.input, 'hemmelig');
});

test('sensitiv verdi merkes sensitiv', () => {
  let sett;
  settEnv((c, a) => { sett = a; return ''; }, 'GITHUB_TOKEN', 'x', true);
  assert.ok(sett.includes('--sensitive'));
});

test('feiler en sensitiv settEnv, vaskes verdien ut av feilmeldingen', () => {
  const verdi = 'github_pat_HEMMELIG';
  const kjorSomFeiler = () => {
    throw new Error(`Command failed: vercel env add GITHUB_TOKEN\n${verdi} ble avvist av vercel`);
  };
  assert.throws(
    () => settEnv(kjorSomFeiler, 'GITHUB_TOKEN', verdi, true),
    (e) => {
      assert.equal(e.message.includes(verdi), false, 'tokenet laa fortsatt i feilmeldingen');
      assert.ok(e.message.includes('***'), 'feilmeldingen ble ikke vasket');
      return true;
    }
  );
});

test('feiler en ikke-sensitiv settEnv, rulles feilen videre uendret', () => {
  const kjorSomFeiler = () => { throw new Error('Command failed: noe gikk galt'); };
  assert.throws(
    () => settEnv(kjorSomFeiler, 'GITHUB_REPO', 'eier/repo', false),
    /Command failed: noe gikk galt/
  );
});

test('saneringToken fjerner bracketed-paste-markoerene ESC[200~/ESC[201~', () => {
  const limt = '\x1b[200~github_pat_HEMMELIG\x1b[201~';
  assert.equal(saneringToken(limt), 'github_pat_HEMMELIG');
});

test('saneringToken fjerner andre ANSI-sekvenser og loese kontrolltegn', () => {
  assert.equal(saneringToken('gh\x1b[Ap_x\x00y\x7fz'), 'ghp_xyz');
});

test('saneringToken taaler null/undefined uten aa krasje', () => {
  assert.equal(saneringToken(null), '');
  assert.equal(saneringToken(undefined), '');
});

test('tokenHarGyldigFormat godtar ghp_ og github_pat_ med gyldige tegn', () => {
  assert.equal(tokenHarGyldigFormat('ghp_abcXYZ123'), true);
  assert.equal(tokenHarGyldigFormat('github_pat_abcXYZ123_456'), true);
});

test('tokenHarGyldigFormat avviser feil prefiks, whitespace og ugyldige tegn', () => {
  assert.equal(tokenHarGyldigFormat('gph_feilPrefiks'), false);
  assert.equal(tokenHarGyldigFormat('ghp_ mellomrom'), false);
  assert.equal(tokenHarGyldigFormat('ghp_ulovlig!tegn'), false);
  assert.equal(tokenHarGyldigFormat(''), false);
  assert.equal(tokenHarGyldigFormat(undefined), false);
});

test('sjekkToken: 200 uten permissions-felt regnes som ok (fine-grained)', async () => {
  const hent = async () => ({ ok: true, status: 200, json: async () => ({}) });
  const res = await sjekkToken(hent, 'eier/repo', 'github_pat_x');
  assert.equal(res.ok, true);
});

test('sjekkToken: 401 gir norsk feilmelding om Bad credentials', async () => {
  const hent = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const res = await sjekkToken(hent, 'eier/repo', 'ghp_x');
  assert.equal(res.ok, false);
  assert.match(res.feil, /401/);
  assert.match(res.feil, /Bad credentials/i);
});

test('sjekkToken: 404 gir norsk feilmelding om manglende repo-tilgang', async () => {
  const hent = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const res = await sjekkToken(hent, 'eier/repo', 'ghp_x');
  assert.equal(res.ok, false);
  assert.match(res.feil, /404/);
  assert.match(res.feil, /tilgang/i);
});

test('sjekkToken: permissions.push false avvises som manglende skriverettighet', async () => {
  const hent = async () => ({ ok: true, status: 200, json: async () => ({ permissions: { push: false } }) });
  const res = await sjekkToken(hent, 'eier/repo', 'ghp_x');
  assert.equal(res.ok, false);
  assert.match(res.feil, /skriverettighet/i);
});

test('sjekkToken: permissions.push true regnes som ok', async () => {
  const hent = async () => ({ ok: true, status: 200, json: async () => ({ permissions: { push: true } }) });
  const res = await sjekkToken(hent, 'eier/repo', 'ghp_x');
  assert.equal(res.ok, true);
});

test('sjekkToken: nettverksfeil gir en feilmelding i stedet for aa kaste', async () => {
  const hent = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  const res = await sjekkToken(hent, 'eier/repo', 'ghp_x');
  assert.equal(res.ok, false);
  assert.match(res.feil, /ENOTFOUND/);
});

test('sjekkToken sender tokenet som Authorization: Bearer, aldri i url', async () => {
  let sett;
  const hent = async (url, opt) => {
    sett = { url, opt };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await sjekkToken(hent, 'eier/repo', 'ghp_hemmelig');
  assert.equal(sett.url.includes('ghp_hemmelig'), false);
  assert.equal(sett.opt.headers.Authorization, 'Bearer ghp_hemmelig');
  assert.equal(sett.url, 'https://api.github.com/repos/eier/repo');
});
