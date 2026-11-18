// En mal med data-page-key er ment aa vaere redigerbar, men uten
// <script src="/admin/edit.js"> starter editoren aldri: verken ?edit,
// tastaturkoden eller fem trykk i bunnteksten aapner innloggingen. Bygget og
// resten av doctor gaar groent likevel. Kom fra Waaltorp 2026-11-18, der det
// ble oppdaget foerst etter at PIN og token var satt.
import { malFiler } from '../_hjelpere.mjs';

const SIDENOKKEL = /\bdata-page-key\s*=/;
// /admin/edit.js, admin/edit.js eller ./admin/edit.js, med eller uten ?v=.
const EDIT_SKRIPT = /<script\b[^>]*\bsrc\s*=\s*["']?(?:\.?\/)?admin\/edit\.js(?=[?#"'\s>])/i;
const KOMMENTAR = /<!--[\s\S]*?-->/g;

export default {
  navn: 'edit-skript',
  alvor: 'feil',
  sjekk: (p) => {
    const funn = [];
    for (const fil of malFiler(p)) {
      const kode = fil.tekst.replace(KOMMENTAR, '');
      if (!SIDENOKKEL.test(kode) || EDIT_SKRIPT.test(kode)) continue;
      const i = fil.tekst.search(SIDENOKKEL);
      funn.push({
        fil: fil.sti,
        linje: fil.tekst.slice(0, i).split('\n').length,
        melding: 'Malen har data-page-key, men laster ikke /admin/edit.js, saa editoren starter aldri: verken ?edit, tastaturkoden eller trykk i bunnteksten aapner innloggingen. Legg til <script src="/admin/edit.js" defer></script> foer </body>.'
      });
    }
    return funn;
  }
};
