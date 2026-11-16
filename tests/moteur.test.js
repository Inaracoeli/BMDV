// Tests du moteur de block. Lancer avec : node tests/moteur.test.js
const assert = require('node:assert');
const Moteur = require('../js/moteur.js');

// Les essais se font avec Alfa et Charlie joués à la main, sauf mention contraire
const creerManuel = Moteur.creer;
Moteur.creer = (...args) => {
  const m = creerManuel(...args);
  if (!args.length) m.agir({ type: 'REGLAGE', nom: 'postesAutomatiques', actif: false });
  return m;
};

function essai(nom, f) {
  f();
  console.log('ok  ' + nom);
}

['V1', 'V2'].forEach((voie) => {
  essai(`${voie} : séquence normale complète`, () => {
    const m = Moteur.creer();
    const v = () => m.lire().voies[voie];
    const agir = (type, plus) => m.agir({ type, voie, ...plus });

    assert.ok(agir('AMONT_ANNONCE').ok);
    assert.ok(v().annonceRecue && v().sonnerieAnnonce);
    assert.ok(agir('B_ARRET_SONNERIE', { sonnerie: 'annonce' }).ok);
    assert.ok(!v().sonnerieAnnonce);

    assert.ok(agir('B_SEMAPHORE').ok);
    assert.ok(v().sema.ouvert);

    agir('TRAIN_PEDALE');
    // Fermeture automatique : signal fermé alors que la manette est restée sur ouvert
    assert.ok(!v().sema.ouvert && v().sema.manette === 'ouvert' && v().sema.bloque);

    assert.ok(v().sonnerieAnnonce); // la pédale fait retentir la sonnerie
    agir('B_ARRET_SONNERIE', { sonnerie: 'annonce' });
    assert.ok(agir('B_SEMAPHORE').ok); // confirmation de fermeture
    assert.strictEqual(v().sema.manette, 'ferme');

    assert.ok(agir('B_ANNONCE').ok);
    assert.ok(v().annonceEmise && v().sonnerieAval);
    agir('AVAL_ARRET_SONNERIE');
    assert.ok(!v().sonnerieAval);
    assert.ok(!agir('B_REDDITION').ok); // sans la sonnerie : sans effet
    assert.ok(agir('B_REDDITION', { sonnerieAppuyee: true }).ok);
    assert.ok(!v().annonceRecue && v().sonnerieAmont);
    agir('AMONT_ARRET_SONNERIE');
    assert.ok(!v().sonnerieAmont);

    // Sémaphore bloqué tant que l'aval n'a pas rendu voie libre
    assert.ok(!agir('B_SEMAPHORE').ok);
    assert.ok(!v().sema.ouvert);
    agir('B_SEMAPHORE'); // retour sur fermé

    assert.ok(agir('AVAL_REDDITION').ok);
    assert.ok(!v().annonceEmise && v().sonnerieReddition && !v().sema.bloque);
    assert.ok(agir('B_ARRET_SONNERIE', { sonnerie: 'reddition' }).ok);
    assert.ok(agir('B_SEMAPHORE').ok);
    assert.ok(v().sema.ouvert);
  });
});

essai('les deux voies sont indépendantes', () => {
  const m = Moteur.creer();
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  assert.ok(!m.lire().voies.V2.annonceRecue);
});

essai('reddition sans effet sans annonce reçue', () => {
  const m = Moteur.creer();
  assert.ok(!m.agir({ type: 'B_REDDITION', voie: 'V1', sonnerieAppuyee: true }).ok);
});

essai('reddition sans effet si le sémaphore n\'est pas bloqué, sauf enclenchement levé', () => {
  const m = Moteur.creer();
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  assert.ok(!m.agir({ type: 'B_REDDITION', voie: 'V1', sonnerieAppuyee: true }).ok);
  m.agir({ type: 'ENCLENCHEMENT', nom: 'redditionSemaphoreBloque', actif: false });
  assert.ok(m.agir({ type: 'B_REDDITION', voie: 'V1', sonnerieAppuyee: true }).ok);
});

