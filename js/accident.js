// ==========================================================
// Y-TECH — mise en scène des accidents (rattrapage, déraillement)
// Une gazette fictive affiche l'erreur de sécurité en gros titre, avec un
// freinage d'urgence et un choc ; sur le TCO comme sur le téléphone.
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

  // ---------- La gazette : erreur de sécurité en gros titre ----------
  const voile = document.createElement('div');
  voile.id = 'accident';
  voile.setAttribute('role', 'alertdialog');
  voile.innerHTML = `
    <article class="gazette">
      <header class="une">
        <div class="oreille gauche">Édition spéciale</div>
        <div class="titre-journal">Le Canton Libéré</div>
        <div class="oreille droite">Prix : un rapport d'incident</div>
      </header>
      <div class="filet"><span class="date"></span><span>Quotidien indépendant des aiguilleurs</span><span>N° <b class="numero"></b></span></div>
      <h1 class="manchette"></h1>
      <p class="chapeau"></p>
      <div class="colonnes-journal">
        <figure class="photo"><div class="scene-zone"></div><figcaption></figcaption></figure>
        <div class="article"></div>
      </div>
      <div class="bas-de-page">
        <p class="breve"></p>
        <button type="button" class="prison">Aller en prison</button>
      </div>
    </article>`;
  document.body.append(voile);
  voile.querySelector('.prison').addEventListener('click', () => {
    voile.classList.remove('visible');
    document.body.classList.remove('secousse');
  });

  const BREVES = [
    'Petite annonce — Poste B recherche aiguilleur. Lecture du règlement exigée.',
    'Météo — Ciel couvert sur la ligne, risque d\'orage au bureau du chef de circulation.',
    'Courrier des lecteurs — « Le block, c\'est pourtant simple », écrit un retraité de Valence.',
    'Sport — L\'aiguilleur de Bravo battu au sprint par le rapport d\'enquête.',
    'Horoscope — Aiguilleur : une rencontre importante avec un inspecteur est à prévoir.',
  ];

  function montrer(a) {
    const deraillement = a.genre === 'deraillement';
    // Bilan fictif, proportionné à la vitesse
    const morts = Math.max(2, Math.round(a.kmh / (deraillement ? 6 : 9)));
    const blesses = morts * 3 + Math.round(Math.random() * 10);
    const lieu = `près du poste de Bravo, voie ${a.voie[1]}, PK ${a.pk}`;
    voile.querySelector('.date').textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    voile.querySelector('.numero').textContent = 1000 + (a.id || 1);
    voile.querySelector('.manchette').textContent = deraillement
      ? `DÉRAILLEMENT MEURTRIER À BRAVO : ${morts} MORTS`
      : `COLLISION À BRAVO : LE TRAIN ${a.trains[0]} PERCUTE LE ${a.trains[1]}, ${morts} MORTS`;
    voile.querySelector('.chapeau').textContent = deraillement
      ? `Lancé à ${a.kmh} km/h, le train ${a.trains[0]} a quitté les rails ${lieu}. L'aiguilleur est entendu par les enquêteurs.`
      : `À ${a.kmh} km/h, le train ${a.trains[0]} a rattrapé le train ${a.trains[1]} ${lieu}. Le poste d'aiguillage est au cœur de l'enquête.`;
    voile.querySelector('.scene-zone').innerHTML = scene(a.genre);
    voile.querySelector('figcaption').textContent = deraillement
      ? `Les voitures du train ${a.trains[0]} gisent en travers de la voie. (Photo : notre envoyé spécial)`
      : `Le choc a eu lieu en pleine voie. (Photo : notre envoyé spécial)`;
    voile.querySelector('.article').innerHTML = `
      <p><b>Le bilan est lourd</b> : ${morts} morts et ${blesses} blessés. Sur le quai, des veuves en pleurs attendaient encore des nouvelles
        de leurs proches tard dans la soirée ; une cellule d'écoute a été ouverte en gare.</p>
      <p><b>Selon nos informations</b>, l'enquête s'oriente vers une erreur de sécurité au poste : ${a.cause}.</p>
      <p>« Il suffisait d'appliquer le règlement », soupire un cheminot sous couvert d'anonymat.
        ${hasard([...BONS_MOTS[a.genre], ...BONS_MOTS.commun])}</p>`;
    voile.querySelector('.breve').textContent = hasard(BREVES);
    voile.classList.remove('visible'); void voile.offsetWidth;
    voile.classList.add('visible');
    document.body.classList.remove('secousse'); void document.body.offsetWidth;
    document.body.classList.add('secousse');
    if (typeof Sonnerie !== 'undefined' && Sonnerie.freinage) Sonnerie.freinage();
    if (navigator.vibrate) navigator.vibrate([200, 80, 200, 80, 900]);
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
