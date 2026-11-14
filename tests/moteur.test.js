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

essai('un train parcourt la voie et actionne la pédale', () => {
  const m = Moteur.creer();
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
  const m = Moteur.creer();
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
  const m = Moteur.creer();
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

essai('réinitialisation', () => {
  const m = Moteur.creer();
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  m.agir({ type: 'REINITIALISER' });
  assert.deepStrictEqual(m.lire(), Moteur.etatInitial());
});

console.log('Tous les tests passent.');