essai('reddition sans effet si le train est arrivé avant l\'annonce', () => {
  const m = Moteur.creer();
  m.agir({ type: 'TRAIN_PEDALE', voie: 'V1' });
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  m.agir({ type: 'B_ANNONCE', voie: 'V1' });
  assert.ok(!m.agir({ type: 'B_REDDITION', voie: 'V1', sonnerieAppuyee: true }).ok);
  m.agir({ type: 'ENCLENCHEMENT', nom: 'redditionAnnonceAvantArrivee', actif: false });
  assert.ok(m.agir({ type: 'B_REDDITION', voie: 'V1', sonnerieAppuyee: true }).ok);
});

essai('une seconde annonce est sans effet tant que voie libre n\'est pas rendue', () => {
  const m = Moteur.creer();
  assert.ok(m.agir({ type: 'AMONT_ANNONCE', voie: 'V2' }).ok);
  assert.ok(!m.agir({ type: 'AMONT_ANNONCE', voie: 'V2' }).ok);
  assert.ok(m.agir({ type: 'B_ANNONCE', voie: 'V2' }).ok);
  assert.ok(!m.agir({ type: 'B_ANNONCE', voie: 'V2' }).ok);
});

essai('sémaphore bloqué : ouverture possible si l\'enclenchement est levé', () => {
  const m = Moteur.creer();
  m.agir({ type: 'TRAIN_PEDALE', voie: 'V1' });
  assert.ok(!m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' }).ok);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ferme' });
  m.agir({ type: 'ENCLENCHEMENT', nom: 'blocageSemaphore', actif: false });
  assert.ok(m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' }).ok);
});

// ---------- Trains : modèle physique ----------
// Fait avancer le temps par pas de 0,25 s jusqu'à ce que la condition soit vraie
function jusqua(m, condition, maxSecondes = 2000) {
  let t = 0;
  while (!condition()) {
    m.agir({ type: 'TEMPS', dt: 250 });
    t += 0.25 * m.lire().acceleration;
    if (t > maxSecondes) throw new Error('délai dépassé');
  }
  return t;
}
const pendant = (m, secondes) => { for (let t = 0; t < secondes; t += 0.25) m.agir({ type: 'TEMPS', dt: 250 }); };
const train = (m) => m.lire().trains[0];
const occ = (m, voie = 'V1') => Moteur.occupation(m.lire(), voie);

essai('géométrie par défaut : PK validés', () => {
  const e = Moteur.etatInitial();
  const g1 = Moteur.geometrie(e, 'V1');
  const g2 = Moteur.geometrie(e, 'V2');
  const pk = (g, x) => Moteur.formatPK(g.pk(x));
  assert.deepStrictEqual(
    [pk(g1, 0), pk(g1, g1.debutAnnonce), pk(g1, g1.debutZap), pk(g1, g1.signal), pk(g1, g1.aiguille), pk(g1, g1.finZoneB), pk(g1, g1.fin)],
    ['100,000', '103,000', '108,500', '110,000', '110,900', '111,350', '121,000']);
  assert.deepStrictEqual(
    [pk(g2, 0), pk(g2, g2.debutAnnonce), pk(g2, g2.debutZap), pk(g2, g2.signal), pk(g2, g2.aiguille), pk(g2, g2.finZoneB), pk(g2, g2.fin)],
    ['121,000', '118,350', '112,850', '111,350', '110,500', '110,000', '100,000']);
  assert.deepStrictEqual([pk(g1, g1.quaiDebut), pk(g1, g1.quaiFin)], ['110,050', '110,450']);
  assert.deepStrictEqual([pk(g2, g2.quaiFin), pk(g2, g2.quaiDebut)], ['110,050', '110,450']);
});

