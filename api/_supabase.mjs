// Felles kall mot Supabase (prosjektet oppskalert) for endepunktene som lagrer
// noe utenfor repoet: Instagram-nøkler og omtaler. Tabellene har RLS uten
// policyer, så bare service-nøkkelen slipper inn. Bare apikey: de nye
// sb_secret_-nøklene er ikke JWT og avvises i Authorization.
export async function supabase(sti, init = {}) {
  const url = process.env.SUPABASE_URL;
  const nokkel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !nokkel) throw new Error('Mangler SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${url}/rest/v1/${sti}`, {
    ...init,
    headers: { apikey: nokkel, 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
