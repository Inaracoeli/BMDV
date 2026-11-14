// Tests du moteur de block. Lancer avec : node tests/moteur.test.js
const assert = require('node:assert');
const Moteur = require('../js/moteur.js');

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
    assert.ok(v().annonceEmise);
    assert.ok(!agir('B_REDDITION').ok); // sans la sonnerie : sans effet
    assert.ok(agir('B_REDDITION', { sonnerieAppuyee: true }).ok);
    assert.ok(!v().annonceRecue);

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

const temps = (m, ms) => { for (let i = 0; i < ms / 100; i++) m.agir({ type: 'TEMPS', dt: 100 }); };
// Durées courtes et fixes pour les essais, indépendantes des réglages par défaut
const DUREES_ESSAI = { 'canton-amont': 5, annonce: 5, approche: 3, pedale: 1, 'zone-a': 5, 'zone-b': 5, 'canton-aval': 10, redemarrage: 0 };
const moteurEssai = () => {
  const m = Moteur.creer();
  Object.entries(DUREES_ESSAI).forEach(([nom, secondes]) => m.agir({ type: 'DUREE', nom, secondes }));
  return m;
};

essai('un train parcourt la voie et actionne la pédale', () => {
  const m = moteurEssai();
  const occ = () => Moteur.occupation(m.lire(), 'V1');
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '6508' });
  temps(m, 5500); // zone d'annonce
  assert.ok(occ().annonce && occ().saatAnnonce === '6508' && !occ().approche);
  temps(m, 5000); // zone d'approche
  assert.ok(!occ().annonce && occ().approche && occ().saatCarre === '6508' && occ().saatAnnonce === '');
  temps(m, 3000); // franchissement du signal
  const v = m.lire().voies.V1;
  assert.ok(!v.sema.ouvert && v.sema.bloque && v.sonnerieAnnonce && !v.arriveeSansAnnonce);
  temps(m, 1000);
  assert.ok(occ().zoneA && !occ().zoneB && occ().saatCarre === '6508');
  temps(m, 5000);
  assert.ok(!occ().zoneA && occ().zoneB && occ().saatCarre === '6508');
  temps(m, 5000); // z3 libérée : le numéro disparaît, le train roule vers Charlie
  assert.ok(!occ().zoneB && occ().saatCarre === '' && m.lire().trains.length === 1);
  temps(m, 10000);
  assert.strictEqual(m.lire().trains.length, 0);
});

essai('un train s\'arrête devant le signal fermé, repart à l\'ouverture', () => {
  const m = moteurEssai();
  m.agir({ type: 'TRAIN_CREER', voie: 'V2', numero: '77' });
  temps(m, 20000);
  const t = () => m.lire().trains[0];
  assert.ok(t().attente && Moteur.occupation(m.lire(), 'V2').approche);
  assert.ok(!m.lire().voies.V2.sema.bloque);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V2', position: 'ouvert' });
  temps(m, 200);
  assert.ok(!t().attente && m.lire().voies.V2.sema.bloque);
  assert.ok(m.lire().voies.V2.arriveeSansAnnonce); // jamais annoncé par Charlie
});

essai('outils formateur : arrêt, reprise, franchissement autorisé, vitesse, suppression', () => {
  const m = moteurEssai();
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '1', vitesse: 'rapide' });
  const t = () => m.lire().trains[0];
  temps(m, 2500); // 5 s de parcours à vitesse double
  assert.strictEqual(t().etape, 1);
  m.agir({ type: 'TRAIN_ARRETER', id: t().id });
  temps(m, 10000);
  assert.strictEqual(t().etape, 1);
  m.agir({ type: 'TRAIN_REPARTIR', id: t().id });
  temps(m, 10000);
  assert.ok(t().attente);
  m.agir({ type: 'TRAIN_FRANCHIR', id: t().id });
  temps(m, 200);
  assert.ok(!t().attente && t().etape === 3);
  m.agir({ type: 'TRAIN_SUPPRIMER', id: t().id });
  assert.strictEqual(m.lire().trains.length, 0);
});

essai('terminus Bravo : le train reste à quai sur la première zone', () => {
  const m = moteurEssai();
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  assert.ok(m.agir({ type: 'TRAIN_CREER', numero: '9', origine: 'Alfa', destination: 'Bravo' }).ok);
  temps(m, 60000);
  const t = m.lire().trains[0];
  assert.ok(t.terminus && t.voie === 'V1' && Moteur.occupation(m.lire(), 'V1').zoneA);
});

essai('départ de Bravo : à quai jusqu\'à l\'ordre de départ, sans actionner la pédale', () => {
  const m = moteurEssai();
  assert.ok(m.agir({ type: 'TRAIN_CREER', numero: '10', origine: 'Bravo', destination: 'Alfa' }).ok);
  const t = () => m.lire().trains[0];
  assert.ok(t().voie === 'V2' && t().arrete && Moteur.occupation(m.lire(), 'V2').zoneA);
  temps(m, 10000);
  assert.ok(Moteur.occupation(m.lire(), 'V2').zoneA);
  m.agir({ type: 'TRAIN_REPARTIR', id: t().id });
  temps(m, 5500);
  assert.ok(Moteur.occupation(m.lire(), 'V2').zoneB && !m.lire().voies.V2.sema.bloque);
  temps(m, 16000);
  assert.strictEqual(m.lire().trains.length, 0);
});