essai('un train de 750 m occupe plusieurs zones à la fois, le SAAT suit', () => {
  const m = Moteur.creer();
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '50123', longueur: 750 });
  jusqua(m, () => occ(m).annonce);
  assert.strictEqual(occ(m).saatAnnonce, '50123');
  jusqua(m, () => occ(m).approche);
  assert.ok(!occ(m).annonce && occ(m).saatCarre === '50123');
  jusqua(m, () => occ(m).zoneA);
  assert.ok(occ(m).approche, 'ZAP et z1 occupées ensemble');
  assert.ok(m.lire().voies.V1.sema.bloque, 'pédale actionnée');
  jusqua(m, () => occ(m).zoneB);
  assert.ok(occ(m).zoneA, 'z1 et z3 occupées ensemble');
  jusqua(m, () => !occ(m).zoneB);
  assert.strictEqual(occ(m).saatCarre, '');
  jusqua(m, () => m.lire().trains.length === 0);
});

essai('un train court libère les zones bien plus vite qu\'un train long', () => {
  const duree = (longueur) => {
    const m = Moteur.creer();
    m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
    m.agir({ type: 'TRAIN_CREER', voie: 'V1', longueur, vitesse: 100 });
    jusqua(m, () => occ(m).zoneA);
    return jusqua(m, () => !occ(m).zoneA);
  };
  assert.ok(duree(750) > duree(50) + 20);
});

essai('signal fermé : le train freine et s\'arrête 20 m avant, repart après l\'inertie', () => {
  const m = Moteur.creer();
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '5', longueur: 300 });
  const g = Moteur.geometrie(m.lire(), 'V1');
  jusqua(m, () => train(m).v === 0);
  assert.ok(Math.abs(train(m).s - (g.signal - 20)) < 0.01);
  assert.ok(occ(m).approche && !occ(m).zoneA && !m.lire().voies.V1.sema.bloque);
  pendant(m, 30);
  assert.strictEqual(train(m).v, 0);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  pendant(m, 3);
  assert.strictEqual(train(m).v, 0); // inertie : pas encore reparti
  pendant(m, 1.5);
  assert.ok(train(m).v > 0);
  jusqua(m, () => m.lire().voies.V1.sema.bloque);
  assert.ok(m.lire().voies.V1.arriveeSansAnnonce); // jamais annoncé par Alfa
});

essai('inertie : si le signal se referme pendant le redémarrage, le train reste arrêté', () => {
  const m = Moteur.creer();
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '5' });
  jusqua(m, () => train(m).v === 0);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  pendant(m, 2);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ferme' });
  pendant(m, 20);
  assert.strictEqual(train(m).v, 0);
});

essai('signal fermé trop tard : le train le franchit et s\'arrête d\'urgence', () => {
  const m = Moteur.creer();
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '9', longueur: 300 });
  const g = Moteur.geometrie(m.lire(), 'V1');
  jusqua(m, () => train(m).s > g.signal - 150);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ferme' });
  let message = '';
  while (!(train(m).s > g.signal)) message += m.agir({ type: 'TEMPS', dt: 250 }).message || '';
  assert.ok(/sans autorisation/.test(message));
  jusqua(m, () => train(m).v === 0);
  assert.ok(train(m).arrete && train(m).s > g.signal);
});

essai('autorisation de franchir : le train repart et passe le signal fermé', () => {
  const m = Moteur.creer();
  m.agir({ type: 'TRAIN_CREER', voie: 'V2', numero: '77' });
  jusqua(m, () => train(m).v === 0);
  m.agir({ type: 'TRAIN_FRANCHIR', id: train(m).id });
  jusqua(m, () => m.lire().voies.V2.sema.bloque);
  assert.ok(!train(m).arrete && !train(m).franchir);
});

essai('terminus Bravo : arrêt en bout de quai, plus loin pour un 750 m', () => {
  const arret = (voie, longueur) => {
    const m = Moteur.creer();
    m.agir({ type: 'B_SEMAPHORE', voie, position: 'ouvert' });
    m.agir({ type: 'TRAIN_CREER', origine: voie === 'V1' ? 'Alfa' : 'Charlie', destination: 'Bravo', longueur });
    jusqua(m, () => train(m).terminus);
    return [Moteur.geometrie(m.lire(), voie), train(m), occ(m, voie)];
  };
  let [g, t, o] = arret('V1', 300);
  assert.ok(Math.abs(t.s - g.quaiFin) < 0.01 && o.zoneA && !o.approche);
  [g, t, o] = arret('V1', 750);
  assert.ok(t.s > g.quaiFin && t.s - 750 > g.signal && t.s < g.aiguille, 'la queue dégage le signal, la tête reste avant E');
  [g, t, o] = arret('V2', 300);
  assert.ok(Math.abs(t.s - g.quaiFin) < 0.01 && o.zoneB && !o.zoneA, 'à quai sur z4');
  [g, t, o] = arret('V2', 750);
  assert.ok(o.zoneA && o.zoneB, 'un 750 m dépasse du quai et engage F');
});

