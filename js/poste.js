// ==========================================================
// Simulateur BMDV — démarrage du poste B (page du TCO)
// Crée le moteur, le relie au TCO, fait tourner l'horloge et
// rejoint la séance créée par le formateur (code saisi sur ce PC).
// Le TCO reste masqué par l'écran d'accueil tant que le téléphone du
// formateur n'a pas répondu sur le code saisi.
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

  // ---------- Écran d'accueil : saisie du code de séance ----------
  const accueil = document.getElementById('accueil');
  const champ = document.getElementById('code-seance');
  const etat = accueil.querySelector('.etat');
  const annuler = accueil.querySelector('.annuler');
  let changement = false;   // accueil rouvert depuis la pastille, pour changer de séance
  let depuis = Date.now();  // début de l'attente du formateur

  function verrouiller(pourChanger) {
    changement = pourChanger;
    document.body.classList.add('verrouille');
    champ.value = seance.code() || '';
    annuler.hidden = !pourChanger;
    depuis = Date.now();
    majAccueil();
    champ.focus();
  }
  function deverrouiller() {
    changement = false;
    document.body.classList.remove('verrouille');
  }
  function relier() {
    if (!seance.relier(champ.value)) {
      etat.textContent = 'Code incomplet ou incorrect : 12 caractères, comme affiché sur le téléphone.';
      etat.className = 'etat erreur';
      return;
    }
    changement = false;
    annuler.hidden = true;
    depuis = Date.now();
    champ.value = seance.code();
    majAccueil();
  }
  accueil.querySelector('.relier').addEventListener('click', relier);
  champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') relier(); });
  annuler.addEventListener('click', deverrouiller);

  function majAccueil() {
    if (!document.body.classList.contains('verrouille')) return;
    // Le téléphone a répondu : le TCO s'affiche
    if (seance.contact() && !changement) { deverrouiller(); return; }
    if (changement) {
      etat.textContent = 'Saisissez le nouveau code affiché sur le téléphone.';
      etat.className = 'etat';
      return;
    }
    const s = seance.statut();
    if (s === 'sans-code') {
      etat.textContent = '';
    } else if (s === 'indisponible') {
      etat.textContent = 'Liaison indisponible : vérifiez la connexion internet de ce PC, puis rechargez la page.';
      etat.className = 'etat erreur';
    } else if (s === 'connexion') {
      etat.textContent = 'Connexion…';
      etat.className = 'etat';
    } else {
      const long = Date.now() - depuis > 8000;
      etat.textContent = long
        ? "Pas de réponse : vérifiez que l'écran formateur est ouvert sur le téléphone et que le code est identique."
        : 'En attente du téléphone du formateur…';
      etat.className = long ? 'etat erreur' : 'etat';
    }
  }

  // ---------- Pastille discrète en bas à droite, une fois la séance ouverte ----------
  const STATUTS = {
    'sans-code': '',
    indisponible: 'liaison indisponible',
    connexion: 'connexion…',
    attente: 'téléphone en veille ?',
    relie: 'formateur relié',
  };
  const bloc = document.getElementById('seance');
  bloc.addEventListener('click', () => verrouiller(true));
  function majStatut() {
    const s = seance.statut();
    bloc.dataset.statut = s;
    bloc.querySelector('.code').textContent = seance.code() || '';
    bloc.querySelector('.statut').textContent = STATUTS[s];
    majAccueil();
  }
  verrouiller(false);
  majStatut();
  setInterval(majStatut, 500);
})();
