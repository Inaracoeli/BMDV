// ==========================================================
// Simulateur BMDV — panneau formateur PROVISOIRE
// Permet de jouer Alfa, Charlie et les trains depuis la même page
// pour tester le moteur. Sera remplacé par l'écran formateur.
// ==========================================================
(function () {
  const moteur = Moteur.creer();
  TCO.brancher(moteur);
  window.moteur = moteur; // pratique pour le débogage dans la console

  const panneau = document.getElementById('panneau-provisoire');
  const journal = document.getElementById('journal');
  const zoneVoies = panneau.querySelector('.voies');
  const zoneTrains = panneau.querySelector('.trains');
  const zoneEncl = panneau.querySelector('.enclenchements');

  const ENCLENCHEMENTS = {
    blocageSemaphore: 'Blocage du sémaphore',
    redditionSemaphoreBloque: 'Reddition : sémaphore bloqué exigé',
    redditionAnnonceAvantArrivee: 'Reddition : annonce avant arrivée exigée',
  };
  const POSITIONS = {
    'canton-amont': (p) => `en ligne, de ${p.amont} vers Bravo`,
    annonce: () => "zone d'annonce",
    approche: () => "zone d'approche",
    pedale: () => 'franchit le signal',
    'zone-a': (p, voie) => (voie === 'V1' ? 'z1' : 'z2'),
    'zone-b': (p, voie) => (voie === 'V1' ? 'z3' : 'z4'),
    'canton-aval': (p) => `en ligne, de Bravo vers ${p.aval}`,
  };

  function bouton(texte, action) {
    const b = document.createElement('button');
    b.textContent = texte;
    b.addEventListener('click', () => moteur.agir(typeof action === 'function' ? action() : action));
    return b;
  }
  function caseACocher(libelle, auChangement) {
    const label = document.createElement('label');
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.addEventListener('change', () => auChangement(c.checked));
    label.append(c, ' ' + libelle);
    return { label, c };
  }

  // ---------- Postes Alfa et Charlie ----------
  const lignes = {};
  ['V1', 'V2'].forEach((voie) => {
    const { amont, aval } = Moteur.POSTES[voie];
    const ligne = document.createElement('div');
    ligne.className = 'ligne';
    const titre = document.createElement('strong');
    titre.textContent = `${voie} · ${amont} → Bravo → ${aval}`;
    const etat = document.createElement('span');
    ligne.append(
      titre,
      bouton(`${amont} annonce`, { type: 'AMONT_ANNONCE', voie }),
      bouton(`${aval} rend voie libre`, { type: 'AVAL_REDDITION', voie }),
      etat,
    );
    zoneVoies.append(ligne);
    lignes[voie] = { etat, amont, aval };
  });

  // ---------- Lancement d'un train ----------
  const lancement = document.createElement('div');
  lancement.className = 'ligne';
  const numero = document.createElement('input');
  numero.type = 'text';
  numero.id = 'numero-train';
  numero.placeholder = 'N° de train';
  numero.size = 9;
  const vitesse = document.createElement('select');
  vitesse.id = 'vitesse-train';
  Object.keys(Moteur.VITESSES).forEach((v) => vitesse.add(new Option(`vitesse ${v}`, v, v === 'normale', v === 'normale')));
  const lancer = (voie) => () => {
    const action = { type: 'TRAIN_CREER', voie, numero: numero.value, vitesse: vitesse.value };
    numero.value = '';
    return action;
  };
  const titreTrain = document.createElement('strong');
  titreTrain.textContent = 'Nouveau train';
  lancement.append(titreTrain, numero, vitesse,
    bouton('Départ d\'Alfa (V1)', lancer('V1')), bouton('Départ de Charlie (V2)', lancer('V2')));
  zoneVoies.append(lancement);

  // ---------- Enclenchements et réglages ----------
  const cases = {};
  Object.entries(ENCLENCHEMENTS).forEach(([nom, libelle]) => {
    const { label, c } = caseACocher(libelle, (actif) => moteur.agir({ type: 'ENCLENCHEMENT', nom, actif }));
    zoneEncl.append(label);
    cases[nom] = c;
  });
  const aide = caseACocher('Aide : Sonnerie clignote si Reddition seule',
    (actif) => moteur.agir({ type: 'REGLAGE', nom: 'aideReddition', actif }));
  zoneEncl.append(aide.label, bouton('Réinitialiser', { type: 'REINITIALISER' }));

  // ---------- Liste des trains (reconstruite seulement quand elle change) ----------
  let signature = null;
  function afficherTrains(etat) {
    const s = JSON.stringify(etat.trains.map((t) => [t.id, t.etape, t.arrete, t.attente, t.franchir, t.vitesse]));
    if (s === signature) return;
    signature = s;
    zoneTrains.replaceChildren();
    if (!etat.trains.length) { zoneTrains.textContent = 'Aucun train en circulation.'; return; }
    etat.trains.forEach((t) => {
      const p = Moteur.POSTES[t.voie];
      const ligne = document.createElement('div');
      ligne.className = 'ligne';
      const nom = document.createElement('strong');
      nom.textContent = `Train ${t.numero} (${t.voie})`;
      const ou = document.createElement('span');
      ou.textContent = POSITIONS[Moteur.PARCOURS[t.etape].nom](p, t.voie)
        + (t.attente ? ' — arrêté devant le signal fermé' : '') + (t.arrete ? ' — arrêté par le formateur' : '');
      ligne.append(nom,
        t.arrete ? bouton('Repartir', { type: 'TRAIN_REPARTIR', id: t.id }) : bouton('Arrêter', { type: 'TRAIN_ARRETER', id: t.id }));
      if (t.attente && !t.franchir) ligne.append(bouton('Faire franchir le signal', { type: 'TRAIN_FRANCHIR', id: t.id }));
      ligne.append(bouton('Supprimer', { type: 'TRAIN_SUPPRIMER', id: t.id }), ou);
      zoneTrains.append(ligne);
    });
  }

  moteur.abonner((etat, resultat) => {
    Object.entries(lignes).forEach(([voie, l]) => {
      const v = etat.voies[voie];
      l.etat.textContent = `${l.amont} : ${v.annonceRecue ? 'train annoncé, attend voie libre' : 'voie libre'}`
        + ` · ${l.aval} : ${v.annonceEmise ? 'annonce reçue de Bravo' : 'rien reçu'}`;
    });
    Object.entries(cases).forEach(([nom, c]) => { c.checked = etat.enclenchements[nom]; });
    aide.c.checked = etat.reglages.aideReddition;
    afficherTrains(etat);
    if (resultat && resultat.message) {
      journal.textContent = resultat.message;
      journal.className = resultat.ok ? '' : 'sans-effet';
    }
  });

  // ---------- Horloge : fait avancer les trains ----------
  let dernier = performance.now();
  setInterval(() => {
    const maintenant = performance.now();
    moteur.agir({ type: 'TEMPS', dt: maintenant - dernier });
    dernier = maintenant;
  }, 100);
})();
