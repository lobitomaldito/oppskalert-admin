// Lar klienten bekrefte PIN-en FOER editoren bygges, i stedet for aa oppdage
// en feil PIN foerst ved Publiser. Bruker samme sperremodul som save.js, saa
// dette endepunktet ikke aapner en ubeskyttet gjettesti.
//
// Telleren deles ikke. Paa Vercel er hver fil i api/ sin egen funksjon med sin
// egen modulinstans, saa denne fila og save.js har hvert sitt kart over IP-er.
// Fem bom paa hver av dem er ti forsoek foer noe laases.
import { checkPin } from './_rateLimit.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metoden er ikke tillatt' });
  const sjekk = checkPin(req, (req.body || {}).pin, process.env.ADMIN_PIN);
  if (!sjekk.ok) return res.status(sjekk.status).json({ ok: false, error: sjekk.error });
  return res.status(200).json({ ok: true });
}
