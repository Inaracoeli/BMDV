// ==========================================================
// Simulateur BMDV — démarrage du poste B (page du TCO)
// Crée le moteur, le relie au TCO, fait tourner l'horloge et ouvre la
// séance (QR code affiché sur ce PC). Le TCO reste masqué par l'écran
// d'accueil tant que le téléphone du formateur, connecté, n'a pas rejoint.
// ==========================================================
(function () {
  const moteur = Moteur.creer();
  TCO.brancher(moteur);
  if (typeof Tableau !== 'undefined') Tableau.brancher(moteur);
  if (typeof Ordres !== 'undefined') Ordres.brancher(moteur);
  const seance = Liaison.heberger(moteur);
  window.moteur = moteur; // pratique pour le débogage dans la console

  let dernier = performance.now();
  setInterval(() => {
    const maintenant = performance.now();
    moteur.agir({ type: 'TEMPS', dt: maintenant - dernier });
    dernier = maintenant;
  }, 100);

  // ---------- Écran d'accueil : QR code de la séance ----------
  // Le téléphone du formateur scanne le QR code (ou saisit le code en clair),
  // se connecte à son compte et rejoint la séance : le TCO s'ouvre alors.
  const accueil = document.getElementById('accueil');
  const etat = accueil.querySelector('.etat');
  const annuler = accueil.querySelector('.annuler');
  let changement = false;   // accueil rouvert depuis la pastille
  let depuis = Date.now();
  let codeAffiche = null;

  function dessinerQR() {
    const code = seance.code();
    if (code === codeAffiche) return;
    codeAffiche = code;
    document.getElementById('code-clair').textContent = code;
    const zone = document.getElementById('qr');
    if (typeof qrcode !== 'function') { zone.textContent = 'QR code indisponible'; return; }
    const qr = qrcode(0, 'M');
    qr.addData(seance.url());
    qr.make();
    zone.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  }
  function verrouiller(pourChanger) {
    changement = pourChanger;
    document.body.classList.add('verrouille');
    annuler.hidden = !pourChanger;
    depuis = Date.now();
    dessinerQR();
    majAccueil();
  }
  function deverrouiller() {
    changement = false;
    document.body.classList.remove('verrouille');
  }
  annuler.addEventListener('click', deverrouiller);
  // Nouveau code : le téléphone actuel est déconnecté, il faudra scanner de nouveau
  const nouveau = accueil.querySelector('.nouveau');
  let confirmer = null;
  nouveau.addEventListener('click', () => {
    if (!confirmer && seance.contact()) {
      nouveau.textContent = 'Confirmer : déconnecter le téléphone';
      confirmer = setTimeout(() => { confirmer = null; nouveau.textContent = 'Nouveau code'; }, 4000);
      return;
    }
    clearTimeout(confirmer); confirmer = null;
    nouveau.textContent = 'Nouveau code';
    seance.nouveauCode();
    changement = false;
    annuler.hidden = true;
    depuis = Date.now();
    dessinerQR();
    majAccueil();
  });

  function majAccueil() {
    if (!document.body.classList.contains('verrouille')) return;
    if (seance.contact() && !changement) { deverrouiller(); return; }
    const s = seance.statut();
    const message = {
      indisponible: ['Liaison indisponible : vérifie la connexion internet de ce PC, puis recharge la page.', true],
      connexion: ['Connexion au service de liaison…', false],
      refus: ["Un téléphone a essayé de rejoindre la séance sans être connecté au compte formateur.", true],
      attente: [changement ? 'Séance ouverte. Scanne de nouveau le code pour changer de téléphone.' : 'En attente du téléphone du formateur…', false],
      relie: ['Téléphone du formateur relié.', false],
    }[s] || ['', false];
    etat.textContent = message[0];
    etat.className = message[1] ? 'etat erreur' : 'etat';
    accueil.dataset.statut = s;
  }

  // ---------- Pastille discrète en bas à droite, une fois la séance ouverte ----------
  const STATUTS = {
    refus: 'téléphone refusé',
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
