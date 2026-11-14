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
  const zoneDurees = panneau.querySelector('.durees');

  const ENCLENCHEMENTS = {
    blocageSemaphore: 'Blocage du sémaphore',
    redditionSemaphoreBloque: 'Reddition : sémaphore bloqué exigé',
    redditionAnnonceAvantArrivee: 'Reddition : annonce avant arrivée exigée',
    approche: 'EAP : carré non refermable si ZAP occupée',
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
  const choixPoste = (id, defaut) => {
    const s = document.createElement('select');
    s.id = id;
    ['Alfa', 'Bravo', 'Charlie'].forEach((p) => s.add(new Option(p, p, p === defaut, p === defaut)));
    return s;
  };
  const origine = choixPoste('origine-train', 'Alfa');
  const destination = choixPoste('destination-train', 'Charlie');
  const titreTrain = document.createElement('strong');
  titreTrain.textContent = 'Nouveau train';
  lancement.append(titreTrain, numero, 'de', origine, 'à', destination, vitesse, bouton('Lancer', () => {
    const action = { type: 'TRAIN_CREER', numero: numero.value, origine: origine.value, destination: destination.value, vitesse: vitesse.value };
    numero.value = '';
    return action;
  }));
  zoneVoies.append(lancement);

  // ---------- Durées de parcours (secondes, à vitesse normale) ----------
  const LIBELLES_DUREES = {
    'canton-amont': 'ligne avant', annonce: 'annonce', approche: 'ZAP',
    'zone-a': 'z1/z2', 'zone-b': 'z3/z4', 'canton-aval': 'ligne après', redemarrage: 'redémarrage',
  };
  const champsDurees = {};
  const titreDurees = document.createElement('strong');
  titreDurees.textContent = 'Durées (s)';
  zoneDurees.append(titreDurees);
  Object.entries(LIBELLES_DUREES).forEach(([nom, libelle]) => {
    const champ = document.createElement('input');
    champ.type = 'text';
    champ.title = `Durée « ${libelle} » en secondes`;
    champ.addEventListener('change', () => moteur.agir({ type: 'DUREE', nom, secondes: champ.value.replace(',', '.') }));
    zoneDurees.append(' ' + libelle, champ);
    champsDurees[nom] = champ;
  });

  // ---------- Enclenchements et réglages ----------
  const cases = {};
  Object.entries(ENCLENCHEMENTS).forEach(([nom, libelle]) => {
    const { label, c } = caseACocher(libelle, (actif) => moteur.agir({ type: 'ENCLENCHEMENT', nom, actif }));
    zoneEncl.append(label);
    cases[nom] = c;
  });
  const aide = caseACocher('Aide : Sonnerie clignote si Reddition seule',
    (actif) => moteur.agir({ type: 'REGLAGE', nom: 'aideReddition', actif }));
  const auto = caseACocher('Alfa et Charlie automatiques',
    (actif) => moteur.agir({ type: 'REGLAGE', nom: 'postesAutomatiques', actif }));
  zoneEncl.append(aide.label, auto.label, bouton('Réinitialiser', { type: 'REINITIALISER' }));

  // ---------- Liste des trains (reconstruite seulement quand elle change) ----------
  let signature = null;
  function afficherTrains(etat) {
    const s = JSON.stringify(etat.trains.map((t) => [t.id, t.etape, t.arrete, t.attente, t.franchir, t.vitesse, t.terminus, t.demarrage != null, t.attenteDepart]));
    if (s === signature) return;
    signature = s;
    zoneTrains.replaceChildren();
    if (!etat.trains.length) { zoneTrains.textContent = 'Aucun train en circulation.'; return; }
    etat.trains.forEach((t) => {
      const p = Moteur.POSTES[t.voie];
      const ligne = document.createElement('div');
      ligne.className = 'ligne';
      const nom = document.createElement('strong');
      const ou = document.createElement('span');
      nom.textContent = `Train ${t.numero} · ${t.origine} → ${t.destination}`;
      ou.textContent = `${t.voie}, ` + POSITIONS[Moteur.PARCOURS[t.etape].nom](p, t.voie)
        + (t.attenteDepart ? ` — attend à ${t.origine} la voie libre de Bravo` : '')
        + (t.terminus ? ' — terminus, à quai' : '')
        + (t.attente ? (t.demarrage != null ? ' — se remet en marche' : ' — arrêté devant le signal fermé') : '')
        + (t.arrete ? (t.origine === 'Bravo' && t.etape === 4 ? ' — à quai, attend le départ' : ' — arrêté par le formateur') : '');
      ligne.append(nom);
      if (!t.terminus) {
        ligne.append(t.arrete
          ? bouton(t.origine === 'Bravo' && t.etape === 4 ? 'Donner le départ' : 'Repartir', { type: 'TRAIN_REPARTIR', id: t.id })
          : bouton('Arrêter', { type: 'TRAIN_ARRETER', id: t.id }));
      }
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
    auto.c.checked = etat.reglages.postesAutomatiques;
    Object.entries(champsDurees).forEach(([nom, champ]) => {
      if (document.activeElement !== champ) champ.value = etat.durees[nom] / 1000;
    });
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