essai('parcours impossibles refusés, durées par défaut', () => {
  const m = Moteur.creer();
  assert.ok(!m.agir({ type: 'TRAIN_CREER', origine: 'Bravo', destination: 'Bravo' }).ok);
  const d = m.lire().durees;
  assert.ok(d['canton-amont'] === 30000 && d['canton-aval'] === 30000);
  assert.ok(d.annonce === 10000 && d.approche === 10000 && d['zone-a'] === 10000 && d['zone-b'] === 10000);
});

essai('inertie : le train met quelques secondes à repartir après l\'ouverture du signal', () => {
  const m = moteurEssai();
  m.agir({ type: 'DUREE', nom: 'redemarrage', secondes: 4 });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '5' });
  temps(m, 20000);
  const t = () => m.lire().trains[0];
  assert.ok(t().attente);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  temps(m, 3000);
  assert.ok(t().attente && t().etape === 2); // pas encore reparti
  temps(m, 1500);
  assert.ok(!t().attente && t().etape === 3);
});

essai('inertie : si le signal se referme pendant le redémarrage, le train reste arrêté', () => {
  const m = moteurEssai();
  m.agir({ type: 'DUREE', nom: 'redemarrage', secondes: 4 });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '5' });
  temps(m, 20000);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  temps(m, 2000);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ferme' });
  temps(m, 10000);
  assert.ok(m.lire().trains[0].attente && m.lire().trains[0].etape === 2);
});

essai('EAP : enclenchée si ZAP occupée et carré ouvert, s\'oppose à la fermeture du carré', () => {
  const m = moteurEssai();
  const occ = () => Moteur.occupation(m.lire(), 'V1');
  assert.ok(!occ().eap);
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '5' });
  temps(m, 11000); // en ZAP
  assert.ok(occ().approche && occ().eap);
  assert.ok(!m.agir({ type: 'B_CARRE', voie: 'V1', ferme: true }).ok);
  assert.ok(!m.lire().voies.V1.carre.ferme);
  m.agir({ type: 'TRAIN_SUPPRIMER', id: m.lire().trains[0].id });
  assert.ok(!occ().eap); // ZAP libérée
  assert.ok(m.agir({ type: 'B_CARRE', voie: 'V1', ferme: true }).ok);
});

essai('carré fermé avant l\'arrivée du train : pas d\'EAP, le train s\'arrête même sémaphore ouvert', () => {
  const m = moteurEssai();
  m.agir({ type: 'B_CARRE', voie: 'V1', ferme: true });
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '5' });
  temps(m, 20000);
  assert.ok(m.lire().trains[0].attente && !Moteur.occupation(m.lire(), 'V1').eap);
  m.agir({ type: 'B_CARRE', voie: 'V1', ferme: false });
  temps(m, 500);
  assert.ok(!m.lire().trains[0].attente);
});

essai('postes automatiques : Alfa annonce au départ, Charlie rend voie libre à l\'arrivée', () => {
  const m = moteurEssai();
  m.agir({ type: 'REGLAGE', nom: 'postesAutomatiques', actif: true });
  const v = () => m.lire().voies.V1;
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '1' });
  assert.ok(v().annonceRecue && v().sonnerieAnnonce && !m.lire().trains[0].attenteDepart);
  // Second train : Alfa n'a pas voie libre, il attend à Alfa
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '2' });
  assert.ok(m.lire().trains[1].attenteDepart);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  temps(m, 14000); // le train 1 a franchi le signal
  assert.strictEqual(m.lire().trains[1].etape, 0);
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ferme' });
  m.agir({ type: 'B_ANNONCE', voie: 'V1' });
  assert.ok(m.agir({ type: 'B_REDDITION', voie: 'V1', sonnerieAppuyee: true }).ok);
  temps(m, 200); // voie libre rendue : Alfa annonce et expédie le train 2
  assert.ok(v().annonceRecue && !m.lire().trains[1].attenteDepart);
  temps(m, 20500); // le train 1 arrive à Charlie
  assert.ok(v().annonceEmise);
  temps(m, 3500); // Charlie rend voie libre après un court délai
  assert.ok(!v().annonceEmise && v().sonnerieReddition && !v().sema.bloque);
});

essai('postes automatiques : Charlie ne rend pas voie libre si Bravo n\'a pas annoncé', () => {
  const m = moteurEssai();
  m.agir({ type: 'REGLAGE', nom: 'postesAutomatiques', actif: true });
  m.agir({ type: 'B_SEMAPHORE', voie: 'V1', position: 'ouvert' });
  m.agir({ type: 'TRAIN_CREER', voie: 'V1', numero: '1' });
  temps(m, 45000);
  const v = m.lire().voies.V1;
  assert.ok(m.lire().trains.length === 0 && v.sema.bloque && v.arrivesAval === 1);
  m.agir({ type: 'B_ANNONCE', voie: 'V1' }); // annonce tardive : Charlie rend alors voie libre
  temps(m, 3500);
  assert.ok(!m.lire().voies.V1.sema.bloque);
});

essai('réinitialisation', () => {
  const m = Moteur.creer();
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  m.agir({ type: 'REINITIALISER' });
  assert.deepStrictEqual(m.lire(), Moteur.etatInitial());
});

console.log('Tous les tests passent.');
