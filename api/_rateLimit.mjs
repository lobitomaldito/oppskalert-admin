// Delt PIN-sjekk med IP-sperre for alle endepunkter som tar en PIN.
// Fem bom fra samme IP gir 15 minutters sperre.
//
// Kjent begrensning, dokumentert med vilje: telleren ligger i minnet per
// funksjonsinstans og nullstilles ved kald start. For en side med én admin er
// det akseptabelt. Skal dette holde mot en seriøs angriper, maa telleren flyttes
// til delt lagring, og da koster siden penger.
const kartet = new Map();
const MAKS_BOM = 5;
const SPERRE_MS = 15 * 60 * 1000;

export function nullstill() { kartet.clear(); }

export function checkPin(req, innsendt, riktig) {
  // Uten en konfigurert PIN slipper ingen inn. Med `innsendt !== riktig` alene
  // ville begge vaere undefined naar ADMIN_PIN forsvinner fra miljoeet,
  // sammenligningen usann, og et tomt PIN-felt gitt full tilgang.
  if (typeof riktig !== 'string' || riktig.length === 0) {
    return { ok: false, status: 500, error: 'Innlogging er ikke satt opp på serveren (ADMIN_PIN mangler).' };
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'ukjent';
  const na = Date.now();
  const rad = kartet.get(ip) || { bom: 0, sperretTil: 0 };

  if (rad.sperretTil > na) {
    const min = Math.ceil((rad.sperretTil - na) / 60000);
    return { ok: false, status: 429, error: `For mange forsøk. Prøv igjen om ${min} min.` };
  }

  if (innsendt !== riktig) {
    rad.bom++;
    if (rad.bom >= MAKS_BOM) rad.sperretTil = na + SPERRE_MS;
    kartet.set(ip, rad);
    const igjen = MAKS_BOM - rad.bom;
    return {
      ok: false,
      status: 401,
      error: igjen > 0 ? `Feil PIN. ${igjen} forsøk igjen.` : 'Låst i 15 minutter.'
    };
  }

  kartet.delete(ip);
  return { ok: true };
}