essai('départ de Bravo : à quai jusqu\'à l\'ordre de départ, sans actionner la pédale', () => {
  const m = Moteur.creer();
  assert.ok(m.agir({ type: 'TRAIN_CREER', numero: '10', origine: 'Bravo', destination: 'Alfa', longueur: 50 }).ok);
  assert.ok(train(m).voie === 'V2' && train(m).arrete && occ(m, 'V2').zoneB);
  pendant(m, 30);
  assert.strictEqual(train(m).v, 0);
  m.agir({ type: 'TRAIN_REPARTIR', id: train(m).id });
  jusqua(m, () => m.lire().trains.length === 0);
  assert.ok(!m.lire().voies.V2.sema.bloque);
});

essai('arrêt et reprise ordonnés par le formateur', () => {
  const m = Moteur.creer();
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', longueur: 50 });
  pendant(m, 5);
  m.agir({ type: 'TRAIN_ARRETER', id: train(m).id });
  jusqua(m, () => train(m).v === 0);
  const s = train(m).s;
  pendant(m, 30);
  assert.strictEqual(train(m).s, s);
  m.agir({ type: 'TRAIN_REPARTIR', id: train(m).id });
  pendant(m, 10);
  assert.ok(train(m).s > s);
});

essai('vitesse du simulateur : ×10 fait avancer dix fois plus vite', () => {
  const parcouru = (facteur) => {
    const m = Moteur.creer();
    m.agir({ type: 'ACCELERATION', facteur });
    m.agir({ type: 'TRAIN_CREER', voie: 'V1', vitesse: 100 });
    m.agir({ type: 'TEMPS', dt: 1000 });
    return train(m).s;
  };
  assert.ok(Math.abs(parcouru(10) - 10 * parcouru(1)) < 1);
  assert.ok(!Moteur.creer().agir({ type: 'ACCELERATION', facteur: 3 }).ok);
});

essai('longueurs de ligne réglables, la V2 retombe sur Alfa', () => {
  const m = Moteur.creer();
  m.agir({ type: 'LIGNE', voie: 'V1', nom: 'ligneApres', metres: 5000 });
  const g2 = Moteur.geometrie(m.lire(), 'V2');
  assert.strictEqual(Moteur.formatPK(g2.pk(0)), '116,350');
  assert.strictEqual(Moteur.formatPK(g2.pk(g2.fin)), '100,000');
});

essai('EAP : enclenchée si ZAP occupée et carré ouvert, libérée à la libération de z1', () => {
  const m = Moteur.creer();
  m.agir({ type: 'B_AU_E', position: 'A' });
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  assert.ok(!occ(m).eap);
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '5', longueur: 300 });
  jusqua(m, () => occ(m).approche);
  assert.ok(occ(m).eap);
  assert.ok(/EAP C1 libre/.test(m.agir({ type: 'B_VCM', numero: 1 }).message));
  jusqua(m, () => occ(m).zoneA && !occ(m).approche);
  assert.ok(occ(m).eap); // toujours enclenchée tant que z1 est occupée
  jusqua(m, () => !occ(m).zoneA);
  assert.ok(!occ(m).eap);
  assert.ok(m.agir({ type: 'B_VCM', numero: 1 }).ok);
});

