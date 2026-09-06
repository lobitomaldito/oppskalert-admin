// Klienten regner ut den endelige bildestien selv, slik at den kan skrives inn
// i innholdet i samme runde. Da maa serveren validere stien: uten dette er
// feltet en sti-traversering rett inn i repoet.
export const UPLOAD_PREFIKS = 'static/assets/uploads/';
export const MAKS_PAYLOAD = 3.5 * 1024 * 1024;

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
