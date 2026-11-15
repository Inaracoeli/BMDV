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
  let schemaCentre = false;
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('actif', x === b));
    document.querySelectorAll('main section').forEach((s) => s.classList.toggle('actif', s.id === 'onglet-' + b.dataset.onglet));
    // À la première ouverture, le schéma de la ligne est centré sur Bravo
    if (b.dataset.onglet === 'trains' && !schemaCentre) {
      const d = $('schema');
      d.scrollLeft = (d.scrollWidth - d.clientWidth) / 2;
      schemaCentre = d.scrollWidth > 0;
    }
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

  // ---------- Vitesse du simulateur ----------
  const boutonsAcceleration = Moteur.ACCELERATIONS.map((facteur) => {
    const b = creer('button', '', `×${facteur}`);
    b.type = 'button';
    b.addEventListener('click', () => agir({ type: 'ACCELERATION', facteur }));
    $('acceleration').append(b);
    return [facteur, b];
  });

  // ---------- Nouveau train ----------
  ['Alfa', 'Bravo', 'Charlie'].forEach((p) => {
    $('origine-train').add(new Option(p, p, p === 'Alfa', p === 'Alfa'));
    $('destination-train').add(new Option(p, p, p === 'Charlie', p === 'Charlie'));
  });
  Object.entries(Moteur.TYPES).forEach(([l, t]) => $('longueur-train').add(new Option(t.libelle, l, l === '300', l === '300')));
  // La vitesse proposée suit la longueur, tant que le formateur ne l'a pas modifiée
  let vitesseSaisie = false;
  const vitesseParDefaut = () => { if (!vitesseSaisie) $('vitesse-train').value = Moteur.TYPES[$('longueur-train').value].vmax; };
  vitesseParDefaut();
  $('longueur-train').addEventListener('change', vitesseParDefaut);
  $('vitesse-train').addEventListener('input', () => { vitesseSaisie = $('vitesse-train').value.trim() !== ''; });
  $('lancer-train').addEventListener('click', () => {
    agir({
      type: 'TRAIN_CREER', numero: $('numero-train').value, longueur: Number($('longueur-train').value),
      vitesse: Number($('vitesse-train').value), origine: $('origine-train').value, destination: $('destination-train').value,
    });
    $('numero-train').value = '';
  });

  // ---------- Liste des trains ----------
  // Les cartes sont reconstruites quand la situation d'un train change ; PK et vitesse sont mis à jour en continu
  function situation(t, p) {
    if (t.attenteDepart) return [`Attend à ${t.origine} la voie libre de Bravo`, true];
    if (t.terminus) return ['Terminus, à quai à Bravo', false];
    if (t.aQuai) return ['À quai à Bravo, attend le départ', true];
    if (t.arrete && t.urgence) return [`${t.voie}, ${p.libelle} — arrêt d'urgence après franchissement du signal fermé`, true];
    if (t.arrete) return [`${t.voie}, ${p.libelle} — ${t.v > 0 ? 'freine sur ordre du formateur' : 'arrêté par le formateur'}`, true];
    if (p.devantSignal) return [`${t.voie}, ${p.libelle} — ${p.redemarre ? 'se remet en marche' : 'arrêté devant le signal fermé'}`, true];
    return [`${t.voie}, ${p.libelle}`, false];
  }
  let signature = null;
  let champsPK = {};
  function afficherTrains(etat) {
    $('nb-trains').textContent = etat.trains.length || '';
    const infos = etat.trains.map((t) => [t, Moteur.position(etat, t)]);
    const s = JSON.stringify(infos.map(([t, p]) => [t.id, situation(t, p), t.franchir]));
    if (s !== signature) {
      signature = s;
      champsPK = {};
      $('trains').replaceChildren(...infos.map(([t, p]) => {
        const carte = creer('div', 'carte train');
        const entete = creer('div', 'entete');
        entete.append(creer('span', 'numero', `Train ${t.numero}`),
          creer('span', 'trajet', `${t.origine} → ${t.destination} · ${t.longueur} m`));
        const [texte, alerte] = situation(t, p);
        const pk = creer('div', 'pk');
        champsPK[t.id] = pk;
        const boutons = creer('div', 'boutons');
        const bouton = (libelle, type) => {
          const b = creer('button', '', libelle);
          b.addEventListener('click', () => agir({ type, id: t.id }));
          boutons.append(b);
        };
        if (!t.terminus && !t.attenteDepart) {
          if (t.arrete) bouton(t.aQuai ? 'Donner le départ' : 'Repartir', 'TRAIN_REPARTIR');
          else bouton('Arrêter', 'TRAIN_ARRETER');
        }
        if (p.devantSignal && !t.franchir && !p.redemarre) bouton('Faire franchir le signal', 'TRAIN_FRANCHIR');
        bouton('Supprimer', 'TRAIN_SUPPRIMER');
        carte.append(entete, creer('div', 'position' + (alerte ? ' alerte' : ''), texte), pk, boutons);
        return carte;
      }));
    }
    infos.forEach(([t, p]) => {
      if (!champsPK[t.id]) return;
      champsPK[t.id].textContent = t.attenteDepart ? '' : `Tête PK ${p.pkTete} · queue PK ${p.pkQueue} · ${p.kmh} km/h`;
    });
  }

  // ---------- Distances de la ligne ----------
  const LIBELLES_LIGNE = {
    ligneAvant: "Pleine ligne avant la zone d'annonce", annonce: "Zone d'annonce", approche: "Zone d'approche (ZAP)",
    signalZone: 'Du signal à la zone suivante', zoneA: 'Première zone de gare', zoneB: 'Seconde zone de gare',
    ligneApres: 'Pleine ligne après Bravo', quaiFin: 'Fin de quai, après le signal', quaiLongueur: 'Longueur du quai',
  };
  const champsLigne = [];
  const champ = (parent, libelle, auChangement) => {
    const label = creer('label', '', libelle);
    const c = creer('input');
    c.type = 'text';
    c.inputMode = 'numeric';
    c.addEventListener('change', () => auChangement(c.value.replace(',', '.')));
    label.append(c);
    parent.append(label);
    return c;
  };
  [['V1', 'Voie 1 · Alfa → Charlie (z1, z3)'], ['V2', 'Voie 2 · Charlie → Alfa (z2, z4)']].forEach(([voie, titre]) => {
    $('distances').append(creer('h3', '', `${titre} — mètres`));
    const grille = creer('div', 'champs');
    Object.entries(LIBELLES_LIGNE).forEach(([nom, libelle]) => {
      if (voie === 'V2' && nom === 'ligneApres') return;
      const c = champ(grille, libelle, (m) => agir({ type: 'LIGNE', voie, nom, metres: m }));
      champsLigne.push([c, voie, nom]);
    });
    $('distances').append(grille);
    if (voie === 'V2') $('distances').append(creer('p', 'derive', "La pleine ligne après Bravo en voie 2 se déduit de la voie 1, pour retomber sur Alfa."));
  });
  $('distances').append(creer('h3', '', 'Trains'));
  const grilleTrains = creer('div', 'champs');
  const champRedemarrage = champ(grilleTrains, 'Redémarrage devant un signal (s)', (s) => agir({ type: 'REDEMARRAGE', secondes: s }));
  $('distances').append(grilleTrains);

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
    champsLigne.forEach(([c, voie, nom]) => { if (document.activeElement !== c) c.value = etat.ligne[voie][nom]; });
    if (document.activeElement !== champRedemarrage) champRedemarrage.value = etat.redemarrage;
    boutonsAcceleration.forEach(([facteur, b]) => b.classList.toggle('actif', etat.acceleration === facteur));
    $('schema').innerHTML = Schema.svg(etat, { trains: true });
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
