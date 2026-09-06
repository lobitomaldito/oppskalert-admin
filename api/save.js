// Publisering: innhold og eventuelle nye bilder i ETT commit.
// Vercel bygger, og besoekende faar ren statisk HTML.
import { checkPin } from './_rateLimit.mjs';
import { commitFiler, lesFil } from './_git.mjs';
import { trygStI, MAKS_PAYLOAD } from './_stier.mjs';

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

  const stor = bilder.reduce((sum, b) => sum + String(b.data || '').length, 0);
  if (stor > MAKS_PAYLOAD) {
    return res.status(413).json({
      ok: false,
      error: 'For mye på én gang. Publiser tekstendringene først, så bildene i en runde til.'
    });
  }

  const filer = [];
  for (const b of bilder) {
    const sti = trygStI(b.sti);
    if (!sti) return res.status(400).json({ ok: false, error: `Ulovlig bildesti: ${String(b.sti).slice(0, 60)}` });
    filer.push({ sti, innhold: String(b.data).split(',').pop(), base64: true });
  }

  const innholdSti = `content/${String(page).replace(/[^a-zA-Z0-9_-]/g, '')}.json`;
  const naa = (await lesFil({ repo, branch, token, sti: innholdSti })) || {};
  filer.push({ sti: innholdSti, innhold: JSON.stringify({ ...naa, ...edits }, null, 2) });

  try {
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
    return res.status(502).json({ ok: false, error: String(e.message || e) });
  }
}
