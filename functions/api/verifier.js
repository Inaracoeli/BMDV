// GET /api/verifier  (Authorization: Bearer <jeton>) → { ok, expire }
import { verifier, json, configure } from '../_lib/jeton.js';

export async function onRequestGet({ request, env }) {
  if (!configure(env)) return json({ ok: false, erreur: 'Connexion non configurée sur le serveur' }, 503);
  const jeton = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const contenu = await verifier(env.BMDV_SECRET, jeton);
  return contenu ? json({ ok: true, expire: contenu.exp }) : json({ ok: false }, 401);
}
