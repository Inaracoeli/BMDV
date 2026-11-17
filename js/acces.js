// ==========================================================
// Simulateur BMDV — accès à l'écran formateur
// 1. Connexion au compte formateur (/api/connexion) : le jeton obtenu
//    fait du téléphone la clé de la séance (30 jours).
// 2. Choix de la séance : code reçu par le QR code du PC (#s=…), saisi
//    à la main, ou dernière séance.
// 3. Ouverture de l'application formateur (js/formateur.js).
// ==========================================================
(function () {
  const $ = (id) => document.getElementById(id);
  const CLE_JETON = 'bmdv-jeton';
  const authentification = !(window.BMDV_CONFIG && window.BMDV_CONFIG.authentification === false);

  const lireJeton = () => {
    try {
      const j = JSON.parse(localStorage.getItem(CLE_JETON));
      return j && j.jeton && j.expire > Date.now() ? j.jeton : null;
    } catch (e) { return null; }
  };
  const oublierJeton = () => { try { localStorage.removeItem(CLE_JETON); } catch (e) { /* rien */ } };

  function montrer(ecran) {
    $('acces').hidden = ecran === 'app';
    $('app').hidden = ecran !== 'app';
    $('form-connexion').hidden = ecran !== 'connexion';
    $('choix-seance').hidden = ecran !== 'seance';
  }

  // ---------- 1. Connexion ----------
  $('form-connexion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = e.target.querySelector('button');
    bouton.disabled = true;
    $('erreur-connexion').textContent = '';
    try {
      const r = await fetch('/api/connexion', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: $('email').value, motDePasse: $('mot-de-passe').value }),
      });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corps.erreur || (r.status === 404 ? 'Service de connexion introuvable' : 'Connexion impossible'));
      localStorage.setItem(CLE_JETON, JSON.stringify({ jeton: corps.jeton, expire: corps.expire }));
      $('mot-de-passe').value = '';
      etape();
    } catch (err) {
      $('erreur-connexion').textContent = err.message === 'Failed to fetch' ? 'Pas de réseau : réessaie.' : err.message;
    } finally {
      bouton.disabled = false;
    }
  });

  // ---------- 2. Séance ----------
  function codeDeLAdresse() {
    const m = /[#&]s=([0-9A-Za-z-]+)/.exec(location.hash);
    return m ? Liaison.normaliser(m[1]) : null;
  }
  function rejoindre(code) {
    const c = Liaison.normaliser(code);
    if (!Liaison.codeValide(c)) {
      $('erreur-seance').textContent = 'Code incomplet : 12 caractères, comme affiché sur le PC.';
      return;
    }
    history.replaceState(null, '', `${location.pathname}#s=${c}`);
    ouvrir(c);
  }
  $('rejoindre').addEventListener('click', () => rejoindre($('code-saisi').value));
  $('code-saisi').addEventListener('keydown', (e) => { if (e.key === 'Enter') rejoindre($('code-saisi').value); });
  $('reprendre').addEventListener('click', () => rejoindre(Liaison.dernierCodeFormateur()));
  const deconnecter = () => { oublierJeton(); history.replaceState(null, '', location.pathname); location.reload(); };
  $('deconnexion').addEventListener('click', deconnecter);

  // ---------- 3. Application ----------
  let session = null;
  function ouvrir(code) {
    if (session) session.quitter();
    montrer('app');
    session = Liaison.rejoindre({
      code, jeton: lireJeton(),
      // Le TCO refuse ce téléphone : jeton expiré ou révoqué → nouvelle connexion
      surRefus() {
        if (!authentification) return;
        oublierJeton();
        session.quitter();
        session = null;
        $('erreur-connexion').textContent = 'Connexion expirée : reconnecte-toi.';
        montrer('connexion');
      },
    });
    FormateurApp.demarrer(session, {
      changerSeance() {
        if (session) session.quitter();
        session = null;
        history.replaceState(null, '', location.pathname);
        location.reload();
      },
      deconnecter,
    });
  }

  function etape() {
    if (authentification && !lireJeton()) { montrer('connexion'); return; }
    const code = codeDeLAdresse();
    if (code && Liaison.codeValide(code)) { ouvrir(code); return; }
    const dernier = Liaison.dernierCodeFormateur();
    $('reprendre').hidden = !dernier;
    if (dernier) $('reprendre').textContent = `Reprendre la séance ${Liaison.formater(dernier)}`;
    montrer('seance');
  }
  // Un nouveau QR code scanné alors que la page est déjà ouverte
  window.addEventListener('hashchange', () => { if (!session) etape(); });
  etape();
})();
