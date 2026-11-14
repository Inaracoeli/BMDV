# BMDV — Simulateur de block manuel de double voie

Simulateur web destiné à la formation des aiguilleurs : un TCO du poste B pour l'élève,
un écran formateur (pupitres Alfa / Charlie, scénarios, dérangements), synchronisés en temps réel.

Ce dépôt ne contient que le fonctionnement du simulateur. Aucun document réglementaire,
texte de procédure ou donnée d'exploitation n'y est stocké : ces éléments résident dans
la base de données, accessible uniquement après authentification.

## Structure

| Fichier | Rôle |
|---|---|
| `tco.html` | TCO du poste B (écran élève). Héberge le moteur. |
| `formateur.html` | Écran formateur, pour téléphone : pupitres d'Alfa et de Charlie, trains, dérangements |
| `css/tco.css`, `css/formateur.css` | Styles des deux écrans |
| `js/moteur.js` | Moteur : block, trains, enclenchements. Sans dépendance au navigateur. |
| `js/tco.js` | Liaison moteur ↔ TCO (affichage de l'état, clics de l'élève) |
| `js/poste.js` | Démarrage de la page du TCO : moteur, horloge, liaison |
| `js/liaison.js` | Échange d'état et d'actions entre le TCO et l'écran formateur |
| `js/formateur.js` | Écran formateur |
| `js/sonnerie.js` | Sons synthétisés : sonneries, gong d'annonce, clic des voyants |
| `js/guide.js` | Mini guide « Faire circuler un train », ouvert par le bouton GUIDE |
| `tests/moteur.test.js` | Tests du moteur : `node tests/moteur.test.js` |

## Utilisation

Ouvrir `tco.html` et `formateur.html` dans deux onglets du même navigateur, servis par un serveur web
(par exemple `python3 -m http.server`, puis `http://localhost:8000/tco.html`). La liaison entre appareils
différents viendra à l'étape 5.

## Nomenclature des éléments

Chaque élément du TCO porte un identifiant `PREFIXE_TYPE_NOM` :

- Préfixes : `A_` block côté Alfa, `C_` block côté Charlie, `T_` TCC, `E_` point E,
  `SAAT_` afficheurs, `BUL_` bulletins
- Types : `B_` bouton, `V_` voyant, `C_` commutateur

Les pupitres « Circulation côté Alfa / Charlie » (`AA_`, `CC_`) sont réservés à l'écran formateur.

L'état visuel se pilote par l'attribut `data-etat` (`blanc`, `jaune`, `rouge`, `bleu`, `vert`).
Les commutateurs sont des TPL lumineux : `data-pos` (`ferme`/`ouvert`, `I`/`A`) oriente la manette,
`data-etat="rouge"` allume le commutateur. Manette en bas = actif, allumé rouge (sémaphore fermé, Au E sur I) ;
manette en haut = inactif, éteint (sémaphore ouvert, Au E sur A). Les Vcm sont des leviers articulés en haut,
pointant en bas vers `F` ou `O` (`data-pos`). Le SAAT (suivi des trains) est un écran à part : `SAAT_*`.

Les composants répétés (bouton, voyant, zone, case, TPL) sont dessinés une seule fois dans le
`<defs>` de `tco.html` et colorés par les variables CSS `--face`, `--glow` et `--lit`.

## Avancement

- [x] Étape 1 — TCO statique
- [x] Étape 2 — Moteur de block (sans réseau)
- [x] Étape 3 — Circulation des trains
- [x] Étape 4 — Écran formateur (même navigateur)
- [ ] Étape 5 — Synchronisation temps réel et authentification
- [ ] Étape 6 — Scénarios et dérangements
