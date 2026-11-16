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
| `js/moteur.js` | Moteur : block, trains (position en mètres, longueur, vitesse, freinage), enclenchements. Sans dépendance au navigateur. |
| `js/tco.js` | Liaison moteur ↔ TCO (affichage de l'état, clics de l'élève) |
| `js/poste.js` | Démarrage de la page du TCO : moteur, horloge, liaison |
| `js/liaison.js` | Échange d'état et d'actions entre le TCO et l'écran formateur (même navigateur ou à distance, code de séance) |
| `js/config.js` | Adresse et clé publique Supabase pour la liaison distante |
| `js/formateur.js` | Écran formateur |
| `js/schema.js` | Schéma simplifié de la ligne avec les PK (fenêtre LIGNE du TCO, onglet Trains du formateur) |
| `js/sonnerie.js` | Sons synthétisés : sonneries, gong d'annonce, clic des voyants |
| `js/guide.js` | Guides ouverts par le bouton GUIDE : « Faire circuler un train » et « Gare temporaire (ES / HS) » |
| `js/tableau.js` | Tableau d'enclenchement du point E (bouton TABLEAU D'ENCLENCH.) : consultation, modification, export |
| `js/ordres.js` | Ordres de franchissement (bulletins C, S, MV) remplis depuis la console |
| `js/registre.js` | Registre de cantonnement de Bravo (bouton REGISTRE) : saisie, exemples, tenue du registre, impression |
| `tests/moteur.test.js` | Tests du moteur : `node tests/moteur.test.js` |

## Utilisation

1. Ouvrir `formateur.html` sur le téléphone : il crée la séance et affiche un code (par exemple `K7Q2-M9XD-3FPA`).
2. Ouvrir `tco.html` sur le PC de l'élève : un écran d'accueil masque le TCO. Y saisir ce code ; le TCO s'affiche dès
   que le téléphone répond. Pour changer de séance, cliquer sur la pastille en bas à droite.

À l'ouverture d'une séance, Alfa et Charlie sont automatiques (réglable dans l'onglet Postes de l'écran formateur).

Le moteur tourne sur le PC du TCO, pour que les trains continuent si le téléphone se met en veille. Le code reste
mémorisé des deux côtés jusqu'à « Nouvelle séance » sur le téléphone.

La liaison passe par la messagerie temps réel de Supabase (diffusion sur un canal propre à la séance, sans table ni
compte ; configuration dans `js/config.js`, bibliothèque chargée depuis jsDelivr). Sans réseau, le TCO et l'écran
formateur se relient encore s'ils sont ouverts dans deux onglets du même navigateur.

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
- [x] Étape 5 — Liaison temps réel entre appareils (code de séance)
- [ ] Étape 6 — Scénarios et dérangements

## Ligne

PK croissants dans le sens impair (voie 1, Alfa → Charlie). Valeurs par défaut, réglables depuis l'écran formateur :

| Repère | Voie 1 (Alfa → Charlie) | Voie 2 (Charlie → Alfa) |
|---|---|---|
| Gare d'origine | Alfa PK 100,000 | Charlie PK 121,000 |
| Début de la zone d'annonce | PK 103,000 | PK 118,350 |
| Début de la ZAP | PK 108,500 | PK 112,850 |
| Signal | C1/S1 PK 110,000 | C2/S2 PK 111,350 |
| Zone après le signal | z1 de 110,100 à 110,900 | z2 de 111,250 à 110,500 |
| Aiguille | E PK 110,900 | F PK 110,500 |
| Zone suivante | z3 jusqu'à 111,350 | z4 jusqu'à 110,000 |
| Quai (400 m) | PK 110,050 à 110,450, le long de z1 | PK 110,050 à 110,450, le long de z4 |

Trains : 50 m (engin seul, 120 km/h), 300 m (voyageurs, 160 km/h), 750 m (fret, 100 km/h).
Le simulateur tourne en temps réel ou accéléré (×2, ×5, ×10, ×20).
