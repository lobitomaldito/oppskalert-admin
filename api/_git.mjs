// Skriver flere filer i ETT commit via GitHub Git Trees API.
// Contents API tar én fil per kall, saa ett bildebytte pluss én tekstendring
// ble to commits og to Vercel-bygg.
const API = 'https://api.github.com';

function hoder(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'oppskalert-admin',
    'Content-Type': 'application/json'
  };
}

async function kall(url, token, init, hent) {
  const r = await hent(url, { ...init, headers: hoder(token) });
  const tekst = await r.text();
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${tekst.slice(0, 140)}`);
  return tekst ? JSON.parse(tekst) : {};
}

export async function lesFil({ repo, branch, token, sti, hent = fetch }) {
  const r = await hent(`${API}/repos/${repo}/contents/${sti}?ref=${branch}`, { headers: hoder(token) });
  if (!r.ok) return null;
  try {
    const j = JSON.parse(await r.text());
    return JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
  } catch { return null; }
}

export async function commitFiler({ repo, branch, token, melding, filer, hent = fetch }) {
  const ref = await kall(`${API}/repos/${repo}/git/ref/heads/${branch}`, token, {}, hent);
  const hode = ref.object.sha;
  const grunnCommit = await kall(`${API}/repos/${repo}/git/commits/${hode}`, token, {}, hent);

  const tre = [];
  for (const f of filer) {
    if (f.base64) {
      // Binaert innhold maa gjennom blob-endepunktet. Tre-endepunktet tar bare
      // UTF-8 i `content`, og et JPEG overlever ikke den veien.
      const blob = await kall(`${API}/repos/${repo}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({ content: f.innhold, encoding: 'base64' })
      }, hent);
      tre.push({ path: f.sti, mode: '100644', type: 'blob', sha: blob.sha });
    } else {
      tre.push({ path: f.sti, mode: '100644', type: 'blob', content: f.innhold });
    }
  }

  const nyttTre = await kall(`${API}/repos/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: grunnCommit.tree.sha, tree: tre })
  }, hent);

  const commit = await kall(`${API}/repos/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({ message: melding, tree: nyttTre.sha, parents: [hode] })
  }, hent);

  // Refen flyttes helt til slutt. Feiler noe foer dette, ligger blobbene igjen
  // som ureferert soppel som GitHub rydder selv, og branchen er uroert.
  await kall(`${API}/repos/${repo}/git/refs/heads/${branch}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha })
  }, hent);

  return { sha: commit.sha, antall: filer.length };
}
