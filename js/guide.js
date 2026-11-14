// ==========================================================
// Simulateur BMDV — mini guide « Faire circuler un train »
// Ouvert par le bouton GUIDE du TCO. Rappel synthétique de
// l'enchaînement des actions entre Alfa (A), Bravo (B) et Charlie (C).
// ==========================================================
(function () {
  // position : avancement du train entre A (0) et C (1) ; sema : état du sémaphore de B
  const ETAPES = [
    {
      qui: 'A', titre: 'Alfa annonce le train', position: 0.04, sema: 'ferme',
      actions: ['Alfa vérifie que son voyant Voie libre est allumé, puis appuie sur <b>Annonce</b>.'],
      effets: [['jaune', 'Reddition côté Alfa'], ['blanc', 'Sonnerie']],
    },
    {
      qui: 'B', titre: 'Bravo reçoit l\'annonce', position: 0.22, sema: 'ouvert',
      actions: [
        'Arrêter la sonnerie avec le bouton <b>Sonnerie</b> et annoter le registre.',
        'Ouvrir le sémaphore : manette <b>en haut</b>. Vérifier qu\'il a obéi (voyant éteint).',
      ],
      effets: [['eteint', 'Voyant du sémaphore'], ['jaune', 'Voyant Annonce à l\'approche du train']],
    },
    {
      qui: 'B', titre: 'Le train franchit le sémaphore', position: 0.56, sema: 'ferme',
      actions: [
        'Le sémaphore se ferme tout seul derrière le train et la sonnerie retentit : l\'arrêter.',
        'Confirmer la fermeture : manette <b>en bas</b>.',
      ],
      effets: [['rouge', 'Voyant du sémaphore'], ['rouge', 'Commutateur'], ['blanc', 'Sonnerie']],
    },
    {
      qui: 'B', titre: 'Bravo annonce le train à Charlie', position: 0.66, sema: 'ferme',
      actions: ['Vérifier que le voyant <b>Voie libre</b> côté Charlie est allumé, puis appuyer sur <b>Annonce</b>.'],
      effets: [['rouge', 'Annonce côté Charlie'], ['eteint', 'Voie libre côté Charlie']],
    },
    {
      qui: 'B', titre: 'Bravo rend voie libre à Alfa', position: 0.76, sema: 'ferme',
      actions: [
        'S\'assurer que le train est <b>complet</b> et annoter le registre.',
        'Appuyer <b>en même temps</b> sur <b>Sonnerie</b> et <b>Reddition</b> côté Alfa.',
      ],
      effets: [['eteint', 'Reddition côté Alfa'], ['blanc', 'Voie libre d\'Alfa (chez Alfa)']],
    },
    {
      qui: 'C', titre: 'Charlie rend voie libre à Bravo', position: 0.96, sema: 'ferme',
      actions: [
        'À l\'arrivée du train complet, Charlie appuie sur Reddition.',
        'Bravo arrête la sonnerie. Le sémaphore est débloqué : il peut être rouvert pour le train suivant.',
      ],
      effets: [['eteint', 'Annonce côté Charlie'], ['blanc', 'Voie libre côté Charlie'], ['blanc', 'Sonnerie']],
    },
  ];

  function schema(etape) {
    const x = 40 + etape.position * 320;
    const poste = (lettre, px) => `
      <rect x="${px - 15}" y="6" width="30" height="24" rx="4" class="${lettre === etape.qui ? 'poste actif' : 'poste'}"/>
      <text x="${px}" y="23" class="lettre${lettre === etape.qui ? ' actif' : ''}">${lettre}</text>`;
    return `
      <svg viewBox="0 0 400 70" class="schema" aria-hidden="true">
        ${poste('A', 40)}${poste('B', 200)}${poste('C', 360)}
        <rect x="20" y="46" width="360" height="7" rx="2" class="voie"/>
        <line x1="212" y1="34" x2="212" y2="46" class="mat"/>
        <circle cx="212" cy="34" r="6" class="feu ${etape.sema}"/>
        <rect x="${x - 22}" y="40" width="44" height="19" rx="5" class="train"/>
        <path d="M${x + 26} 49.5 l8 0 m-4 -4 l4 4 l-4 4" class="fleche"/>
      </svg>`;
  }

  const dialogue = document.createElement('dialog');
  dialogue.id = 'guide';
  dialogue.innerHTML = `
    <header>
      <h1>Faire circuler un train <small>sens impair, voie 1 : Alfa → Bravo → Charlie</small></h1>
      <button class="fermer" aria-label="Fermer le guide">✕</button>
    </header>
    <p class="principe">Un seul train par canton. Chaque poste <b>annonce</b> le train au poste suivant,
      puis <b>rend voie libre</b> au poste précédent une fois le train passé complet.</p>
    <ol>
      ${ETAPES.map((e, i) => `
        <li>
          <div class="texte">
            <h2><span class="num">${i + 1}</span><span class="qui">${e.qui}</span>${e.titre}</h2>
            <ul>${e.actions.map((a) => `<li>${a}</li>`).join('')}</ul>
            <p class="effets">Sur le TCO : ${e.effets.map(([c, t]) => `<span class="puce ${c}"></span>${t}`).join(' ')}</p>
          </div>
          ${schema(e)}
        </li>`).join('')}
    </ol>
    <p class="note"><b>Sens pair, voie 2 :</b> même enchaînement de Charlie vers Alfa, avec les boutons de l'autre colonne
      (Reddition côté Charlie, Annonce côté Alfa).</p>
    <p class="note"><b>À retenir :</b> tant que le poste suivant n'a pas rendu voie libre, le sémaphore reste bloqué fermé.</p>`;
  document.body.append(dialogue);

  dialogue.querySelector('.fermer').addEventListener('click', () => dialogue.close());
  dialogue.addEventListener('click', (e) => { if (e.target === dialogue) dialogue.close(); });
  document.getElementById('BTN_GUIDE').addEventListener('click', () => dialogue.showModal());
})();
