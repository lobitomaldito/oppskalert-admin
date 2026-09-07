// Publisering: innhold og eventuelle nye bilder i ETT commit.
// Vercel bygger, og besoekende faar ren statisk HTML.
import { checkPin } from './_rateLimit.mjs';
import { commitFiler, lesFil } from './_git.mjs';
import { trygStI, trygSidenavn, MAKS_PAYLOAD } from './_stier.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metoden er ikke tillatt' });

  const { page, pin, edits, bilder = [] } = req.body || {};

  const sjekk = checkPin(req, pin, process.env.ADMIN_PIN);
  if (!sjekk.ok) return res.status(sjekk.status).json({ ok: false, error: sjekk.error });

  if (!page || !edits) return res.status(400).json({ ok: false, error: 'Mangler page eller edits' });

  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!repo || !token) return res.status(500).json({ ok: false, error: 'Mangler GITHUB_REPO eller GITHUB_TOKEN på serveren.' });

  if (!Array.isArray(bilder)) {
    return res.status(400).json({ ok: false, error: 'Feltet bilder maa vaere en liste.' });
  }
  for (const b of bilder) {
    if (!b || typeof b !== 'object' || typeof b.sti !== 'string' || typeof b.data !== 'string') {
      return res.status(400).json({ ok: false, error: 'Hvert bilde maa ha sti og data som tekst.' });
    }
  }

  // Base64 er 4 tegn per 3 byte. Maalt paa tegn ble det reelle taket 2,6 MB og
  // ikke 3,5, og teksten talte ikke med i det hele tatt.
  const byte = (s) => Math.floor(String(s).length * 3 / 4);
  const stor = bilder.reduce((sum, b) => sum + byte(b.data), 0) + Buffer.byteLength(JSON.stringify(edits));
  if (stor > MAKS_PAYLOAD) {
    return res.status(413).json({
      ok: false,
      error: 'For mye på én gang. Publiser tekstendringene først, så bildene i en runde til.'
    });
  }

  const filer = [];
  for (const b of bilder) {
    const sti = trygStI(b.sti);
    if (!sti) {
      return res.status(400).json({
        ok: false,
        error: `Bildet kan ikke lagres: ${String(b.sti).split('/').pop().slice(0, 40)}. Tillatte format er jpg, png, webp og gif.`
      });
    }
    filer.push({ sti, innhold: String(b.data).split(',').pop(), base64: true });
  }

  const sidenavn = trygSidenavn(page);
  if (!sidenavn) return res.status(400).json({ ok: false, error: 'Ugyldig sidenavn.' });
  const innholdSti = `content/${sidenavn}.json`;

  try {
    // Lesingen ligger INNE i try. Kaster den (403, 500, oedelagt fil), skal
    // publiseringen avbrytes, ikke fortsette med et tomt utgangspunkt som
    // ville slettet alt klienten ikke rorte i denne runden.
    const naa = (await lesFil({ repo, branch, token, sti: innholdSti })) || {};
    filer.push({ sti: innholdSti, innhold: JSON.stringify({ ...naa, ...edits }, null, 2) });

    const { sha } = await commitFiler({
      repo, branch, token,
      melding: `Innhold: ${page}${bilder.length ? ` og ${bilder.length} bilde(r)` : ''} (admin)`,
      filer
    });
    return res.status(200).json({
      ok: true,
      sha,
      // Tid fra push til endringen er ute. Standardverdien er et anslag.
      // Kjør `oppskalert-admin tid` paa prosjektet og sett den maalte verdien
      // i ADMIN_REBUILD_MS. En nedtelling som gaar ut foer siden er klar leser
      // som en feil, og klienten trykker Publiser en gang til.
      rebuildMs: Number(process.env.ADMIN_REBUILD_MS) || 50000,
      note: 'Committet. Vercel bygger og deployer.'
    });
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: `Publiseringen naadde ikke fram til GitHub. Det du har skrevet ligger trygt i nettleseren, proev igjen om litt. Teknisk: ${String(e.message || e).slice(0, 120)}`
    });
  }
}
