// ==========================================================
// Simulateur BMDV — écran formateur
// Affiche l'état reçu du TCO et envoie les actions du formateur :
// pupitres d'Alfa et de Charlie, trains, dérangements.
// ==========================================================
const FormateurApp = { demarrer(moteur, acces) {
  if (FormateurApp.demarre) return;
  FormateurApp.demarre = true;
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
      $('journal').textContent = 'TCO non connecté : action non transmise. Vérifie que le PC affiche le poste.';
      $('journal').className = 'sans-effet';
    }
    moteur.agir(action);
  };

  // Hauteur de la barre épinglée : le choix du poste se colle juste dessous
  const majHaut = () => document.documentElement.style.setProperty('--haut-barre', `${$('barre').offsetHeight}px`);
  if (window.ResizeObserver) new ResizeObserver(majHaut).observe($('barre'));
  majHaut();

  // ---------- Séance : code rejoint, menu ----------
  $('code-court').textContent = moteur.code;
  $('menu').addEventListener('click', () => { $('menu-seance').hidden = !$('menu-seance').hidden; });
  $('changer-seance').addEventListener('click', () => acces.changerSeance());
  $('se-deconnecter').addEventListener('click', () => acces.deconnecter());

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
    if (auClic) b.addEventListener('click', auClic);
    parent.append(b);
    return b;
  }
  function voyant(parent, libelle) {
    const v = creer('div', 'voyant');
    v.append(creer('b'), libelle);
    parent.append(v);
    return v;
  }
  const MAINTIEN_MS = 3000; // comme au TCO : Sonnerie reste « tenue » 3 s pour la reddition
  function pupitre(poste) {
    const emission = poste === 'Alfa' ? 'V1' : 'V2';   // ce poste annonce ses trains à Bravo
    const reception = poste === 'Alfa' ? 'V2' : 'V1';  // ce poste reçoit les trains venant de Bravo
    const p = creer('div', 'pupitre');
    p.dataset.poste = poste;
    if (poste !== 'Alfa') p.hidden = true;
    const plaque = creer('div', 'plaque', `POSTE ${poste.toUpperCase()}`);
    plaque.append(creer('small', '', 'BLOCK CÔTÉ BRAVO'));
    const colonnes = creer('div', 'colonnes');

    const colE = creer('div', 'colonne');
    const autre = poste === 'Alfa' ? 'Charlie' : 'Alfa';
    const sensE = creer('div', 'sens', `${poste} → Bravo`);
    colE.append(creer('div', 'voie', `VOIE ${emission[1]}`), sensE);
    const annonce = poussoir(colE, 'ANNONCE', () => agir({ type: 'AMONT_ANNONCE', voie: emission }));
    const vl = voyant(colE, 'VOIE LIBRE');
    const sonnerieE = poussoir(colE, 'SONNERIE', () => agir({ type: 'AMONT_ARRET_SONNERIE', voie: emission }));

    // Réception : Reddition et Sonnerie réunies par l'accolade, à presser ensemble
    const colR = creer('div', 'colonne');
    const sensR = creer('div', 'sens', `Bravo → ${poste}`);
    colR.append(creer('div', 'voie', `VOIE ${reception[1]}`), sensR);
    const parvenu = voyant(colR, 'TRAIN PARVENU');
    const paire = creer('div', 'paire');
    paire.append(creer('div', 'accolade'));
    const boutonsPaire = creer('div', 'boutons-paire');
    paire.append(boutonsPaire);
    colR.append(paire);
    let tenueJusqua = 0;
    let minuterieTenue = null;
    const reddition = poussoir(boutonsPaire, 'REDDITION', null);
    const sonnerieR = poussoir(boutonsPaire, 'SONNERIE', null);
    const aide = creer('div', 'aide-paire', 'Appuie en même temps sur Sonnerie');
    colR.append(aide);
    // Appui sur Sonnerie : arrête la sonnerie et reste tenue 3 s (ou tant que le doigt reste posé)
    sonnerieR.addEventListener('pointerdown', () => {
      agir({ type: 'AVAL_ARRET_SONNERIE', voie: reception });
      tenueJusqua = Date.now() + MAINTIEN_MS;
      sonnerieR.classList.remove('tenue'); void sonnerieR.offsetWidth; sonnerieR.classList.add('tenue');
      clearTimeout(minuterieTenue);
      minuterieTenue = setTimeout(() => sonnerieR.classList.remove('tenue'), MAINTIEN_MS);
    });
    reddition.addEventListener('pointerdown', () => {
      if (Date.now() < tenueJusqua) {
        agir({ type: 'AVAL_REDDITION', voie: reception });
        tenueJusqua = 0;
        sonnerieR.classList.remove('tenue');
        if (navigator.vibrate) navigator.vibrate(40);
        return;
      }
      // Reddition seule : sans effet, l'accolade le rappelle
      paire.classList.remove('rappel'); void paire.offsetWidth; paire.classList.add('rappel');
      aide.classList.add('visible');
      setTimeout(() => aide.classList.remove('visible'), 2500);
    });

    // Voie 1 à gauche, voie 2 à droite, comme sur le pupitre de Bravo
    colonnes.append(...(emission === 'V1' ? [colE, colR] : [colR, colE]));
    p.append(plaque, colonnes);
    $('pupitres').append(p);

    let sonnaitAvant = false;
    majPupitres.push((etat) => {
      const e = etat.voies[emission];
      const r = etat.voies[reception];
      // Gare de Bravo hors service : le canton va directement jusqu'à l'autre poste
      const hs = etat.gare === 'HS';
      plaque.firstChild.textContent = `POSTE ${poste.toUpperCase()}`;
      plaque.querySelector('small').textContent = hs ? `BLOCK DIRECT AVEC ${autre.toUpperCase()}` : 'BLOCK CÔTÉ BRAVO';
      p.classList.toggle('direct', hs);
      sensE.textContent = hs ? `${poste} → ${autre}` : `${poste} → Bravo`;
      sensR.textContent = hs ? `${autre} → ${poste}` : `Bravo → ${poste}`;
      const annonceEnCours = hs ? e.directe : e.annonceRecue;
      annonce.dataset.etat = annonceEnCours ? 'rouge' : '';
      vl.dataset.etat = annonceEnCours ? '' : 'blanc';
      sonnerieE.dataset.etat = e.sonnerieAmont ? 'blanc' : '';
      const recu = hs ? r.directe : r.annonceEmise;
      reddition.dataset.etat = recu ? 'jaune' : '';
      parvenu.dataset.etat = r.arrivesAval > 0 ? 'jaune' : '';
      sonnerieR.dataset.etat = r.sonnerieAval ? 'blanc' : '';
      // Pastille sur l'onglet du poste quand il attend une action du formateur
      const sonne = !!(e.sonnerieAmont || r.sonnerieAval);
      const enAttente = sonne || (recu && r.arrivesAval > 0 && !etat.reglages.postesAutomatiques);
      const onglet = document.querySelector(`#choix-poste button[data-poste="${poste}"]`);
      onglet.classList.toggle('attente', enAttente);
      onglet.classList.toggle('sonne', sonne);
      if (sonne && !sonnaitAvant && !etat.reglages.postesAutomatiques && navigator.vibrate) navigator.vibrate([120, 60, 120]);
      sonnaitAvant = sonne;
    });
  }
  document.querySelectorAll('#choix-poste button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#choix-poste button').forEach((x) => x.classList.toggle('actif', x === b));
    document.querySelectorAll('.pupitre').forEach((x) => { x.hidden = x.dataset.poste !== b.dataset.poste; });
  }));
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
    if (p.manoeuvre) return [`${t.voie}, en manœuvre en gare de Bravo`, true];
    if (p.gare) return [`${t.voie}, arrêté en gare de Bravo sur ${p.gare}${t.terminus && p.gare !== 'z3' ? ' (terminus)' : ''}`, false];
    if (t.terminus) return ['Terminus, à quai à Bravo', false];
    if (t.aQuai) return ['À quai à Bravo, attend le départ', true];
    if (t.arrete && t.urgence) return [`${t.voie}, ${p.libelle} — arrêt d'urgence après franchissement du signal fermé`, true];
    if (t.arrete) return [`${t.voie}, ${p.libelle} — ${t.v > 0 ? 'freine sur ordre du formateur' : 'arrêté par le formateur'}`, true];
    if (p.devantSignal) {
      const vu = p.aspect === 'carre' ? `carré C${t.voie[1]}` : p.aspect === 'semaphore' ? `sémaphore S${t.voie[1]}` : 'signal';
      const ordres = p.ordres.length ? ` · ordre ${p.ordres.join(' + ')} reçu` : '';
      return [`${t.voie}, ${p.libelle} — ${p.redemarre ? 'se remet en marche' : `arrêté devant le ${vu}`}${ordres}`, true];
    }
    if (p.vue) return [`${t.voie}, ${p.libelle} — marche à vue (ordre MV)`, false];
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
        if (p.gare) {
          // En gare : mouvements de manœuvre puis départ (le formateur joue le conducteur)
          const manoeuvre = (libelle, mouvement) => {
            const b = creer('button', '', libelle);
            b.addEventListener('click', () => agir({ type: 'TRAIN_MANOEUVRE', id: t.id, mouvement }));
            boutons.append(b);
          };
          if (p.gare === 'z1') manoeuvre('Avancer jusqu\'à z3', 'avancer');
          if (p.gare === 'z3') manoeuvre('Rebrousser vers la voie 2 (E puis F)', 'rebrousser');
          if (p.gare === 'z4') manoeuvre('Rebrousser vers la voie 1 (F puis E)', 'rebrousser');
          bouton(`Départ vers ${t.voie === 'V1' ? 'Charlie' : 'Alfa'}`, 'TRAIN_DEPART');
        } else if (!t.terminus && !t.attenteDepart && !p.manoeuvre) {
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
    approche: "EAP : enclenchement d'approche actif (Vcm bloqué)",
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
  // Signal fermé sur le terrain alors que le TCO le montre ouvert : le conducteur le signale
  const reparations = {
    E: incident('', { type: 'AIGUILLE_REPAREE', aiguille: 'E' }),
    F: incident('', { type: 'AIGUILLE_REPAREE', aiguille: 'F' }),
  };
  const terrains = [['V1', 'carre'], ['V1', 'sema'], ['V2', 'carre'], ['V2', 'sema']]
    .map(([voie, signal]) => [voie, signal, incident('', { type: 'TERRAIN', voie, signal })]);
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
  // ---------- Tableau de bord : état réel des installations et historique ----------
  let filtreHistorique = 'tout';
  let dernierEtat = null;
  document.querySelectorAll('#filtres-historique button').forEach((b) => b.addEventListener('click', () => {
    filtreHistorique = b.dataset.filtre;
    document.querySelectorAll('#filtres-historique button').forEach((x) => x.classList.toggle('actif', x === b));
    if (dernierEtat) afficherBord(dernierEtat);
  }));
  const heure = (h) => new Date(h).toLocaleTimeString('fr-FR');
  function afficherBord(etat) {
    dernierEtat = etat;
    const hist = etat.historique || [];
    const bravo = hist.filter((x) => x.qui === 'Bravo');
    const refus = bravo.filter((x) => !x.ok || x.alerte).length;
    $('bilan-bravo').textContent = `${bravo.length - refus} effectuées · ${refus} refusées`;
    $('nb-refus').textContent = refus ? `(${refus})` : '';
    if (!etat.pointE) return;
    const c = Moteur.conditions(etat);
    const pe = etat.pointE;
    const sema = (v) => `${v.sema.ouvert ? 'ouvert' : 'fermé'}${v.sema.bloque ? ', bloqué' : ''} · manette ${v.sema.manette === 'ouvert' ? 'haut' : 'bas'}`;
    const carre = (v, n) => v.carre.ferme ? `fermé${v.carre.force ? ' (dérangement)' : ` (Vcm ${n})`}` : 'ouvert';
    const lignes = [
      ['Gare', etat.gare === 'HS' ? 'hors service (HS)' : 'en service (ES)', etat.gare === 'HS'],
      ['Sémaphore V1', sema(etat.voies.V1)], ['Sémaphore V2', sema(etat.voies.V2)],
      ['Carré C1', carre(etat.voies.V1, 1), etat.voies.V1.carre.ferme], ['Carré C2', carre(etat.voies.V2, 2), etat.voies.V2.carre.ferme],
      ['Au E', `commutateur ${etat.auE} · ${c.aueDonnee ? 'donnée' : 'refusée'}`, c.aueDonnee],
      ['EAP C1', pe.eap.V1 ? 'enclenchée' : 'libre', pe.eap.V1], ['EAP C2', pe.eap.V2 ? 'enclenchée' : 'libre', pe.eap.V2],
      ['Vcm 1', etat.vcm[1], etat.vcm[1] === 'F'], ['Vcm 2', etat.vcm[2], etat.vcm[2] === 'F'],
      ['Clé E', pe.cles.E === 'vcm' ? 'dans le Vcm 1' : "dans la serrure de l'aiguille", pe.cles.E !== 'vcm'],
      ['Clé F', pe.cles.F === 'vcm' ? 'dans le Vcm 2' : "dans la serrure de l'aiguille", pe.cles.F !== 'vcm'],
      ['Serrure E', pe.serrures.E ? 'verrouillée' : 'déverrouillée', !pe.serrures.E],
      ['Serrure F', pe.serrures.F ? 'verrouillée' : 'déverrouillée', !pe.serrures.F],
      ...['E', 'F'].map((aig) => [`Aiguille ${aig} (terrain)`,
        `${pe.aiguilles[aig] === 'normale' ? 'normale' : 'RENVERSÉE'}${pe.talonnees && pe.talonnees[aig] ? ' · TALONNÉE' : ''}`,
        pe.aiguilles[aig] !== 'normale' || (pe.talonnees && pe.talonnees[aig])]),
    ];
    $('installations').innerHTML = lignes.map(([n, v, marque]) => `<div class="inst${marque ? ' marque' : ''}"><span>${n}</span><b>${v}</b></div>`).join('');
    const liste = hist.filter((x) => filtreHistorique === 'tout' || (x.qui === 'Bravo' && (filtreHistorique === 'bravo' || !x.ok || x.alerte)));
    $('ordres-bord').innerHTML = (etat.ordres || []).slice().reverse().map((o) => `
      <li class="${o.remarques.length ? 'refus' : ''}"><b>Ordre ${o.ordre} n° ${o.numero}</b> · ${heure(o.h)} · train ${(o.champs.train || '?').replace(/</g, '&lt;')}
        <span class="msg">${o.remarques.length ? o.remarques.join(' ; ').replace(/</g, '&lt;') : 'conforme'}</span></li>`).join('')
      || '<li class="vide">Aucun ordre délivré.</li>';
    $('historique').innerHTML = liste.slice(-80).reverse().map((x) => `
      <li class="${!x.ok || x.alerte ? 'refus' : ''}"><time>${heure(x.h)}</time><span class="qui">${x.qui}</span>
        <span class="msg">${x.message.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span></li>`).join('')
      || '<li class="vide">Rien pour le moment.</li>';
  }

  // ---------- Alertes épinglées en haut : ce qui attend le formateur ----------
  const allerA = (onglet, poste) => {
    document.querySelector(`nav button[data-onglet="${onglet}"]`).click();
    if (poste) document.querySelector(`#choix-poste button[data-poste="${poste}"]`).click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  let signatureAlertes = '';
  function majAlertes(etat) {
    const liste = [];
    const auto = etat.reglages.postesAutomatiques;
    [['Alfa', 'V1', 'V2'], ['Charlie', 'V2', 'V1']].forEach(([poste, em, rec]) => {
      const e = etat.voies[em];
      const r = etat.voies[rec];
      const hs = etat.gare === 'HS';
      if (r.sonnerieAval) liste.push(['sonne', `${poste} : annonce reçue`, 'postes', poste]);
      if (e.sonnerieAmont) liste.push(['sonne', `${poste} : voie libre reçue`, 'postes', poste]);
      if (!auto && r.arrivesAval > 0 && (hs ? r.directe : r.annonceEmise)) liste.push(['action', `${poste} : rendre voie libre`, 'postes', poste]);
    });
    etat.trains.forEach((t) => {
      const p = Moteur.position(etat, t);
      if (p.devantSignal && !p.redemarre) {
        const vu = p.aspect === 'carre' ? `C${t.voie[1]}` : `S${t.voie[1]}`;
        liste.push(['train', `Train ${t.numero} arrêté devant ${vu}`, 'trains']);
      }
      if (t.urgence) liste.push(['danger', `Train ${t.numero} : arrêt d'urgence`, 'trains']);
    });
    const signature = JSON.stringify(liste);
    if (signature === signatureAlertes) return;
    signatureAlertes = signature;
    $('alertes').replaceChildren(...liste.map(([genre, texte, onglet, poste]) => {
      const b = creer('button', `alerte ${genre}`, texte);
      b.type = 'button';
      b.addEventListener('click', () => allerA(onglet, poste));
      return b;
    }));
  }

  moteur.abonner((etat, resultat) => {
    majAlertes(etat);
    afficherBord(etat);
    majPupitres.forEach((f) => f(etat));
    $('auto').checked = etat.reglages.postesAutomatiques;
    $('aide-reddition').checked = etat.reglages.aideReddition;
    Object.entries(cases).forEach(([nom, c]) => { c.checked = etat.enclenchements[nom]; });
    champsLigne.forEach(([c, voie, nom]) => { if (document.activeElement !== c) c.value = etat.ligne[voie][nom]; });
    if (document.activeElement !== champRedemarrage) champRedemarrage.value = etat.redemarrage;
    boutonsAcceleration.forEach(([facteur, b]) => b.classList.toggle('actif', etat.acceleration === facteur));
    $('schema').innerHTML = Schema.svg(etat, { trains: true });
    ['E', 'F'].forEach((aig) => {
      const tal = etat.pointE && etat.pointE.talonnees && etat.pointE.talonnees[aig];
      reparations[aig].hidden = !tal;
      reparations[aig].textContent = `Remettre en état l'aiguille ${aig} (talonnée)`;
    });
    terrains.forEach(([voie, signal, b]) => {
      const nom = signal === 'carre' ? `Carré C${voie[1]}` : `Sémaphore S${voie[1]}`;
      const actif = etat.voies[voie].terrain && etat.voies[voie].terrain[signal];
      b.textContent = actif ? `${nom} : lever le dérangement terrain` : `${nom} fermé sur le terrain (TCO ouvert)`;
      b.classList.toggle('actif', !!actif);
    });
    Object.entries(carres).forEach(([voie, b]) => {
      b.textContent = etat.voies[voie].carre.force ? `Lever le dérangement du carré C${voie[1]}` : `Carré C${voie[1]} fermé (dérangement)`;
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
    if (ok && $('journal').textContent === 'En attente du TCO.') $('journal').textContent = 'Relié au TCO.';
  }, 500);
}};
