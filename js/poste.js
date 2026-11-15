// ==========================================================
// Simulateur BMDV — démarrage du poste B (page du TCO)
// Crée le moteur, le relie au TCO, fait tourner l'horloge,
// ouvre la liaison avec l'écran formateur et affiche le code de séance.
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

  // Code de séance, discret, en bas à droite : le formateur le saisit sur son téléphone
  const STATUTS = {
    indisponible: 'liaison distante indisponible',
    connexion: 'connexion…',
    attente: 'en attente du formateur',
    relie: 'formateur relié',
  };
  const bloc = document.getElementById('seance');
  bloc.querySelector('.code').textContent = seance.code;
  const majStatut = () => {
    const s = seance.statut();
    bloc.dataset.statut = s;
    bloc.querySelector('.statut').textContent = STATUTS[s];
  };
  majStatut();
  setInterval(majStatut, 1000);
})();
