// ==========================================================
// Y-TECH — mise en scène des accidents (rattrapage, déraillement)
// Dramatique et humoristique, sur le TCO comme sur le téléphone.
// Accident.brancher(source) : source = moteur (TCO) ou séance (téléphone).
// ==========================================================
const Accident = (function () {
  const BONS_MOTS = {
    commun: [
      'Le conducteur demande s\'il peut finir son café. Réponse : non.',
      'Rapport d\'incident estimé : 47 pages. Bon courage.',
      'Le chef de circulation vient de s\'asseoir. Lourdement.',
      'Nous vous prions de nous excuser pour la gêne occasionnée.',
      'Quelque part, un inspecteur vient de sentir un frisson.',
      'Le registre de cantonnement n\'a pas de case pour ça.',
    ],
    rattrapage: [
      'Un train peut en cacher un autre. Surtout quand il est dedans.',
      'Distance de sécurité : non respectée. Amitié entre trains : renforcée.',
      'Le block, ce n\'est pas des auto-tamponneuses.',
      'Le canton était occupé. Il l\'est encore plus maintenant.',
    ],
    deraillement: [
      'Le train a pris une troisième voie. Elle n\'existait pas.',
      'Les rails, apparemment, c\'était une suggestion.',
      'L\'aiguille indiquait à gauche. Le train a choisi « nulle part ».',
      'Vitesse en déviation : ambitieuse.',
    ],
  };
  const hasard = (liste) => liste[Math.floor(Math.random() * liste.length)];

  // Petite scène animée, sans victime : des wagons qui se cognent ou se couchent
  function scene(genre) {
    const wagon = (x, classe, couleur) => `
      <g class="${classe}">
        <rect x="${x}" y="40" width="96" height="40" rx="6" fill="${couleur}" stroke="#16181c" stroke-width="3"/>
        <rect x="${x + 10}" y="48" width="18" height="14" rx="2" fill="#bfe3e6" stroke="#16181c" stroke-width="2"/>
        <rect x="${x + 38}" y="48" width="18" height="14" rx="2" fill="#bfe3e6" stroke="#16181c" stroke-width="2"/>
        <rect x="${x + 66}" y="48" width="18" height="14" rx="2" fill="#bfe3e6" stroke="#16181c" stroke-width="2"/>
        <circle cx="${x + 22}" cy="84" r="7" fill="#16181c"/><circle cx="${x + 74}" cy="84" r="7" fill="#16181c"/>
      </g>`;
    const rails = '<line x1="0" y1="92" x2="400" y2="92" stroke="#8a8d92" stroke-width="4"/><g stroke="#8a6a4a" stroke-width="5">' +
      Array.from({ length: 14 }, (_, i) => `<line x1="${8 + i * 30}" y1="88" x2="${18 + i * 30}" y2="96"/>`).join('') + '</g>';
    const fumee = [0, 1, 2, 3].map((i) => `<circle class="fumee f${i}" cx="${200 + (i - 1.5) * 18}" cy="40" r="${10 + i * 3}" fill="#c9ccd1"/>`).join('');
    const etoiles = [0, 1, 2].map((i) => `<path class="etoile e${i}" d="M0 -9 L2.5 -2.5 L9 0 L2.5 2.5 L0 9 L-2.5 2.5 L-9 0 L-2.5 -2.5 Z" fill="#ffcf1a" transform="translate(${190 + i * 14} ${30 + (i % 2) * 18})"/>`).join('');
    if (genre === 'deraillement') {
      return `<svg viewBox="0 0 400 120" class="scene deraillement">${rails}${wagon(152, 'couche', '#d9730d')}${fumee}${etoiles}</svg>`;
    }
    return `<svg viewBox="0 0 400 120" class="scene rattrapage">${rails}${wagon(214, 'devant', '#ece9dc')}${wagon(10, 'fonce', '#d9730d')}${etoiles}${fumee}</svg>`;
  }

  const voile = document.createElement('div');
  voile.id = 'accident';
  voile.setAttribute('role', 'alertdialog');
  voile.innerHTML = '<div class="cadre"><div class="bandeau"><span>⚠ ACCIDENT</span></div><h1></h1><div class="scene-zone"></div>' +
    '<p class="faits"></p><p class="cause"></p><p class="bon-mot"></p><button type="button">Bon… on reprend</button></div>';
  document.body.append(voile);
  voile.querySelector('button').addEventListener('click', () => {
    voile.classList.remove('visible');
    document.body.classList.remove('secousse');
  });

  function montrer(a) {
    const titre = a.genre === 'deraillement' ? 'DÉRAILLEMENT !' : 'RATTRAPAGE !';
    voile.querySelector('h1').textContent = titre;
    voile.querySelector('.scene-zone').innerHTML = scene(a.genre);
    voile.querySelector('.faits').textContent = a.genre === 'deraillement'
      ? `Train ${a.trains[0]} · voie ${a.voie[1]} · PK ${a.pk} · ${a.kmh} km/h`
      : `Train ${a.trains[0]} contre train ${a.trains[1]} · voie ${a.voie[1]} · PK ${a.pk} · ${a.kmh} km/h`;
    voile.querySelector('.cause').textContent = `Cause : ${a.cause}.`;
    voile.querySelector('.bon-mot').textContent = hasard([...BONS_MOTS[a.genre], ...BONS_MOTS.commun]);
    voile.classList.remove('visible'); void voile.offsetWidth;
    voile.classList.add('visible');
    document.body.classList.remove('secousse'); void document.body.offsetWidth;
    document.body.classList.add('secousse');
    if (typeof Sonnerie !== 'undefined' && Sonnerie.fracas) Sonnerie.fracas();
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 600]);
  }

  function brancher(source) {
    let vu = null; // dernier accident déjà montré (ceux d'avant l'ouverture ne sont pas rejoués)
    source.abonner((etat) => {
      const liste = (etat && etat.accidents) || [];
      const dernier = liste.length ? liste[liste.length - 1].id : 0;
      if (vu === null) { vu = dernier; return; }
      if (dernier < vu) vu = 0; // réinitialisation
      liste.filter((a) => a.id > vu).forEach(montrer);
      vu = dernier;
    });
  }
  return { brancher, montrer };
})();
