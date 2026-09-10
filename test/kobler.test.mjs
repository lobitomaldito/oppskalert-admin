// test/kobler.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kobler } from '../bin/_kobler.mjs';

function lagIo(overstyr = {}) {
  const io = {
    skrevet: [], kjort: [], aapnet: [], tidSkrevet: [],
    kjor(cmd, args, opt) {
      io.kjort.push({ cmd, args, opt });
      if (cmd === 'git') return 'https://github.com/eier/kundeside.git\n';
      return '';
    },
    spor: async () => true,
    skriv: (l) => io.skrevet.push(String(l)),
    aapne: (u) => io.aapnet.push(u),
    naa: (() => { let t = 0; return () => (t += 1000); })(),
    lesToken: async () => 'github_pat_HEMMELIG',
    rot: '/tmp/x',
    malByggetid: async () => 48000,
    skrivAdminTid: (ms) => io.tidSkrevet.push(ms),
    hent: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    ...overstyr
  };
  return io;
}

test('setter de fire variablene', async () => {
  const io = lagIo();
  const res = await kobler(io);
  assert.deepEqual(res.satt.sort(), ['ADMIN_PIN', 'ADMIN_REBUILD_MS', 'GITHUB_REPO', 'GITHUB_TOKEN']);
  assert.equal(res.repo, 'eier/kundeside');
  assert.match(res.pin, /^\d{6}$/);
});

test('tokenet lekker aldri til skjermen', async () => {
  const io = lagIo();
  await kobler(io);
  assert.equal(io.skrevet.some((l) => l.includes('github_pat_HEMMELIG')), false);
});

test('tokenet ligger aldri paa en kommandolinje', async () => {
  const io = lagIo();
  await kobler(io);
  for (const k of io.kjort) {
    assert.equal((k.args || []).some((a) => String(a).includes('github_pat_HEMMELIG')), false);
  }
});

test('nei paa bekreftelsen setter ingenting', async () => {
  const io = lagIo({ spor: async () => false });
  const res = await kobler(io);
  assert.deepEqual(res.satt, []);
  assert.equal(io.kjort.some((k) => k.cmd === 'vercel'), false);
});

test('uten remote avbrytes det med en forklaring', async () => {
  const io = lagIo({ kjor: () => { throw new Error('no remote'); } });
  await assert.rejects(() => kobler(io), /remote/i);
});

test('tomt token avbryter i stedet for aa sette tomt', async () => {
  const io = lagIo({ lesToken: async () => '   ' });
  await assert.rejects(() => kobler(io), /token/i);
  assert.equal(io.kjort.some((k) => k.args?.includes('GITHUB_TOKEN')), false);
});

test('pin-en skrives ut til slutt', async () => {
  const io = lagIo();
  const res = await kobler(io);
  assert.ok(io.skrevet.some((l) => l.includes(res.pin)));
});

test('github-siden aapnes med rettighetene forklart foerst', async () => {
  const io = lagIo();
  await kobler(io);
  assert.equal(io.aapnet.length, 1);
  assert.match(io.aapnet[0], /github\.com\/settings\/personal-access-tokens/);
  assert.ok(io.skrevet.some((l) => /Contents/i.test(l)));
});

test('bekreftelsen forteller at kommandoen skriver static/.byggemerke, committer og pusher', async () => {
  const io = lagIo();
  await kobler(io);
  assert.ok(io.skrevet.some((l) => l.includes('static/.byggemerke')), 'nevner ikke filnavnet');
  assert.ok(io.skrevet.some((l) => /commit/i.test(l) && /push/i.test(l)), 'nevner ikke commit/push');
});

test('skriver admin-tid.json med den maalte byggetiden, saa doctor ikke motsier seg selv', async () => {
  const io = lagIo();
  await kobler(io);
  assert.deepEqual(io.tidSkrevet, [48000]);
});

test('etter ADMIN_REBUILD_MS er satt trigges et nytt bygg med en tom commit og push', async () => {
  const io = lagIo();
  const res = await kobler(io);
  const gitKall = io.kjort.filter((k) => k.cmd === 'git').map((k) => k.args);
  // Forste git-kall (i lesRepo) er 'remote get-url origin'. Deretter skal
  // det komme en tom commit og en push, for at ADMIN_REBUILD_MS skal gjelde
  // i deployen som kommer etter at den ble satt (Vercel fryser env per deploy).
  assert.deepEqual(gitKall.slice(1).map((a) => a[0]), ['commit', 'push']);
  assert.ok(gitKall[1].includes('--allow-empty'));
  assert.equal(res.deployTrigget, true);
  assert.ok(io.skrevet.some((l) => /nytt bygg/i.test(l) && /trigget/i.test(l)));
});

