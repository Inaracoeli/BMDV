// ==========================================================
// Simulateur BMDV — démarrage du poste B (page du TCO)
// Crée le moteur, le relie au TCO, fait tourner l'horloge et
// ouvre la liaison avec l'écran formateur.
// ==========================================================
(function () {
  const moteur = Moteur.creer();
  TCO.brancher(moteur);
  Liaison.heberger(moteur);
  window.moteur = moteur; // pratique pour le débogage dans la console

  let dernier = performance.now();
  setInterval(() => {
    const maintenant = performance.now();
    moteur.agir({ type: 'TEMPS', dt: maintenant - dernier });
    dernier = maintenant;
  }, 100);
})();