essai('point E : Au E, Vcm, clé, serrure et levier dans l\'ordre du tableau', () => {
  const m = Moteur.creer();
  const e = () => m.lire().pointE;
  const v1 = () => m.lire().voies.V1;
  assert.strictEqual(m.lire().auE, 'I');
  assert.deepStrictEqual(m.lire().vcm, { 1: 'O', 2: 'O' });
  assert.ok(!m.agir({ type: 'B_VCM', numero: 1 }).ok); // pas d'Au E
  assert.ok(!m.agir({ type: 'B_CLE', cle: 'E' }).ok);  // clé prisonnière du Vcm sur O
  m.agir({ type: 'B_AU_E', position: 'A' });
  assert.ok(Moteur.conditions(m.lire()).aueDonnee);
  assert.ok(m.agir({ type: 'B_VCM', numero: 1 }).ok);
  assert.ok(v1().carre.ferme);
  // Un train s'arrête au carré fermé : ZAP occupée mais EAP libre
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '3' });
  jusqua(m, () => train(m).v === 0);
  assert.ok(occ(m).approche && !occ(m).eap);
  assert.ok(!m.agir({ type: 'B_LEVIER', aiguille: 'E' }).ok); // serrure verrouillée
  assert.ok(m.agir({ type: 'B_CLE', cle: 'E' }).ok);
  assert.strictEqual(e().cles.E, 'serrure');
  assert.ok(m.agir({ type: 'B_SERRURE', aiguille: 'E' }).ok);
  assert.ok(m.agir({ type: 'B_LEVIER', aiguille: 'E' }).ok);
  assert.strictEqual(e().aiguilles.E, 'renversee');
  assert.ok(!m.agir({ type: 'B_SERRURE', aiguille: 'E' }).ok); // aiguille renversée
  assert.ok(!m.agir({ type: 'B_CLE', cle: 'E' }).ok);           // serrure ouverte
  assert.ok(!m.agir({ type: 'B_VCM', numero: 1 }).ok);          // clé absente
  m.agir({ type: 'B_LEVIER', aiguille: 'E' });
  assert.ok(m.agir({ type: 'B_SERRURE', aiguille: 'E' }).ok);
  assert.ok(m.agir({ type: 'B_CLE', cle: 'E' }).ok);
  assert.ok(m.agir({ type: 'B_VCM', numero: 1 }).ok);
  assert.ok(!v1().carre.ferme);
  pendant(m, 6);
  assert.ok(train(m).v > 0);
});

essai('point E : Au E refusée tant que z1 ou z2 est occupée', () => {
  const m = Moteur.creer();
  m.agir({ type: 'B_AU_E', position: 'A' });
  m.agir({ type: 'B_SEMAPHORE', voie: 'V2', position: 'ouvert' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V2', numero: '2', longueur: 300 });
  jusqua(m, () => Moteur.occupation(m.lire(), 'V2').zoneA);
  assert.ok(!Moteur.conditions(m.lire()).aueDonnee);
  assert.ok(/Au E donnée/.test(m.agir({ type: 'B_VCM', numero: 1 }).message));
});

essai('historique de séance : manœuvres de Bravo effectuées et refusées, avec le motif', () => {
  const m = Moteur.creer();
  m.agir({ type: 'B_VCM', numero: 1 });
  m.agir({ type: 'B_AU_E', position: 'A' });
  m.agir({ type: 'B_VCM', numero: 1 });
  const h = m.lire().historique.filter((x) => x.qui === 'Bravo');
  assert.strictEqual(h.length, 3);
  assert.ok(!h[0].ok && /Au E donnée/.test(h[0].message) && h[2].ok);
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V2' });
  assert.strictEqual(m.lire().historique.slice(-1)[0].qui, 'Charlie');
});

essai('tableau d\'enclenchement modifiable, conservé à la réinitialisation', () => {
  const m = Moteur.creer();
  assert.ok(m.agir({ type: 'TABLEAU_CASE', ligne: 'vcm1F', colonne: 'aueDonnee', valeur: null }).ok);
  assert.ok(m.agir({ type: 'B_VCM', numero: 1 }).ok); // Au E n'est plus exigée
  assert.ok(!m.agir({ type: 'TABLEAU_CASE', ligne: 'aueDonnee', colonne: 'eap1Libre', valeur: true }).ok);
  m.agir({ type: 'TABLEAU_CASE', ligne: 'levierE', colonne: 'z1Libre', valeur: false });
  m.agir({ type: 'REINITIALISER' });
  assert.strictEqual(m.lire().tableau.levierE.z1Libre, false);
  assert.ok(!('aueDonnee' in m.lire().tableau.vcm1F));
  m.agir({ type: 'TABLEAU', tableau: 'defaut' });
  assert.deepStrictEqual(m.lire().tableau, Moteur.TABLEAU_DEFAUT);
});

essai('carré fermé : pas d\'EAP, le train s\'arrête même sémaphore ouvert', () => {
  const m = Moteur.creer();
  m.agir({ type: 'B_CARRE', voie: 'V1', ferme: true });
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '5' });
  jusqua(m, () => train(m).v === 0);
  assert.ok(occ(m).approche && !occ(m).eap);
  m.agir({ type: 'B_CARRE', voie: 'V1', ferme: false });
  pendant(m, 6);
  assert.ok(train(m).v > 0);
});

