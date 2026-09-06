// Lar klienten bekrefte PIN-en FOER editoren bygges, i stedet for aa oppdage
// en feil PIN foerst ved Publiser. Deler sperren med save.js, saa dette ikke
// aapner en ny, ubeskyttet gjettesti.
import { checkPin } from './_rateLimit.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metoden er ikke tillatt' });
  const sjekk = checkPin(req, (req.body || {}).pin, process.env.ADMIN_PIN);
  if (!sjekk.ok) return res.status(sjekk.status).json({ ok: false, error: sjekk.error });
  return res.status(200).json({ ok: true });
}
