// Henvendelser fra skjemaene på kundesiden (kontakt, bestillingsforespørsel,
// interesse) sendes som e-post til kunden gjennom Resend. Ingenting lagres.
// Svar-til er den som fylte ut, så kunden svarer rett fra innboksen.
//
// Miljøvariabler:
//   RESEND_API_KEY, AVSENDER_EPOST  delt i Vercel-teamet, samme for alle sider
//   KONTAKT_EPOST                   kundens adresse, per prosjekt. Flere skilles med komma
//   SIDENAVN                        valgfri, navnet i Fra-feltet (ellers domenet)
//
// Feltene: navn, og e-post eller telefon, er påkrevd. melding står sist i
// mailen. Alle andre felt listes i den rekkefølgen de kom. Styrefeltene:
//   skjema   emnet i mailen («Bestilling» gir «Bestilling fra nettsiden: …»)
//   nettside honningkrukke, skjult for mennesker
//   _t       millisekunder fra skjemaet ble åpnet til det ble sendt
//   _retur   stien brukeren sendes tilbake til når JavaScript mangler
import { klientIp } from './_rateLimit.mjs';

const EPOST = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FELTNAVN = /^[a-zA-Z0-9æøåÆØÅ_-]{1,40}$/;
const STYREFELT = new Set(['navn', 'epost', 'telefon', 'melding', 'skjema', 'nettside', '_t', '_retur']);
const MAKS_EKSTRA = 20;
const MIN_UTFYLLING_MS = 3000;

// ponytail: telleren ligger i minnet per funksjonsinstans, som PIN-sperren.
// Holder mot en ivrig robot, ikke mot en som roterer IP. Flytt til delt
// lagring hvis spam kommer gjennom likevel.
const GRENSE = 5;
const VINDU_MS = 10 * 60 * 1000;
const teller = new Map();
export function nullstill() { teller.clear(); }

function forMange(ip) {
  const na = Date.now();
  const rad = teller.get(ip);
  if (!rad || rad.fra + VINDU_MS < na) { teller.set(ip, { fra: na, antall: 1 }); return false; }
  rad.antall++;
  return rad.antall > GRENSE;
}

const linje = (v, maks) => String(Array.isArray(v) ? v.join(', ') : v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, maks);
const etikett = (k) => (k.charAt(0).toUpperCase() + k.slice(1)).replace(/[_-]+/g, ' ');

// Uten JavaScript poster nettleseren skjemaet selv. Da skal brukeren tilbake
// til siden med et anker (#skjema-sendt / #skjema-feil), ikke til rå JSON.
// Bare en sti på vår egen side godtas, aldri en annen adresse.
function svar(req, res, status, data) {
  if (String(req.headers.accept || '').includes('application/json')) return res.status(status).json(data);
  const retur = String(req.body?._retur || '');
  const sti = /^\/(?!\/)[^\s#?\\]*$/.test(retur) ? retur : '/';
  return res.redirect(303, `${sti}#${data.ok ? 'skjema-sendt' : 'skjema-feil'}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, feil: 'Kun POST' });
  const kropp = req.body && typeof req.body === 'object' ? req.body : {};

  if (forMange(klientIp(req))) return svar(req, res, 429, { ok: false, feil: 'For mange innsendinger. Prøv igjen om litt, eller ring.' });

  // Robotene får ok, så de ikke prøver igjen med en annen vri.
  if (kropp.nettside) return svar(req, res, 200, { ok: true });
  const brukt = Number(kropp._t);
  if (Number.isFinite(brukt) && brukt >= 0 && brukt < MIN_UTFYLLING_MS) return svar(req, res, 200, { ok: true });

  const navn = linje(kropp.navn, 120);
  const epost = linje(kropp.epost, 200);
  const telefon = linje(kropp.telefon, 40);
  const melding = String(kropp.melding ?? '').trim().slice(0, 5000);
  if (!navn) return svar(req, res, 400, { ok: false, feil: 'Navn må fylles ut' });
  if (!epost && !telefon) return svar(req, res, 400, { ok: false, feil: 'Fyll ut e-post eller telefon' });
  if (epost && !EPOST.test(epost)) return svar(req, res, 400, { ok: false, feil: 'Ugyldig e-postadresse' });

  const { RESEND_API_KEY: nokkel, AVSENDER_EPOST: avsender, KONTAKT_EPOST: mottaker } = process.env;
  const mottakere = String(mottaker || '').split(',').map((a) => a.trim()).filter((a) => EPOST.test(a));
  if (!nokkel || !avsender || !mottakere.length) {
    console.error('henvendelse: RESEND_API_KEY, AVSENDER_EPOST eller KONTAKT_EPOST mangler');
    return svar(req, res, 500, { ok: false, feil: 'Skjemaet er ikke satt opp ennå. Ring eller send e-post.' });
  }

  const ekstra = Object.entries(kropp)
    .filter(([k, v]) => !STYREFELT.has(k) && FELTNAVN.test(k) && linje(v, 1))
    .slice(0, MAKS_EKSTRA)
    .map(([k, v]) => `${etikett(k)}: ${linje(v, 300)}`);
  const tekst = [
    `Navn: ${navn}`,
    epost && `E-post: ${epost}`,
    telefon && `Telefon: ${telefon}`,
    ...ekstra
  ].filter(Boolean).join('\n') + (melding ? `\n\n${melding}` : '');

  const type = linje(kropp.skjema, 40).replace(/[^a-zA-ZæøåÆØÅ -]/g, '') || 'Henvendelse';
  const fra = linje(process.env.SIDENAVN || req.headers.host || 'Nettsiden', 80).replace(/[<>"]/g, '');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${nokkel}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${fra} <${avsender}>`,
        to: mottakere,
        ...(epost && { reply_to: epost }),
        subject: `${type} fra nettsiden: ${navn}`,
        text: tekst
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error(`Resend svarte ${r.status}: ${await r.text()}`);
    return svar(req, res, 200, { ok: true });
  } catch (err) {
    console.error('henvendelse:', err);
    return svar(req, res, 502, { ok: false, feil: 'Kunne ikke sende. Ring eller send e-post.' });
  }
}
