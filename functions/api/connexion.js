// POST /api/connexion { email, motDePasse } → { jeton, expire }
// Identifiants dans les variables d'environnement de Cloudflare Pages :
// BMDV_EMAIL, BMDV_MOT_DE_PASSE, BMDV_SECRET (au moins 32 caractères).
import { signer, verifier, egal, json, configure } from '../_lib/jeton.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function onRequestPost({ request, env }) {
  if (!configure(env)) return json({ erreur: 'Connexion non configurée sur le serveur' }, 503);
  let corps = {};
  try { corps = await request.json(); } catch (e) { /* corps vide */ }
  const email = String(corps.email || '').trim().toLowerCase();
  const [okEmail, okMdp] = await Promise.all([
    egal(email, String(env.BMDV_EMAIL).trim().toLowerCase()),
    egal(String(corps.motDePasse || ''), env.BMDV_MOT_DE_PASSE),
  ]);
  if (!(okEmail && okMdp)) {
    await pause(800); // ralentit les essais en série
    return json({ erreur: 'E-mail ou mot de passe incorrect' }, 401);
  }
  const jeton = await signer(env.BMDV_SECRET);
  const { exp } = await verifier(env.BMDV_SECRET, jeton);
  return json({ jeton, expire: exp });
}
