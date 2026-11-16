// ==========================================================
// Simulateur BMDV — mini guides, ouverts par le bouton GUIDE du TCO
//  1. Faire circuler un train entre Alfa (A), Bravo (B) et Charlie (C)
//  2. Gare temporaire : cesser et reprendre le service de Bravo (ES / HS)
// Rappels synthétiques rédigés pour le simulateur.
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
        'Appuyer <b>en même temps</b> sur <b>Sonnerie</b> et <b>Reddition</b> côté Alfa (les deux boutons reliés par l\'accolade). À la souris : Sonnerie, puis Reddition avant que l\'anneau ne se vide.',
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


  // ---------- Gare temporaire : cessation et reprise ----------
  // schéma : deux voies A–B–C, commutateur de gare, sémaphores de B, dépêche éventuelle
  // fleche : 'B>AC' (B s'adresse à A et C), 'AC>B' (A et C répondent à B), 'A>C' (block direct)
  const CESSATION = [
    {
      qui: 'B', titre: 'Vérifier que Bravo peut cesser', gare: 'ES', sema: 'ferme',
      actions: [
        'Aucune opération de sécurité en cours, et les trains prévus avant la cessation sont passés (aucun n\'a Bravo pour origine, terminus ou garage).',
        'Cantons libres sur les deux voies : <b>voie libre reçue</b> derrière le dernier train expédié, et <b>voie libre rendue</b> derrière le dernier train annoncé (ou aucun train depuis la reprise).',
        'Mesures de sécurité en cours éventuelles : les reporter au poste concerné avant de cesser.',
      ],
      effets: [['blanc', 'Voie libre côté Alfa et côté Charlie'], ['eteint', 'Reddition (aucune annonce en attente)']],
    },
    {
      qui: 'B', titre: 'Ouvrir les signaux, passer le commutateur sur HS', gare: 'HS', sema: 'ouvert',
      actions: [
        'Ouvrir les deux sémaphores : manettes <b>en haut</b>.',
        'Placer le commutateur de gare sur <b>HS</b> : les appareils de block de Bravo sont mis hors circuit et la fermeture automatique des sémaphores est annulée.',
      ],
      effets: [['eteint', 'Voyants des sémaphores'], ['blanc', 'Commutateur GARE sur HS'], ['eteint', 'Voyants de block de Bravo']],
    },
    {
      qui: 'B', titre: 'Aviser Alfa et Charlie', gare: 'HS', sema: 'ouvert', fleche: 'B>AC',
      depeche: 'B à A et C — Je cesse le service de la circulation et le block à 22 h 30 min.',
      actions: [
        'Transmettre la dépêche, puis mettre le téléphone en communication directe Alfa – Charlie.',
        'Registre de Bravo : « Cessation » / « à 22 h 30 min. » sur les deux pages. Alfa et Charlie notent « Cessation de Bravo à 22 h 30 ».',
      ],
      effets: [],
    },
    {
      qui: 'A', titre: 'Alfa et Charlie font le block entre eux', gare: 'HS', sema: 'ouvert', fleche: 'A>C', train: 0.5,
      actions: [
        'Le canton s\'étend d\'Alfa à Charlie : Alfa annonce directement à Charlie, Charlie rend voie libre à Alfa.',
        'Le train passe à Bravo sous sémaphore ouvert, sans que Bravo n\'intervienne.',
      ],
      effets: [['jaune', 'Côté formateur : pupitres « Block direct »']],
    },
  ];
  const REPRISE = [
    {
      qui: 'B', titre: 'Demander à reprendre', gare: 'HS', sema: 'ouvert', fleche: 'B>AC',
      actions: [
        'À l\'heure prévue, Bravo remet son téléphone en circuit et demande verbalement à Alfa et à Charlie s\'il peut reprendre.',
      ],
      effets: [],
    },
    {
      qui: 'A', titre: 'Alfa et Charlie donnent leur accord', gare: 'HS', sema: 'ouvert', fleche: 'AC>B',
      depeche: 'A à B — Canton AC libre. Pouvez reprendre le service de la circulation.',
      actions: [
        'Chacun vérifie qu\'aucune opération de sécurité n\'est en cours et que son canton est libre : voie libre reçue derrière le dernier train expédié, ou aucun train expédié depuis la cessation.',
        'Il reporte à Bravo les mesures de sécurité en cours, puis transmet la dépêche (Charlie : « Canton CA libre… »).',
      ],
      effets: [],
    },
    {
      qui: 'B', titre: 'Remettre le block en service', gare: 'ES', sema: 'ferme',
      actions: [
        'Placer le commutateur de gare sur <b>ES</b> : le block de Bravo est rétabli, ainsi que la fermeture automatique des sémaphores.',
        'Remettre les signaux dans leur position normale (manettes <b>en bas</b>, fermés).',
      ],
      effets: [['eteint', 'Commutateur GARE (ES)'], ['blanc', 'Voie libre côté Alfa et côté Charlie'], ['rouge', 'Voyants des sémaphores']],
    },
    {
      qui: 'B', titre: 'Aviser Alfa et Charlie', gare: 'ES', sema: 'ferme', fleche: 'B>AC',
      depeche: 'B à A et C — Je reprends le block et le service de la circulation à 6 h 00 min.',
      actions: [
        'Registre de Bravo : « Reprise » / « à 6 h 00 min. » (avec « Journée du… » si c\'est la première reprise de la journée). Alfa et Charlie notent « Reprise de Bravo à 6 h 00 ».',
        'Les trains suivants sont de nouveau annoncés à Bravo.',
      ],
      effets: [],
    },
  ];

  function schemaGare(e) {
    const posteB = e.gare === 'HS' ? 'poste hs' : 'poste';
    const cadre = (lettre, px, classe) => `
      <rect x="${px - 15}" y="4" width="30" height="24" rx="4" class="${lettre === e.qui || (e.qui === 'A' && lettre === 'C' && /C/.test(e.fleche || '')) ? classe + ' actif' : classe}"/>
      <text x="${px}" y="21" class="lettre${lettre === e.qui ? ' actif' : ''}">${lettre}</text>`;
    const fleches = {
      'B>AC': '<path d="M182 16 H62 m6 -5 l-6 5 l6 5 M218 16 H338 m-6 -5 l6 5 l-6 5" class="depeche"/>',
      'AC>B': '<path d="M58 16 H178 m-6 -5 l6 5 l-6 5 M342 16 H222 m6 -5 l-6 5 l6 5" class="depeche"/>',
      'A>C': '<path d="M58 34 Q200 26 342 34 m-7 -6 l7 6 l-8 3" class="depeche"/>',
    };
    const x = e.train != null ? 40 + e.train * 320 : null;
    return `
      <svg viewBox="0 0 400 96" class="schema" aria-hidden="true">
        ${fleches[e.fleche] || ''}
        ${cadre('A', 40, 'poste')}${cadre('B', 200, posteB)}${cadre('C', 360, 'poste')}
        <text x="182" y="42" class="etiquette">${e.gare}</text>
        <rect x="20" y="52" width="360" height="6" rx="2" class="voie"/>
        <rect x="20" y="78" width="360" height="6" rx="2" class="voie"/>
        <text x="14" y="58" class="nvoie">1</text><text x="14" y="84" class="nvoie">2</text>
        <circle cx="212" cy="46" r="5.5" class="feu ${e.sema}"/>
        <circle cx="188" cy="90" r="5.5" class="feu ${e.sema}"/>
        ${x != null ? `<rect x="${x - 20}" y="46" width="40" height="18" rx="5" class="train"/>
          <path d="M${x + 24} 55 l8 0 m-4 -4 l4 4 l-4 4" class="fleche"/>` : ''}
      </svg>`;
  }

  // ---------- Mise en page commune ----------
  function etapesHtml(etapes, dessin) {
    return `<ol>${etapes.map((e, i) => `
      <li>
        <div class="texte">
          <h2><span class="num">${i + 1}</span><span class="qui">${e.qui === 'A' && /C|AC/.test(e.fleche || e.titre) ? 'A · C' : e.qui}</span>${e.titre}</h2>
          <ul>${e.actions.map((a) => `<li>${a}</li>`).join('')}</ul>
          ${e.depeche ? `<p class="depeche-texte">« ${e.depeche} »</p>` : ''}
          ${e.effets.length ? `<p class="effets">Sur le TCO : ${e.effets.map(([c, t]) => `<span class="puce ${c}"></span>${t}`).join(' ')}</p>` : ''}
        </div>
        ${dessin(e)}
      </li>`).join('')}</ol>`;
  }

  const CIRCULATION = `
    <p class="principe">Un seul train par canton. Chaque poste <b>annonce</b> le train au poste suivant,
      puis <b>rend voie libre</b> au poste précédent une fois le train passé complet.
      <small>Sens impair, voie 1 : Alfa → Bravo → Charlie.</small></p>
    ${etapesHtml(ETAPES, schema)}
    <p class="note"><b>Sens pair, voie 2 :</b> même enchaînement de Charlie vers Alfa, avec les boutons de l'autre colonne
      (Reddition côté Charlie, Annonce côté Alfa).</p>
    <p class="note"><b>À retenir :</b> tant que le poste suivant n'a pas rendu voie libre, le sémaphore reste bloqué fermé.</p>`;

  const GARE = `
    <p class="principe">Bravo est une <b>gare temporaire</b> : elle peut cesser le service de la circulation
      (commutateur de gare sur <b>HS</b>) puis le reprendre (<b>ES</b>). Pendant la cessation, ses signaux restent ouverts
      et Alfa et Charlie font le block directement entre eux. Exemple : cessation à 22 h 30, reprise à 6 h 00.</p>
    <h3>Cessation <small>ES → HS</small></h3>
    ${etapesHtml(CESSATION, schemaGare)}
    <h3>Reprise <small>HS → ES</small></h3>
    ${etapesHtml(REPRISE, schemaGare)}
    <p class="note"><b>Cas particuliers :</b> block en dérangement à la reprise → cantonnement téléphonique substitué, inscrit au registre ;
      reprise sur une seule voie possible si chaque sens a son propre commutateur ; reprise alors qu'un canton est occupé → procédure de secours de la consigne.</p>
    <p class="note"><b>Dans le simulateur :</b> le commutateur ne s'oppose pas à une manœuvre irrégulière (annonce en attente, sémaphore fermé…) :
      il l'exécute et affiche une alerte, comme dans la réalité où la vérification revient à l'agent.</p>
    <p class="note">Rappel rédigé pour le simulateur : la consigne de la gare temporaire fait foi.</p>`;

  const dialogue = document.createElement('dialog');
  dialogue.id = 'guide';
  dialogue.innerHTML = `
    <header>
      <h1>Guide</h1>
      <nav class="onglets">
        <button data-onglet="circulation" class="actif">Faire circuler un train</button>
        <button data-onglet="gare">Gare temporaire (ES / HS)</button>
      </nav>
      <button class="fermer" aria-label="Fermer le guide">✕</button>
    </header>
    <section data-onglet="circulation">${CIRCULATION}</section>
    <section data-onglet="gare" hidden>${GARE}</section>`;
  document.body.append(dialogue);

  function montrer(onglet) {
    dialogue.querySelectorAll('.onglets button').forEach((b) => b.classList.toggle('actif', b.dataset.onglet === onglet));
    dialogue.querySelectorAll('section[data-onglet]').forEach((s) => { s.hidden = s.dataset.onglet !== onglet; });
    dialogue.scrollTop = 0;
  }
  dialogue.querySelectorAll('.onglets button').forEach((b) => b.addEventListener('click', () => montrer(b.dataset.onglet)));
  dialogue.querySelector('.fermer').addEventListener('click', () => dialogue.close());
  dialogue.addEventListener('click', (e) => { if (e.target === dialogue) dialogue.close(); });
  document.getElementById('BTN_GUIDE').addEventListener('click', () => dialogue.showModal());
  // Ouvrir directement sur le guide de la gare (utilisé par d'autres écrans)
  window.Guide = { ouvrir(onglet = 'circulation') { montrer(onglet); dialogue.showModal(); } };
})();
