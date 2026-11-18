// ==========================================================
// Y-TECH — registre de cantonnement du poste de Bravo
// Double page : trains impairs (voie 1) à gauche, trains pairs
// (voie 2) à droite, les lignes se correspondent d'une page à
// l'autre. Les mentions (Journée du…, Cessation, Reprise…)
// s'écrivent à cheval sur les deux pages.
// Saisie conservée dans le navigateur (localStorage).
// Vues : Saisie / Exemples / Tenue du registre, et impression.
// ==========================================================
const Registre = (function () {
  const CLE = 'bmdv-registre';
  const COLONNES = ['train', 'ar', 'vlr', 'ae', 'vlx', 'arr', 'pas', 'dep', 'obs'];
  const HEURES = ['ar', 'vlr', 'ae', 'vlx', 'arr', 'pas', 'dep'];
  const LIGNES_MINI = 30;
  const LIGNES_PAR_PAGE = 24;

  const echapper = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ligneVide = () => ({ type: 'train', impair: {}, pair: {} });
  const estVide = (l) => l.type === 'train'
    && !COLONNES.some((c) => (l.impair[c] || '').trim() || (l.pair[c] || '').trim());

  // Heures au format du registre : 8.52
  const heureCourte = (d = new Date()) => `${d.getHours()}.${String(d.getMinutes()).padStart(2, '0')}`;
  const heureLongue = (d = new Date()) => `à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')} min.`;
  const dateLongue = (d = new Date()) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ---------- Données ----------
  let donnees;
  function charger() {
    try { donnees = JSON.parse(localStorage.getItem(CLE)); } catch (e) { donnees = null; }
    if (!donnees || !Array.isArray(donnees.lignes)) donnees = { commence: '', lignes: [] };
    completer();
  }
  function enregistrer() {
    try { localStorage.setItem(CLE, JSON.stringify(donnees)); } catch (e) { /* stockage indisponible */ }
  }
  function completer() {
    let vides = 0;
    for (let i = donnees.lignes.length - 1; i >= 0 && estVide(donnees.lignes[i]); i--) vides++;
    while (donnees.lignes.length < LIGNES_MINI || vides < 10) { donnees.lignes.push(ligneVide()); vides++; }
  }
  // Une mention s'insère sous la dernière ligne écrite
  function insererMention(gauche, droite) {
    let i = donnees.lignes.length;
    while (i > 0 && estVide(donnees.lignes[i - 1])) i--;
    donnees.lignes.splice(i, 0, { type: 'mention', gauche, droite });
    completer();
    enregistrer();
    rendreSaisie();
    const champ = corps.querySelector(`tr[data-i="${i}"] input[data-cote="droite"]`);
    if (champ) champ.focus();
  }

  // ---------- Exemples (fictifs, ligne Alfa – Bravo – Charlie) ----------
  const T = (impair = {}, pair = {}, note) => ({ type: 'train', impair, pair, note });
  const M = (gauche, droite, note) => ({ type: 'mention', gauche, droite, note });
  const EXEMPLES = [
    M('Journée du', 'lundi 16 novembre 2026', 1),
    M('Reprise', 'à 5 h 00 min.', 2),
    T({ train: '1', pas: '5.12' }, { train: '2', pas: '5.18' }, 3),
    T({ train: '3', arr: '5.40', dep: '5.43' }, {}, 4),
    T({}, { train: 'V', pas: '6.05', obs: 'N° inconnu, train de voyageurs' }, 5),
    T({ train: '5', pas: '6.31', obs: 'expédié avec formulaire MV n° 12' }, {}, 6),
    T({ obs: 'C.T. substitué au block voie 1 entre Bravo et Charlie à 7 h 00' }, {}, 7),
    T({ train: '7', ae: '7.08', vlx: '7.26', pas: '7.09' }, { train: '4', pas: '7.15' }, 8),
    T({ train: 'HLP', ae: '7.33', vlx: '7.49', pas: '7.34' }, {}),
    T({ obs: 'Service normal du block repris sur voie 1 à 7 h 55' }, {}, 9),
    T({ train: '9', pas: '8.02' }, { train: '6', arr: '8.10', dep: '8.12', obs: 'arrivé avec formulaire C n° 3' }, 10),
    M('Cessation', 'à 22 h 30 min.', 11),
  ];
  const NOTES = [
    'Début de journée : la date s\'écrit à cheval sur les deux pages, par une ligne « Journée du » / date.',
    'La gare reprend le service à l\'heure prévue : mention « Reprise » / « à … h … min. » sur les deux pages.',
    'Block par appareils en service : seules les <b>heures réelles</b> sont notées (ici des trains sans arrêt, colonne Passage). Les colonnes Cantonnement restent vides.',
    'Train qui s\'arrête à Bravo : heures d\'arrivée et de départ au lieu de l\'heure de passage.',
    'Numéro inconnu : on inscrit la nature du train (V voyageurs, M marchandises, A autorail, HLP haut-le-pied).',
    'Train expédié avec une autorisation écrite : le formulaire et son numéro vont dans Observations.',
    'Block en dérangement : la substitution du cantonnement téléphonique (C.T.) est inscrite dans Observations, sur la page de la voie concernée.',
    'Sous C.T., les dépêches ne sont pas recopiées : on note seulement leurs <b>heures</b> dans les colonnes Cantonnement (ici annonce expédiée à Charlie et voie libre reçue de Charlie). La voie 2 reste en block normal.',
    'Le block est rétabli : reprise du service normal inscrite dans Observations. Les colonnes Cantonnement ne sont plus remplies.',
    'Train reçu avec un formulaire (ici un C) : « arrivé avec formulaire … n° … ».',
    'Fin de service de la gare temporaire : mention « Cessation » / « à … h … min. ».',
  ];
  const REGLES = [
    ['Double page', 'Trains impairs (voie 1) sur la page de gauche, trains pairs (voie 2) sur celle de droite. Les deux pages se lisent ensemble ligne à ligne, dans l\'ordre chronologique.'],
    ['Date', 'Au début de chaque journée, ou à la première reprise de la journée, inscrire « Journée du » à gauche et la date à droite, à cheval sur les deux pages.'],
    ['Cessation et reprise', 'Inscrites de la même façon sur les deux pages : « Cessation » / « à … h … min. », « Reprise » / « à … h … min. ». Les postes encadrants notent de leur côté « Cessation de Bravo à … » et « Reprise de Bravo à … ».'],
    ['Numéro du train', 'S\'il n\'est pas connu, inscrire sa nature : V, M, A ou HLP.'],
    ['Heures réelles', 'Passage pour un train sans arrêt ; arrivée et départ pour un train qui s\'arrête. Au format 8.52.'],
    ['Cantonnement', 'Ces colonnes ne servent que lorsque les annonces et les redditions se font par téléphone (C.T.). On n\'y recopie pas le texte des dépêches, seulement leurs heures.'],
    ['Observations', 'Autorisations écrites (« expédié / arrivé avec formulaire MV n° … »), substitution du C.T. et reprise du block, circulation à contre-voie, incidents.'],
    ['Dans le simulateur', 'Double-clic dans une case d\'heure : l\'heure actuelle s\'y inscrit. Les boutons Journée du, Cessation et Reprise écrivent la mention sous la dernière ligne remplie.'],
  ];

  // ---------- Tableaux ----------
  function entete(page) {
    return `
      <caption>${page === 'impair' ? 'TRAINS IMPAIRS <small>(voie 1)</small>' : 'TRAINS PAIRS <small>(voie 2)</small>'}</caption>
      <colgroup><col class="c-train"><col span="4" class="c-heure"><col span="3" class="c-heure"><col class="c-obs"></colgroup>
      <thead>
        <tr><th rowspan="2">Trains</th><th colspan="4">CANTONNEMENT</th><th colspan="3">HEURES RÉELLES</th><th rowspan="2">OBSERVATIONS</th></tr>
        <tr><th>Annonce<br>reçue</th><th>Voie libre<br>rendue</th><th>Annonce<br>expédiée</th><th>Voie libre<br>reçue</th>
          <th>Arrivée</th><th>Passage</th><th>Départ</th></tr>
      </thead>`;
  }
  // mode : 'saisie' (champs), 'lecture' (texte)
  function lignesHtml(lignes, page, mode, decalage = 0) {
    return lignes.map((l, j) => {
      const i = j + decalage;
      const note = l.note ? `<span class="note-num">${l.note}</span>` : '';
      if (l.type === 'mention') {
        const cote = page === 'impair' ? 'gauche' : 'droite';
        const contenu = mode === 'saisie'
          ? `<input data-cote="${cote}" value="${echapper(l[cote])}" aria-label="Mention, page ${page === 'impair' ? 'de gauche' : 'de droite'}">`
          : echapper(l[cote]);
        const suppr = mode === 'saisie' && page === 'pair' ? '<button class="suppr" title="Supprimer la mention">✕</button>' : '';
        return `<tr class="mention" data-i="${i}"><td colspan="9" class="${cote}">${page === 'impair' ? note : ''}${contenu}${suppr}</td></tr>`;
      }
      const cellules = COLONNES.map((c, k) => {
        const val = l[page][c] || '';
        const classe = HEURES.includes(c) ? 'heure' : c;
        const contenu = mode === 'saisie'
          ? `<input data-col="${c}" value="${echapper(val)}" ${HEURES.includes(c) ? 'inputmode="decimal"' : ''}>`
          : echapper(val);
        return `<td class="${classe}">${k === 0 && page === 'impair' ? note : ''}${contenu}</td>`;
      }).join('');
      return `<tr data-i="${i}">${cellules}</tr>`;
    }).join('');
  }
  function doublePage(lignes, mode, decalage) {
    return `<div class="double-page">
      ${['impair', 'pair'].map((page) => `
        <table class="page ${page}">${entete(page)}<tbody>${lignesHtml(lignes, page, mode, decalage)}</tbody></table>`).join('')}
    </div>`;
  }

  // ---------- Fenêtre ----------
  const dialogue = document.createElement('dialog');
  dialogue.id = 'registre';
  dialogue.className = 'fenetre';
  dialogue.innerHTML = `
    <header>
      <h1>REGISTRE DE CANTONNEMENT <small>Ligne à double voie d'Alfa à Charlie · Poste de Bravo</small></h1>
      <nav class="onglets" role="tablist">
        <button data-vue="saisie" class="actif">Registre</button>
        <button data-vue="exemples">Exemples</button>
        <button data-vue="regles">Tenue du registre</button>
      </nav>
      <button class="fermer" aria-label="Fermer le registre">✕</button>
    </header>
    <div class="outils"></div>
    <div class="corps"></div>`;
  document.body.append(dialogue);
  const outils = dialogue.querySelector('.outils');
  const corps = dialogue.querySelector('.corps');
  let vue = 'saisie';

  function bouton(libelle, action, classe = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = libelle;
    if (classe) b.className = classe;
    b.addEventListener('click', action);
    return b;
  }

  function rendreOutils() {
    outils.replaceChildren();
    if (vue === 'saisie') {
      const commence = document.createElement('label');
      commence.innerHTML = `Commencé le <input class="commence" value="${echapper(donnees.commence)}" placeholder="date">`;
      commence.querySelector('input').addEventListener('input', (e) => { donnees.commence = e.target.value; enregistrer(); });
      const vider = bouton('Vider le registre', () => {
        if (vider.dataset.confirmer) {
          donnees = { commence: '', lignes: [] };
          completer(); enregistrer(); rendre();
        } else {
          vider.dataset.confirmer = '1';
          vider.textContent = 'Confirmer : tout effacer ?';
          setTimeout(() => { delete vider.dataset.confirmer; vider.textContent = 'Vider le registre'; }, 4000);
        }
      }, 'danger');
      outils.append(
        commence,
        bouton('Journée du', () => insererMention('Journée du', dateLongue())),
        bouton('Cessation', () => insererMention('Cessation', heureLongue())),
        bouton('Reprise', () => insererMention('Reprise', heureLongue())),
        bouton('Mention libre', () => insererMention('', '')),
        bouton('+10 lignes', () => { for (let k = 0; k < 10; k++) donnees.lignes.push(ligneVide()); enregistrer(); rendreSaisie(); }),
        Object.assign(document.createElement('span'), { className: 'espace' }),
        bouton('Imprimer', () => imprimer(donnees.lignes.filter((l, k, t) => !estVide(l) || t.slice(k).some((x) => !estVide(x))), 'Registre')),
        bouton('Imprimer vierge', () => imprimer([], 'Registre vierge')),
        vider,
      );
      const aide = document.createElement('p');
      aide.className = 'aide';
      aide.textContent = 'Double-clic dans une case d\'heure pour y inscrire l\'heure actuelle.';
      outils.append(aide);
    } else if (vue === 'exemples') {
      outils.append(
        Object.assign(document.createElement('p'), { className: 'aide', textContent: 'Exemples fictifs : les deux pages se lisent côte à côte, ligne à ligne. Les numéros renvoient aux explications sous le registre.' }),
        Object.assign(document.createElement('span'), { className: 'espace' }),
        bouton('Imprimer les exemples', () => imprimer(EXEMPLES, 'Exemples', true)),
      );
    }
  }

  function rendreSaisie() {
    corps.innerHTML = doublePage(donnees.lignes, 'saisie');
  }
  function rendre() {
    dialogue.querySelectorAll('.onglets button').forEach((b) => b.classList.toggle('actif', b.dataset.vue === vue));
    rendreOutils();
    if (vue === 'saisie') rendreSaisie();
    else if (vue === 'exemples') {
      corps.innerHTML = `${doublePage(EXEMPLES, 'lecture')}
        <ol class="notes">${NOTES.map((n) => `<li>${n}</li>`).join('')}</ol>`;
    } else {
      corps.innerHTML = `<dl class="regles">${REGLES.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl>
        <p class="aide">Rappel rédigé pour le simulateur. En cas de doute, la consigne locale et les textes en vigueur font foi.</p>`;
    }
  }

  // Saisie : chaque frappe est enregistrée
  corps.addEventListener('input', (e) => {
    const champ = e.target;
    const tr = champ.closest('tr[data-i]');
    if (!tr || vue !== 'saisie') return;
    const l = donnees.lignes[Number(tr.dataset.i)];
    if (champ.dataset.cote) l[champ.dataset.cote] = champ.value;
    else l[champ.closest('table').classList.contains('impair') ? 'impair' : 'pair'][champ.dataset.col] = champ.value;
    enregistrer();
  });
  // Les lignes vides du bas se complètent quand on quitte une case
  corps.addEventListener('change', () => {
    const avant = donnees.lignes.length;
    completer();
    if (donnees.lignes.length !== avant) { enregistrer(); rendreSaisie(); }
  });
  corps.addEventListener('dblclick', (e) => {
    const champ = e.target;
    if (vue !== 'saisie' || !champ.matches('input[data-col]') || !HEURES.includes(champ.dataset.col)) return;
    champ.value = heureCourte();
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.dispatchEvent(new Event('change', { bubbles: true }));
  });
  corps.addEventListener('click', (e) => {
    if (!e.target.matches('.suppr')) return;
    donnees.lignes.splice(Number(e.target.closest('tr').dataset.i), 1);
    completer(); enregistrer(); rendreSaisie();
  });
  // Entrée : passer à la même case de la ligne suivante
  corps.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    e.preventDefault();
    const tr = e.target.closest('tr');
    const td = e.target.closest('td');
    const suivante = tr.nextElementSibling;
    const champ = suivante && (suivante.cells[td.cellIndex] || suivante.cells[0]).querySelector('input');
    if (champ) champ.focus();
  });

  dialogue.querySelectorAll('.onglets button').forEach((b) => b.addEventListener('click', () => { vue = b.dataset.vue; rendre(); }));
  dialogue.querySelector('.fermer').addEventListener('click', () => dialogue.close());
  dialogue.addEventListener('click', (e) => { if (e.target === dialogue) dialogue.close(); });

  // ---------- Impression ----------
  // Une feuille A4 paysage par page du registre : page impaire puis page paire.
  function imprimer(lignes, titre, avecNotes = false) {
    const liste = lignes.slice();
    const total = Math.max(LIGNES_PAR_PAGE, Math.ceil(liste.length / LIGNES_PAR_PAGE) * LIGNES_PAR_PAGE);
    while (liste.length < total) liste.push(ligneVide());
    let html = '';
    const enTete = (page, n) => `<div class="entete-impr"><b>Registre de cantonnement</b> · Ligne à double voie d'Alfa à Charlie · Poste de Bravo
      <span>${titre === 'Registre' && donnees.commence ? `Commencé le ${echapper(donnees.commence)} · ` : ''}${page === 'impair' ? 'Page de gauche' : 'Page de droite'} ${n}</span></div>`;
    for (let k = 0; k < liste.length; k += LIGNES_PAR_PAGE) {
      const morceau = liste.slice(k, k + LIGNES_PAR_PAGE);
      ['impair', 'pair'].forEach((page) => {
        html += `<section class="feuille">${enTete(page, k / LIGNES_PAR_PAGE + 1)}
          <table class="page ${page}">${entete(page)}<tbody>${lignesHtml(morceau, page, 'lecture')}</tbody></table></section>`;
      });
    }
    if (avecNotes) html += `<section class="feuille notes-impr"><h2>Explications des exemples</h2><ol class="notes">${NOTES.map((n) => `<li>${n}</li>`).join('')}</ol></section>`;
    const zone = document.createElement('div');
    zone.id = 'impression';
    zone.innerHTML = html;
    document.body.append(zone);
    document.body.classList.add('impression');
    const ouvert = dialogue.open;
    if (ouvert) dialogue.close();
    const finir = () => {
      document.body.classList.remove('impression');
      zone.remove();
      if (ouvert) dialogue.showModal();
    };
    window.addEventListener('afterprint', finir, { once: true });
    window.print();
  }

  function ouvrir() {
    charger();
    vue = 'saisie';
    rendre();
    dialogue.showModal();
  }

  charger();
  const declencheur = document.getElementById('BTN_REGISTRE');
  if (declencheur) declencheur.addEventListener('click', ouvrir);

  return { ouvrir, EXEMPLES };
})();
