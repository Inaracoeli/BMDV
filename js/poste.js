// ==========================================================
// Simulateur BMDV — démarrage du poste B (page du TCO)
// Crée le moteur, le relie au TCO, fait tourner l'horloge et
// rejoint la séance créée par le formateur (code saisi sur ce PC).
// ==========================================================
(function () {
  const moteur = Moteur.creer();
  TCO.brancher(moteur);
  const seance = Liaison.heberger(moteur);
  window.moteur = moteur; // pratique pour le débogage dans la console

  let dernier = performance.now();
  setInterval(() => {
    const maintenant = performance.now();
    moteur.agir({ type: 'TEMPS', dt: maintenant - dernier });
    dernier = maintenant;
  }, 100);

  // ---------- Fenêtre de saisie du code de séance ----------
  const fenetre = document.createElement('dialog');
  fenetre.id = 'fenetre-seance';
  fenetre.className = 'fenetre';
  fenetre.innerHTML = `
    <header><h1>Séance</h1><button class="fermer" aria-label="Fermer">✕</button></header>
    <form method="dialog">
      <label for="code-seance">Code affiché sur le téléphone du formateur</label>
      <input id="code-seance" type="text" placeholder="XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false">
      <p class="erreur" hidden>Code incomplet ou incorrect : 12 caractères, comme affiché sur le téléphone.</p>
      <div class="actions">
        <button type="button" class="plus-tard">Plus tard</button>
        <button type="submit" class="relier">Relier</button>
      </div>
    </form>`;
  document.body.append(fenetre);
  const champ = fenetre.querySelector('#code-seance');
  const erreur = fenetre.querySelector('.erreur');
  const ouvrir = () => {
    champ.value = seance.code() || '';
    erreur.hidden = true;
    fenetre.showModal();
    champ.focus();
  };
  fenetre.querySelector('.fermer').addEventListener('click', () => fenetre.close());
  fenetre.querySelector('.plus-tard').addEventListener('click', () => fenetre.close());
  fenetre.querySelector('form').addEventListener('submit', (e) => {
    if (!seance.relier(champ.value)) {
      e.preventDefault();
      erreur.hidden = false;
      return;
    }
    majStatut();
  });

  // ---------- Pastille discrète en bas à droite ----------
  const STATUTS = {
    'sans-code': 'cliquer pour saisir le code',
    indisponible: 'liaison distante indisponible',
    connexion: 'connexion…',
    attente: 'en attente du formateur',
    relie: 'formateur relié',
  };
  const bloc = document.getElementById('seance');
  bloc.addEventListener('click', ouvrir);
  function majStatut() {
    const s = seance.statut();
    bloc.dataset.statut = s;
    bloc.querySelector('.code').textContent = seance.code() || '';
    bloc.querySelector('.statut').textContent = STATUTS[s];
  }
  majStatut();
  setInterval(majStatut, 1000);

  // Au premier démarrage sur ce PC, le code est demandé tout de suite (sauf dans la démonstration)
  if (!seance.code() && window.parent === window) ouvrir();
})();
