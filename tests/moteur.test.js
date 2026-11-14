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

    agir('TRAIN_APPROCHE');
    assert.ok(v().approche);
    agir('TRAIN_PEDALE');
    // Fermeture automatique : signal fermé alors que la manette est restée sur ouvert
    assert.ok(!v().sema.ouvert && v().sema.manette === 'ouvert' && v().sema.bloque && !v().approche);

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

essai('réinitialisation', () => {
  const m = Moteur.creer();
  m.agir({ type: 'AMONT_ANNONCE', voie: 'V1' });
  m.agir({ type: 'REINITIALISER' });
  assert.deepStrictEqual(m.lire(), Moteur.etatInitial());
});

console.log('Tous les tests passent.');
