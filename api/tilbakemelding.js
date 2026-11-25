// Omtaler fra kundene, sendt fra skjemaet på /tilbakemelding. De lagres i
// Supabase-tabellen tilbakemeldinger og vises først på siden når kunden har
// trykket «Publiser» i kontrollpanelet (editor/panel.js).
//
// To slags kall, begge POST med JSON:
//   uten pin   skjemaet på siden: navn, firma, tekst og samtykke er påkrevd;
//              rolle, arrangement og oppdrag er valgfrie. nettside og _t som i
//              henvendelse.js.
//   med pin    kontrollpanelet. handling «liste» gir de nye omtalene,
//              «merk» setter status («publisert» eller «avvist») på id.
//
// Miljøvariabler: SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY (delt i
// Vercel-teamet), GITHUB_REPO (raden merkes med den), ADMIN_PIN.
import { checkPin, klientIp } from './_rateLimit.mjs';
import { supabase } from './_supabase.mjs';

const MIN_UTFYLLING_MS = 3000;
const GRENSE = 5;
const VINDU_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ponytail: telleren ligger i minnet per funksjonsinstans, som i henvendelse.js.
const teller = new Map();
export function nullstill() { teller.clear(); }
function forMange(ip) {
  const na = Date.now();
  const rad = teller.get(ip);
  if (!rad || rad.fra + VINDU_MS < na) { teller.set(ip, { fra: na, antall: 1 }); return false; }
  rad.antall++;
  return rad.antall > GRENSE;
}

const linje = (v, maks) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, maks);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, feil: 'Kun POST' });
  const kropp = req.body && typeof req.body === 'object' ? req.body : {};
  const side = process.env.GITHUB_REPO;
  if (!side) return res.status(500).json({ ok: false, feil: 'Mangler GITHUB_REPO på serveren.' });

  // ---------- Kontrollpanelet
  if (kropp.pin !== undefined) {
    const sjekk = checkPin(req, kropp.pin, process.env.ADMIN_PIN);
    if (!sjekk.ok) return res.status(sjekk.status).json({ ok: false, feil: sjekk.error });
    try {
      if (kropp.handling === 'liste') {
        const rader = await supabase(`tilbakemeldinger?side=eq.${encodeURIComponent(side)}&status=eq.ny&order=opprettet.desc&select=id,navn,firma,rolle,arrangement,oppdrag,tekst,opprettet`);
        return res.status(200).json({ ok: true, omtaler: rader || [] });
      }
      if (kropp.handling === 'merk') {
        if (!UUID.test(String(kropp.id)) || !['publisert', 'avvist'].includes(kropp.status)) {
          return res.status(400).json({ ok: false, feil: 'Ugyldig id eller status.' });
        }
        await supabase(`tilbakemeldinger?id=eq.${kropp.id}&side=eq.${encodeURIComponent(side)}`, {
          method: 'PATCH', body: JSON.stringify({ status: kropp.status })
        });
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ ok: false, feil: 'Ukjent handling.' });
    } catch (e) {
      console.error('tilbakemelding (panel):', e.message);
      return res.status(502).json({ ok: false, feil: 'Fikk ikke kontakt med lageret. Prøv igjen om litt.' });
    }
  }

  // ---------- Skjemaet på siden
  if (forMange(klientIp(req))) return res.status(429).json({ ok: false, feil: 'For mange innsendinger. Prøv igjen om litt.' });

  // Robotene får ok, så de ikke prøver igjen med en annen vri.
  if (kropp.nettside) return res.status(200).json({ ok: true });
  const brukt = Number(kropp._t);
  if (Number.isFinite(brukt) && brukt >= 0 && brukt < MIN_UTFYLLING_MS) return res.status(200).json({ ok: true });

  const rad = {
    side,
    navn: linje(kropp.navn, 120),
    firma: linje(kropp.firma, 120),
    rolle: linje(kropp.rolle, 120) || null,
    arrangement: linje(kropp.arrangement, 160) || null,
    oppdrag: linje(kropp.oppdrag, 60) || null,
    tekst: String(kropp.tekst ?? '').trim().slice(0, 2000)
  };
  if (!rad.navn || !rad.firma || !rad.tekst) return res.status(400).json({ ok: false, feil: 'Navn, bedrift og omtale må fylles ut.' });
  if (!kropp.samtykke) return res.status(400).json({ ok: false, feil: 'Kryss av for at omtalen kan vises på siden.' });

  try {
    await supabase('tilbakemeldinger', { method: 'POST', body: JSON.stringify(rad) });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('tilbakemelding:', e.message);
    return res.status(502).json({ ok: false, feil: 'Omtalen ble ikke lagret. Prøv igjen om litt.' });
  }
}
