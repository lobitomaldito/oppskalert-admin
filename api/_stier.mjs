// Klienten regner ut den endelige bildestien selv, slik at den kan skrives inn
// i innholdet i samme runde. Da maa serveren validere stien: uten dette er
// feltet en sti-traversering rett inn i repoet.
export const UPLOAD_PREFIKS = 'static/assets/uploads/';
// Vercel avviser kropper over 4,5 MB foer handleren kjorer. Kroppen baerer
// base64, som er 4 tegn per 3 byte, saa taket maa settes i dekodede byte med
// margin for JSON-rammen og teksten: 3,0 MB dekodet blir ca 4,0 MB paa traaden.
export const MAKS_PAYLOAD = 3.0 * 1024 * 1024;

const LOVLIG_FILNAVN = /^[A-Za-z0-9._-]+$/;
// svg er med vilje ikke med. En svg er et dokument som kan bere <script>, og
// den ville kjort paa kundens eget origin. Klientopplastinger er foto.
const LOVLIG_ENDELSE = /\.(jpe?g|png|webp|gif)$/i;

export function trygStI(sti) {
  if (typeof sti !== 'string') return null;
  if (!sti.startsWith(UPLOAD_PREFIKS)) return null;

  const navn = sti.slice(UPLOAD_PREFIKS.length);
  // Ingen undermapper, ingen prosentkoding, ingen punktum-punktum.
  if (!LOVLIG_FILNAVN.test(navn)) return null;
  if (navn.includes('..')) return null;
  if (!LOVLIG_ENDELSE.test(navn)) return null;

  return sti;
}

// Delt av api/save.js og dev-serveren i CLI-en. Laa saniteringen bare i
// save.js, kunne dev-serveren skrive "../../pwned" utenfor prosjektroten,
// og det gjorde den.
export function trygSidenavn(page) {
  const rent = String(page == null ? '' : page).replace(/[^a-zA-Z0-9_-]/g, '');
  // Filsystemet tar 255 tegn. Uten grensen ga et langt navn ufanget
  // ENAMETOOLONG, som drepte dev-serveren.
  return rent && rent.length <= 100 ? rent : null;
}
