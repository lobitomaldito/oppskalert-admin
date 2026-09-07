import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// test hoppes over fordi doctor er ment for kundesider, som ikke har en
// test-mappe. Skannet den testfiler, flagget reglene sine egne fixtures:
// doctor.test.mjs inneholder bade en Google Fonts-lenke og en tankestrek,
// begge med vilje, som testdata.
const HOPP_OVER = new Set(['node_modules', 'dist', 'test', '.git', '.vercel', '.output', '.nuxt']);
const LES = /\.(html|css|json|js|mjs|md)$/;

export function lesProsjekt(rot) {
  const filer = [];
  (function gaa(mappe) {
    for (const navn of readdirSync(mappe)) {
      if (HOPP_OVER.has(navn) || navn.startsWith('.')) continue;
      const full = join(mappe, navn);
      if (statSync(full).isDirectory()) gaa(full);
      else if (LES.test(navn)) filer.push({ sti: relative(rot, full), tekst: readFileSync(full, 'utf8') });
    }
  })(rot);
  return { rot, filer };
}