test('feiler pushen som trigger deployen: sier eksplisitt at verdien gjelder foerst etter neste deploy', async () => {
  const io = lagIo({
    kjor(cmd, args) {
      if (cmd === 'git' && (args || []).includes('--allow-empty')) throw new Error('push feilet');
      if (cmd === 'git') return 'https://github.com/eier/kundeside.git\n';
      return '';
    }
  });
  const res = await kobler(io);
  assert.equal(res.deployTrigget, false);
  assert.equal(res.byggetidMs, 48000, 'ADMIN_REBUILD_MS skal vaere satt i Vercel selv om deployen ikke ble trigget');
  assert.ok(
    io.skrevet.some((l) => /gjelder foerst fra neste deploy/i.test(l)),
    'sier ikke eksplisitt at verdien foerst gjelder etter neste deploy'
  );
});

test('feil tokenformat lar brukeren proeve igjen i stedet for aa avbryte', async () => {
  const forsokt = [];
  const forsok = ['ikke-et-token', 'github_pat_GYLDIG'];
  const io = lagIo({
    lesToken: async () => { const t = forsok.shift(); forsokt.push(t); return t; }
  });
  const res = await kobler(io);
  assert.deepEqual(forsokt, ['ikke-et-token', 'github_pat_GYLDIG']);
  assert.ok(io.skrevet.some((l) => /ser ikke ut som et GitHub-token/i.test(l)));
  assert.ok(res.satt.includes('GITHUB_TOKEN'));
});

test('GitHub avviser tokenet (401): brukeren faar proeve igjen, ingenting settes for den runden', async () => {
  const forsok = ['github_pat_FEIL', 'github_pat_RIKTIG'];
  const kjorteEnv = [];
  const io = lagIo({
    lesToken: async () => forsok.shift(),
    hent: async (url, opt) => {
      const token = opt.headers.Authorization.replace('Bearer ', '');
      if (token === 'github_pat_FEIL') return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({}) };
    },
    kjor(cmd, args, opt) {
      io.kjort.push({ cmd, args, opt });
      if (cmd === 'git') return 'https://github.com/eier/kundeside.git\n';
      if (cmd === 'vercel' && args.includes('GITHUB_TOKEN')) kjorteEnv.push(opt.input);
      return '';
    }
  });
  const res = await kobler(io);
  assert.ok(io.skrevet.some((l) => /401/.test(l) && /Bad credentials/i.test(l)));
  assert.deepEqual(kjorteEnv, ['github_pat_RIKTIG'], 'det avviste tokenet skal aldri naa vercel env add');
  assert.ok(res.satt.includes('GITHUB_TOKEN'));
});

test('GitHub sier tokenet mangler tilgang til repoet (404): tydelig norsk feil, ny sjanse', async () => {
  const forsok = ['github_pat_UTEN_TILGANG', 'github_pat_OK'];
  const io = lagIo({
    lesToken: async () => forsok.shift(),
    hent: async (url, opt) => {
      const token = opt.headers.Authorization.replace('Bearer ', '');
      if (token === 'github_pat_UTEN_TILGANG') return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });
  const res = await kobler(io);
  assert.ok(io.skrevet.some((l) => /404/.test(l) && /tilgang/i.test(l)));
  assert.ok(res.satt.includes('GITHUB_TOKEN'));
});

test('token uten skriverettighet (permissions.push false) avvises foer settEnv', async () => {
  const forsok = ['github_pat_LESKUN', 'github_pat_SKRIVBAR'];
  const kjorteEnv = [];
  const io = lagIo({
    lesToken: async () => forsok.shift(),
    hent: async (url, opt) => {
      const token = opt.headers.Authorization.replace('Bearer ', '');
      if (token === 'github_pat_LESKUN') {
        return { ok: true, status: 200, json: async () => ({ permissions: { push: false } }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    },
    kjor(cmd, args, opt) {
      io.kjort.push({ cmd, args, opt });
      if (cmd === 'git') return 'https://github.com/eier/kundeside.git\n';
      if (cmd === 'vercel' && args.includes('GITHUB_TOKEN')) kjorteEnv.push(opt.input);
      return '';
    }
  });
  await kobler(io);
  assert.ok(io.skrevet.some((l) => /skriverettighet/i.test(l)));
  assert.deepEqual(kjorteEnv, ['github_pat_SKRIVBAR']);
});

test('godkjent token: de siste fire tegnene vises, resten aldri', async () => {
  const io = lagIo({ lesToken: async () => 'github_pat_ABCDwxyz' });
  await kobler(io);
  assert.ok(io.skrevet.some((l) => l.includes('...wxyz')));
  assert.equal(io.skrevet.some((l) => l.includes('github_pat_ABCDwxyz')), false);
});

test('en feilende env add stopper flyten og sier hvilken', async () => {
  const io = lagIo({
    kjor(cmd, args) {
      if (cmd === 'git') return 'https://github.com/e/k.git\n';
      if (args?.includes('GITHUB_REPO')) throw new Error('Vercel avviste');
      return '';
    }
  });
  await assert.rejects(() => kobler(io), /GITHUB_REPO/);
});