essai('postes automatiques : Alfa annonce au départ, Charlie rend voie libre à l\'arrivée', () => {
  const m = Moteur.creer();
  m.agir({ type: 'ACCELERATION', facteur: 10 });
  m.agir({ type: 'REGLAGE', nom: 'postesAutomatiques', actif: true });
  const v = () => m.lire().voies.V1;
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '1' });
  assert.ok(v().annonceRecue && v().sonnerieAnnonce && !train(m).attenteDepart);
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '2' });
  assert.ok(m.lire().trains[1].attenteDepart); // Alfa n'a pas voie libre
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  jusqua(m, () => v().sema.bloque);
  assert.strictEqual(m.lire().trains[1].s, 0);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ferme' });
  m.agir({ type: 'B_ANNONCE', voie: 'V1' });
  jusqua(m, () => !occ(m).approche); // le train 1 a complètement franchi le signal
  assert.ok(m.agir({ type: 'B_REDDITION', voie: 'V1', sonnerieAppuyee: true }).ok);
  m.agir({ type: 'TEMPS', dt: 100 });
  assert.ok(v().annonceRecue && !m.lire().trains[1].attenteDepart); // Alfa expédie le train 2
  jusqua(m, () => !v().annonceEmise); // Charlie rend voie libre après l'arrivée du train 1
  assert.ok(v().sonnerieReddition && !v().sema.bloque && m.lire().trains.length === 1);
});

essai('Alfa et Charlie automatiques par défaut à l\'ouverture et après réinitialisation', () => {
  assert.strictEqual(Moteur.etatInitial().reglages.postesAutomatiques, true);
  const m = creerManuel();
  assert.strictEqual(m.lire().reglages.postesAutomatiques, true);
  m.agir({ type: 'REGLAGE', nom: 'postesAutomatiques', actif: false });
  m.agir({ type: 'REINITIALISER' });
  assert.strictEqual(m.lire().reglages.postesAutomatiques, true);
});

