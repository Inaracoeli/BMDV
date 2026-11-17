// Tests des fonctions serveur (connexion du formateur) : node tests/fonctions.test.mjs
import assert from 'node:assert';
import { onRequestPost } from '../functions/api/connexion.js';
import { onRequestGet } from '../functions/api/verifier.js';
import { signer, verifier } from '../functions/_lib/jeton.js';

const env = { BMDV_EMAIL: 'Moi@Exemple.fr', BMDV_MOT_DE_PASSE: 'phrase de passe', BMDV_SECRET: 'x'.repeat(40) };
const poster = (corps, e = env) => onRequestPost({ request: new Request('https://a/api/connexion', { method: 'POST', body: JSON.stringify(corps) }), env: e });
const verif = (jeton, e = env) => onRequestGet({ request: new Request('https://a/api/verifier', { headers: { authorization: `Bearer ${jeton}` } }), env: e });

let r = await poster({ email: 'moi@exemple.fr ', motDePasse: 'phrase de passe' });
assert.strictEqual(r.status, 200);
const { jeton } = await r.json();
assert.strictEqual((await verif(jeton)).status, 200);
assert.strictEqual((await poster({ email: 'moi@exemple.fr', motDePasse: 'faux' })).status, 401);
assert.strictEqual((await verif(jeton.slice(0, -2) + 'AA')).status, 401);
assert.strictEqual((await verif(jeton, { ...env, BMDV_SECRET: 'y'.repeat(40) })).status, 401);
assert.strictEqual((await poster({}, {})).status, 503);
const vieux = await signer(env.BMDV_SECRET, Date.now() - 31 * 24 * 3600 * 1000);
assert.strictEqual(await verifier(env.BMDV_SECRET, vieux), null);
console.log('Fonctions serveur : tous les tests passent.');
