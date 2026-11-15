// ==========================================================
// Simulateur BMDV — écran formateur
// Affiche l'état reçu du TCO et envoie les actions du formateur :
// pupitres d'Alfa et de Charlie, trains, dérangements.
// ==========================================================
(function () {
  const moteur = Liaison.rejoindre();
  const $ = (id) => document.getElementById(id);
  const creer = (balise, classe, texte) => {
    const e = document.createElement(balise);
    if (classe) e.className = classe;
    if (texte) e.textContent = texte;
    return e;
  };
  // Toute action passe par ici : si le TCO ne répond pas, le formateur en est averti
  const agir = (action) => {
    if (!moteur.estConnecte()) {
      $('journal').textContent = 'TCO non connecté : action non transmise.';
      $('journal').className = 'sans-effet';
    }
    moteur.agir(action);
  };

  // ---------- Onglets ----------
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('actif', x === b));
    document.querySelectorAll('main section').forEach((s) => s.classList.toggle('actif', s.id === 'onglet-' + b.dataset.onglet));
  }));

  // ---------- Pupitres ----------
  // Chaque poste a, comme Bravo, une colonne par voie : il émet sur l'une
  // (Annonce, Voie libre, Sonnerie) et reçoit sur l'autre (Reddition, Sonnerie).
  const majPupitres = [];
  function poussoir(parent, libelle, auClic) {
    parent.append(creer('div', 'libelle', libelle));
    const b = creer('button', 'bp');
    b.type = 'button';
    b.setAttribute('aria-label', libelle);
    b.append(creer('i'));
    b.addEventListener('click', auClic);
    parent.append(b);
    return b;
  }
  function voyant(parent, libelle) {
    const v = creer('div', 'voyant');
    v.append(creer('b'), libelle);
    parent.append(v);
    return v;
  }
  function pupitre(poste) {
    const emission = poste === 'Alfa' ? 'V1' : 'V2';   // ce poste annonce ses trains à Bravo
    const reception = poste === 'Alfa' ? 'V2' : 'V1';  // ce poste reçoit les trains venant de Bravo
    const p = creer('div', 'pupitre');
    const plaque = creer('div', 'plaque', `POSTE ${poste.toUpperCase()}`);
    plaque.append(creer('small', '', 'BLOCK CÔTÉ BRAVO'));
    const colonnes = creer('div', 'colonnes');

    const colE = creer('div', 'colonne');
    colE.append(creer('div', 'voie', `VOIE ${emission[1]}`), creer('div', 'sens', `${poste} → Bravo`));
    const annonce = poussoir(colE, 'ANNONCE', () => agir({ type: 'AMONT_ANNONCE', voie: emission }));
    const vl = voyant(colE, 'VOIE LIBRE');
    const sonnerieE = poussoir(colE, 'SONNERIE', () => agir({ type: 'AMONT_ARRET_SONNERIE', voie: emission }));

    const colR = creer('div', 'colonne');
    colR.append(creer('div', 'voie', `VOIE ${reception[1]}`), creer('div', 'sens', `Bravo → ${poste}`));
    const reddition = poussoir(colR, 'REDDITION', () => agir({ type: 'AVAL_REDDITION', voie: reception }));
    const parvenu = voyant(colR, 'TRAIN PARVENU');
    const sonnerieR = poussoir(colR, 'SONNERIE', () => agir({ type: 'AVAL_ARRET_SONNERIE', voie: reception }));

    // Voie 1 à gauche, voie 2 à droite, comme sur le pupitre de Bravo
    colonnes.append(...(emission === 'V1' ? [colE, colR] : [colR, colE]));
    p.append(plaque, colonnes);
    $('pupitres').append(p);

    majPupitres.push((etat) => {
      const e = etat.voies[emission];
      const r = etat.voies[reception];
      annonce.dataset.etat = e.annonceRecue ? 'rouge' : '';
      vl.dataset.etat = e.annonceRecue ? '' : 'blanc';
      sonnerieE.dataset.etat = e.sonnerieAmont ? 'blanc' : '';
      reddition.dataset.etat = r.annonceEmise ? 'jaune' : '';
      parvenu.dataset.etat = r.arrivesAval > 0 ? 'jaune' : '';
      sonnerieR.dataset.etat = r.sonnerieAval ? 'blanc' : '';
    });
  }
  pupitre('Alfa');
  pupitre('Charlie');
  $('auto').addEventListener('change', (e) => agir({ type: 'REGLAGE', nom: 'postesAutomatiques', actif: e.target.checked }));

  // ---------- Nouveau train ----------
  ['Alfa', 'Bravo', 'Charlie'].forEach((p) => {
    $('origine-train').add(new Option(p, p, p === 'Alfa', p === 'Alfa'));
    $('destination-train').add(new Option(p, p, p === 'Charlie', p === 'Charlie'));
  });
  Object.keys(Moteur.VITESSES).forEach((v) => $('vitesse-train').add(new Option(v, v, v === 'normale', v === 'normale')));
  $('lancer-train').addEventListener('click', () => {
    agir({
      type: 'TRAIN_CREER', numero: $('numero-train').value,
      origine: $('origine-train').value, destination: $('destination-train').value, vitesse: $('vitesse-train').value,
    });
    $('numero-train').value = '';
  });

  // ---------- Liste des trains ----------
  const POSITIONS = {
    'canton-amont': (t, p) => `en ligne, de ${p.amont} vers Bravo`,
    annonce: () => "en zone d'annonce",
    approche: () => "en zone d'approche",
    pedale: () => 'franchit le signal',
    'zone-a': (t) => (t.voie === 'V1' ? 'sur z1' : 'sur z2'),
    'zone-b': (t) => (t.voie === 'V1' ? 'sur z3' : 'sur z4'),
    'canton-aval': (t, p) => `en ligne, de Bravo vers ${p.aval}`,
  };
  const aQuaiAuDepart = (t) => t.origine === 'Bravo' && t.arrete && Moteur.PARCOURS[t.etape].nom === 'zone-a';
  function situation(t) {
    const p = Moteur.POSTES[t.voie];
    if (t.attenteDepart) return [`Attend à ${t.origine} la voie libre de Bravo`, true];
    if (t.terminus) return ['Terminus, à quai à Bravo', false];
    if (aQuaiAuDepart(t)) return ['À quai à Bravo, attend le départ', true];
    const ou = `${t.voie}, ${POSITIONS[Moteur.PARCOURS[t.etape].nom](t, p)}`;
    if (t.arrete) return [`${ou} — arrêté par le formateur`, true];
    if (t.attente) return [`${ou} — ${t.demarrage != null ? 'se remet en marche' : 'arrêté devant le signal fermé'}`, true];
    return [ou, false];
  }
  let signature = null;
  function afficherTrains(etat) {
    $('nb-trains').textContent = etat.trains.length || '';
    const s = JSON.stringify(etat.trains.map((t) => [t.id, t.etape, t.arrete, t.attente, t.franchir, t.terminus, t.demarrage != null, t.attenteDepart]));
    if (s === signature) return;
    signature = s;
    $('trains').replaceChildren(...etat.trains.map((t) => {
      const carte = creer('div', 'carte train');
      const entete = creer('div', 'entete');
      entete.append(creer('span', 'numero', `Train ${t.numero}`), creer('span', 'trajet', `${t.origine} → ${t.destination} · ${t.vitesse}`));
      const [texte, alerte] = situation(t);
      const avancement = creer('div', 'avancement');
      const barre = creer('i');
      barre.style.width = `${Math.round(((t.etape + (t.attenteDepart ? 0 : 0.5)) / Moteur.PARCOURS.length) * 100)}%`;
      avancement.append(barre);
      const boutons = creer('div', 'boutons');
      const bouton = (libelle, type) => {
        const b = creer('button', '', libelle);
        b.addEventListener('click', () => agir({ type, id: t.id }));
        boutons.append(b);
      };
      if (!t.terminus && !t.attenteDepart) {
        if (t.arrete) bouton(aQuaiAuDepart(t) ? 'Donner le départ' : 'Repartir', 'TRAIN_REPARTIR');
        else bouton('Arrêter', 'TRAIN_ARRETER');
      }
      if (t.attente && !t.franchir && t.demarrage == null) bouton('Faire franchir le signal', 'TRAIN_FRANCHIR');
      bouton('Supprimer', 'TRAIN_SUPPRIMER');
      carte.append(entete, creer('div', 'position' + (alerte ? ' alerte' : ''), texte), avancement, boutons);
      return carte;
    }));
  }

  // ---------- Durées ----------
  const LIBELLES_DUREES = {
    'canton-amont': 'Ligne avant Bravo', annonce: "Zone d'annonce", approche: "Zone d'approche (ZAP)",
    pedale: 'Du signal à la zone suivante', 'zone-a': 'Zone z1 / z2', 'zone-b': 'Zone z3 / z4', 'canton-aval': 'Ligne après Bravo',
    redemarrage: 'Redémarrage devant un signal',
  };
  const champsDurees = {};
  Object.entries(LIBELLES_DUREES).forEach(([nom, libelle]) => {
    const label = creer('label', '', libelle);
    const champ = creer('input');
    champ.type = 'text';
    champ.inputMode = 'decimal';
    champ.addEventListener('change', () => agir({ type: 'DUREE', nom, secondes: champ.value.replace(',', '.') }));
    label.append(champ);
    $('durees').append(label);
    champsDurees[nom] = champ;
  });

  // ---------- Dérangements ----------
  const ENCLENCHEMENTS = {
    blocageSemaphore: 'Blocage du sémaphore derrière un train',
    redditionSemaphoreBloque: 'Reddition : sémaphore bloqué exigé',
    redditionAnnonceAvantArrivee: "Reddition : annonce avant l'arrivée exigée",
    approche: 'EAP : carré non refermable si la ZAP est occupée',
  };
  const cases = {};
  Object.entries(ENCLENCHEMENTS).forEach(([nom, libelle]) => {
    const label = creer('label', 'interrupteur');
    const c = creer('input');
    c.type = 'checkbox';
    c.addEventListener('change', () => agir({ type: 'ENCLENCHEMENT', nom, actif: c.checked }));
    label.append(c, creer('span', '', libelle));
    $('enclenchements').append(label);
    cases[nom] = c;
  });
  const incident = (libelle, action) => {
    const b = creer('button', '', libelle);
    b.addEventListener('click', () => agir(action));
    $('incidents').append(b);
    return b;
  };
  incident('Pédale intempestive V1', { type: 'TRAIN_PEDALE', voie: 'V1' });
  incident('Pédale intempestive V2', { type: 'TRAIN_PEDALE', voie: 'V2' });
  const carres = {
    V1: incident('', { type: 'B_CARRE', voie: 'V1' }),
    V2: incident('', { type: 'B_CARRE', voie: 'V2' }),
  };
  $('aide-reddition').addEventListener('change', (e) => agir({ type: 'REGLAGE', nom: 'aideReddition', actif: e.target.checked }));
  // Réinitialisation en deux appuis, pour éviter une fausse manœuvre
  let confirmation = null;
  $('reinitialiser').addEventListener('click', () => {
    const b = $('reinitialiser');
    if (confirmation) {
      clearTimeout(confirmation);
      confirmation = null;
      b.textContent = 'Réinitialiser le simulateur';
      agir({ type: 'REINITIALISER' });
      return;
    }
    b.textContent = 'Appuyer encore pour confirmer (trains et réglages effacés)';
    confirmation = setTimeout(() => { confirmation = null; b.textContent = 'Réinitialiser le simulateur'; }, 4000);
  });

  // ---------- Mise à jour à chaque état reçu ----------
  moteur.abonner((etat, resultat) => {
    majPupitres.forEach((f) => f(etat));
    $('auto').checked = etat.reglages.postesAutomatiques;
    $('aide-reddition').checked = etat.reglages.aideReddition;
    Object.entries(cases).forEach(([nom, c]) => { c.checked = etat.enclenchements[nom]; });
    Object.entries(champsDurees).forEach(([nom, champ]) => {
      if (document.activeElement !== champ) champ.value = etat.durees[nom] / 1000;
    });
    Object.entries(carres).forEach(([voie, b]) => {
      b.textContent = `${etat.voies[voie].carre.ferme ? 'Ouvrir' : 'Fermer'} le carré C${voie[1]}`;
    });
    afficherTrains(etat);
    if (resultat && resultat.message) {
      $('journal').textContent = resultat.message;
      $('journal').className = resultat.ok ? '' : 'sans-effet';
    }
  });

  // ---------- Témoin de liaison ----------
  setInterval(() => {
    const ok = moteur.estConnecte();
    $('liaison').textContent = ok ? 'TCO connecté' : 'TCO non connecté';
    $('liaison').className = ok ? 'en-ligne' : 'hors-ligne';
  }, 500);
})();