essai('gare hors service : Alfa et Charlie font le block directement entre eux', () => {
  const m = Moteur.creer();
  const v = () => m.lire().voies.V1;
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  m.agir({ type: 'B_SEMAPHORE', voie: 'V2', position: 'ouvert' });
  const r = m.agir({ type: 'B_GARE', position: 'HS' });
  assert.ok(r.ok && !r.alerte && m.lire().gare === 'HS');
  // Les appareils de Bravo sont hors circuit
  assert.ok(!m.agir({ type: 'B_ANNONCE', voie: 'V1' }).ok);
  // Alfa annonce directement à Charlie ; une seconde annonce attend la voie libre de Charlie
  assert.ok(/à Charlie/.test(m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' }).message));
  assert.ok(v().directe && v().sonnerieAval && !v().annonceRecue);
  assert.ok(!m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' }).ok);
  // Le train passe à Bravo sans fermer le sémaphore (aubinage annulé)
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '9', longueur: 50 });
  jusqua(m, () => occ(m).zoneA);
  assert.ok(v().sema.ouvert && !v().sema.bloque && !v().sonnerieAnnonce);
  jusqua(m, () => m.lire().trains.length === 0);
  // Charlie rend voie libre directement à Alfa
  assert.ok(/à Alfa/.test(m.agir({ type: 'AVAL_REDDITION', voie: 'V1' }).message));
  assert.ok(!v().directe && v().sonnerieAmont);
});

essai('gare hors service, postes automatiques : Alfa expédie vers Charlie, qui rend voie libre', () => {
  const m = Moteur.creer();
  m.agir({ type: 'ACCELERATION', facteur: 20 });
  m.agir({ type: 'REGLAGE', nom: 'postesAutomatiques', actif: true });
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  m.agir({ type: 'B_GARE', position: 'HS' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '1' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '2' });
  assert.ok(m.lire().voies.V1.directe && m.lire().trains[1].attenteDepart);
  jusqua(m, () => !m.lire().trains.some((t) => t.numero === '1'));
  jusqua(m, () => !m.lire().trains[0].attenteDepart); // voie libre rendue : le train 2 part
  assert.ok(m.lire().voies.V1.directe);
});

essai('gare : cessation signalée si les conditions ne sont pas réunies, reprise sur état propre', () => {
  const m = Moteur.creer();
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  const r = m.agir({ type: 'B_GARE', position: 'HS' });
  assert.ok(r.alerte && /voie libre non rendue à Alfa/.test(r.message) && /sémaphore fermé/.test(r.message));
  const r2 = m.agir({ type: 'B_GARE', position: 'ES' });
  assert.ok(!r2.alerte && m.lire().gare === 'ES');
  const v1 = m.lire().voies.V1;
  assert.ok(!v1.annonceRecue && !v1.annonceEmise);
  assert.ok(m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' }).ok);
});

essai('reprise en canton occupé : train en détresse entre Bravo et Charlie', () => {
  const m = Moteur.creer();
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  m.agir({ type: 'B_GARE', position: 'HS' });
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '7', longueur: 50 });
  jusqua(m, () => occ(m).zoneB);
  m.agir({ type: 'TRAIN_ARRETER', id: m.lire().trains[0].id }); // détresse
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ferme' });
  const r = m.agir({ type: 'B_GARE', position: 'ES' });
  assert.ok(r.alerte && /canton occupé/.test(r.message) && /Bravo–Charlie considéré occupé \(train 7\)/.test(r.message));
  const v = m.lire().voies.V1;
  assert.ok(v.annonceEmise && !v.annonceRecue && !v.sema.ouvert && v.sema.bloque);
  // Le canton Alfa–Bravo est libre : Alfa peut annoncer le train suivant à Bravo
  assert.ok(/à Bravo/.test(m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' }).message));
  // Secours terminé : le train repart, arrive à Charlie qui rend voie libre à Bravo
  m.agir({ type: 'TRAIN_REPARTIR', id: m.lire().trains[0].id });
  jusqua(m, () => m.lire().trains.length === 0);
  assert.ok(/à Bravo/.test(m.agir({ type: 'AVAL_REDDITION', voie: 'V1' }).message));
  assert.ok(!m.lire().voies.V1.sema.bloque);
});

essai('reprise en canton occupé : train encore entre Alfa et Bravo', () => {
  const m = Moteur.creer();
  m.agir({ type: 'B_GARE', position: 'HS' });
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '9', longueur: 300 });
  pendant(m, 20000);
  const r = m.agir({ type: 'B_GARE', position: 'ES' });
  assert.ok(r.alerte && /Alfa–Bravo occupé \(train 9\)/.test(r.message));
  const v = m.lire().voies.V1;
  assert.ok(v.annonceRecue && !v.annonceEmise);
});

essai('réinitialisation', () => {
  const m = Moteur.creer();
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1' });
  m.agir({ type: 'REINITIALISER' });
  const { historique, ...reste } = m.lire();
  const { historique: h0, ...attendu } = Moteur.etatInitial();
  assert.deepStrictEqual(reste, attendu);
  assert.strictEqual(historique.length, 1); // seule la réinitialisation est notée
});

console.log('Tous les tests passent.');
