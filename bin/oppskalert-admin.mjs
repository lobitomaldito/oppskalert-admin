#!/usr/bin/env node
import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { build } from '../build/index.mjs';
import { trygStI, trygSidenavn } from '../api/_stier.mjs';
import { kjor } from '../doctor/index.mjs';
import { lesProsjekt } from './_les-prosjekt.mjs';

const [, , kommando, sti] = process.argv;
const rot = sti || process.cwd();

const SKALL = {
  'api/save.js': "export { default } from 'oppskalert-admin/api/save.js';\n",
  'api/verify-pin.js': "export { default } from 'oppskalert-admin/api/verify-pin.js';\n",
  'build.mjs': "import { build } from 'oppskalert-admin/build';\n\nbuild();\n"
};

const TOKENS = `
/* Admin-baren arver sidens farger. Bytt verdiene til sidens egne. */
:root {
  --adm-aksent: #3d6be0;
  --adm-flate:  #1c1b1a;
  --adm-tekst:  #f5f4f2;
  --adm-fare:   #c0392b;
  --adm-ok:     #3f9f6b;
}
`;

function init() {
  for (const [rel, innhold] of Object.entries(SKALL)) {
    const full = join(rot, rel);
    if (existsSync(full)) { console.log(`  hopper over ${rel} (finnes fra foer)`); continue; }
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, innhold);
    console.log(`  skrev ${rel}`);
  }
  const tokensFil = join(rot, 'static/css/tokens.css');
  mkdirSync(join(rot, 'static/css'), { recursive: true });
  let tokensEndret = false;
  if (!existsSync(tokensFil)) { writeFileSync(tokensFil, TOKENS.trimStart()); tokensEndret = true; }
  else if (!readFileSync(tokensFil, 'utf8').includes('--adm-aksent')) { appendFileSync(tokensFil, TOKENS); tokensEndret = true; }
  if (tokensEndret) console.log(`  skrev static/css/tokens.css`);
  console.log('\nTo ting du maa gjore selv:');
  console.log('  1. Legg <link rel="stylesheet" href="/css/tokens.css"> i <head> i hver mal,');
  console.log('     etter admin/edit.css. Uten den kjorer admin-baren paa fallbackfarger.');
  console.log('  2. Sett ADMIN_PIN, GITHUB_REPO og GITHUB_TOKEN i Vercel.');
}

function doctor() {
  const { feil, varsler } = kjor(lesProsjekt(rot));
  for (const v of varsler) console.log(`  varsel  ${v.fil}:${v.linje}  [${v.regel}] ${v.melding}`);
  for (const f of feil) console.log(`  FEIL    ${f.fil}:${f.linje}  [${f.regel}] ${f.melding}`);
  if (!feil.length) console.log(`\nIngen feil. ${varsler.length} varsel(er) til gjennomlesing.`);
  process.exit(feil.length ? 1 : 0);
}

function tid() {
  console.log('Maaler ett publiseringsloep.');
  console.log('1. Gjoer en liten endring i admin og trykk Publiser.');
  console.log('2. Ta tiden fra Publiser til endringen er ute paa sida.');
  console.log('3. Sett ADMIN_REBUILD_MS i Vercel til den maalte verdien i millisekunder.');
  console.log('\nEn nedtelling som gaar ut foer siden er klar leser som en feil,');
  console.log('og klienten trykker Publiser en gang til.');
  console.log('\nNaar du har tallet: oppskalert-admin tid <millisekunder>');
  if (/^\d+$/.test(String(sti))) {
    const fil = join(process.cwd(), 'admin-tid.json');
    writeFileSync(fil, JSON.stringify({ rebuildMs: Number(sti), malt: new Date().toISOString() }, null, 2) + '\n');
    console.log(`\nSkrev admin-tid.json med ${sti} ms.`);
  }
}

// Lokal redigeringsloekke uten Vercel. Serverer dist/, og POST /api/save
// skriver content/<side>.json og bygger om. Det er det en deploy gjoer, uten
// ventetiden. Samme trygStI som produksjon, saa valideringen ikke divergerer.
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.ico': 'image/x-icon'
};

function dev() {
  const PORT = Number(process.env.PORT) || 8899;
  const PIN = process.env.ADMIN_PIN || '1234';
  build({ rot });

  createServer((req, res) => {
    const svar = (kode, kropp) => {
      res.writeHead(kode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(kropp));
    };

    if (req.method === 'POST' && (req.url === '/api/save' || req.url === '/api/verify-pin')) {
      const biter = [];
      req.on('data', (c) => biter.push(c));
      req.on('end', () => {
        let kropp;
        try { kropp = JSON.parse(Buffer.concat(biter).toString()); }
        catch (e) { return svar(400, { ok: false, error: 'Kroppen er ikke gyldig JSON.' }); }
        if (kropp.pin !== PIN) return svar(401, { ok: false, error: 'Feil PIN.' });
        if (req.url === '/api/verify-pin') return svar(200, { ok: true });
        if (!kropp.page || !kropp.edits) return svar(400, { ok: false, error: 'Mangler page eller edits' });

        for (const b of kropp.bilder || []) {
          const trygg = trygStI(b.sti);
          if (!trygg) return svar(400, { ok: false, error: `Ulovlig bildesti: ${b.sti}` });
          mkdirSync(join(rot, 'static/assets/uploads'), { recursive: true });
          writeFileSync(join(rot, trygg), Buffer.from(String(b.data).split(',').pop(), 'base64'));
        }

        const sidenavn = trygSidenavn(kropp.page);
        if (!sidenavn) return svar(400, { ok: false, error: 'Ugyldig sidenavn.' });
        mkdirSync(join(rot, 'content'), { recursive: true });
        const f = join(rot, 'content', `${sidenavn}.json`);
        const naa = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
        writeFileSync(f, JSON.stringify({ ...naa, ...kropp.edits }, null, 2));
        build({ rot });
        svar(200, { ok: true, rebuildMs: 400, note: 'Bygget lokalt' });
      });
      return;
    }

    let rel;
    try {
      rel = decodeURIComponent(req.url.split('?')[0]);
    } catch (e) {
      res.writeHead(400); return res.end('Ugyldig adresse');
    }
    if (rel.endsWith('/')) rel += 'index.html';
    if (!extname(rel)) rel += '.html';
    const fil = join(rot, 'dist', rel);
    // sep, ikke bare "dist": uten den matcher startsWith ogsaa dist-hemmelig
    // og dist.bak, og de ligger utenfor det som skal serveres.
    const distRot = join(rot, 'dist');
    if ((fil !== distRot && !fil.startsWith(distRot + sep)) || !existsSync(fil)) {
      res.writeHead(404); return res.end('Ikke funnet');
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(fil)] || 'application/octet-stream' });
    res.end(readFileSync(fil));
  }).listen(PORT, () => console.log(`Kjoerer paa http://localhost:${PORT} (PIN ${PIN})`));
}

const kommandoer = { init, doctor, tid, dev };
if (!kommandoer[kommando]) {
  console.log('Bruk: oppskalert-admin <init|doctor|tid|dev> [sti]');
  process.exit(1);
}
kommandoer[kommando]();
