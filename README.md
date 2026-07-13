# puzzle-lookup

Service HTTP indépendant : à partir d'un code-barre EAN, retourne les infos
d'un puzzle (marque, nom, nombre de pièces, image) en scrapant deux sources
publiques. Utilisé par l'app [puzzle-tracker](https://github.com/Graiiig/puzzle-tracker)
(web + Android) pour pré-remplir le formulaire d'ajout après un scan caméra.

## API

```
GET /lookup?ean=<code-barre>
Header: x-api-key: <clé partagée>
```

Réponse 200 dans tous les cas :

```json
{ "found": true, "source": "puzzle.fr", "brand": "Ravensburger", "name": "Tour Eiffel de nuit", "pieces": 1000, "imageUrl": "https://..." }
```
```json
{ "found": false }
```

`GET /health` renvoie `{ "ok": true }` sans authentification (healthcheck Coolify).

## Logique de résolution

1. **puzzle.fr** : recherche l'EAN, prend le premier lien produit trouvé sur la
   page de résultats (repéré via la convention d'URL `...p<id>.html`, pas via
   des classes CSS), puis extrait marque/nom/image via les données structurées
   `schema.org/Product` (JSON-LD) de la page produit, avec repli sur les
   meta `og:title` / `og:image` si absentes. Le nombre de pièces est
   recherché par regex dans le nom et dans le slug d'URL.
2. **ean-search.org** (si 1. ne trouve rien) : recherche l'EAN, extrait le nom
   du premier résultat et, si présent, un lien externe vers un revendeur.
   Nombre de pièces extrait par regex sur le nom (pas garanti).
3. Sinon → `{ "found": false }`.

Le scraping passe par Playwright (Chromium headless) car les deux sites
bloquent les requêtes HTTP simples (403).

Chaque source a un timeout (`SOURCE_TIMEOUT_MS`, 9s par défaut) : en cas de
dépassement, d'erreur, ou de structure de page imprévue, on passe à la source
suivante sans planter.

Un cache par EAN (fichier JSON, voir `CACHE_FILE_PATH`) évite de re-scraper à
chaque scan du même puzzle. TTL séparés pour les résultats trouvés
(`POSITIVE_CACHE_TTL_DAYS`, 30 jours par défaut) et non trouvés
(`NEGATIVE_CACHE_TTL_HOURS`, 24h par défaut, au cas où c'était un échec
transitoire du scraping plutôt qu'une vraie absence de résultat).

## ⚠️ Sélecteurs à vérifier avant mise en prod

Ce service a été développé dans un environnement sandbox dont la politique
réseau **bloque les accès sortants vers puzzle.fr et ean-search.org**
(confirmé : 403 sur la connexion HTTPS). Il n'a donc pas été possible
d'explorer les pages réelles pendant le dev.

Ce qui a été fait pour limiter le risque :
- Pour puzzle.fr, l'étape la plus fragile (repérer un résultat de recherche)
  ne dépend d'aucune classe CSS : elle repose uniquement sur la convention
  d'URL produit documentée dans le brief (`...p<id>.html`). L'extraction des
  détails s'appuie sur les données structurées JSON-LD `Product`, un standard
  SEO stable et largement utilisé par les boutiques PrestaShop (bien plus
  fiable que des sélecteurs de thème).
- Pour ean-search.org, faute de mieux, l'extraction utilise une liste de
  sélecteurs candidats (`src/sources/eanSearch.ts`, `RESULT_NAME_SELECTORS`)
  essayés dans l'ordre, avec repli sur le `<title>` de la page.
- Dans tous les cas, toute erreur ou structure inattendue fait échouer la
  source silencieusement (retour `null`) plutôt que de planter — cohérent
  avec le comportement demandé.

**Avant de compter dessus en prod**, vérifie/ajuste ces sélecteurs depuis un
environnement qui a accès à internet (ta machine, ou directement sur le VPS) :

```bash
npm run inspect -- "https://www.puzzle.fr/recherche?controller=search&s=<un_ean_connu>"
npm run inspect -- "https://www.ean-search.org/?q=<un_ean_connu>"
```

Ça ouvre un vrai Chromium (non-headless) sur l'URL donnée et sauvegarde
`debug/page.html` + `debug/page.png`. Compare avec ce que `src/sources/puzzleFr.ts`
et `src/sources/eanSearch.ts` attendent, et ajuste si besoin (URL de recherche
exacte, sélecteurs candidats). Les tests dans `test/sources.test.ts` tournent
contre des fixtures HTML locales (`test/fixtures/`) qui simulent la structure
attendue — à mettre à jour avec du vrai HTML si la structure réelle diffère.

## Développement local

```bash
npm install
cp .env.example .env   # renseigner API_KEY
npm run dev
```

```bash
curl -H "x-api-key: <API_KEY>" "http://localhost:3000/lookup?ean=4005556197766"
```

## Tests / typecheck

```bash
npm run build   # typecheck + compilation
npm test        # tests unitaires (regex pièces) + tests d'extraction sur fixtures HTML
```

## Déploiement (Coolify)

1. Connecter ce repo Git dans Coolify. Le `Dockerfile` est détecté
   automatiquement (build/déploiement à chaque push, webhook standard).
2. Variables d'environnement à définir dans Coolify (voir `.env.example`) :
   au minimum `API_KEY`. `PORT`/`HOST` peuvent rester par défaut.
3. Démarrer en exposant IP:port pour tester, puis brancher un (sous-)domaine
   + HTTPS (géré automatiquement par Coolify) une fois validé.
4. `GET /health` peut servir de healthcheck Coolify.

L'image Docker part de `mcr.microsoft.com/playwright:v1.56.0-jammy`, qui
inclut déjà Chromium — pas de téléchargement de navigateur au build. La
version de l'image doit rester alignée avec la version du package
`playwright` dans `package.json` (actuellement `1.56.0`, choisie car c'est
la version dont la révision Chromium correspond à celle pré-installée dans
l'environnement de dev utilisé — libre à toi de la faire évoluer, en gardant
`Dockerfile` et `package.json` synchronisés).

## Hors scope (voir le repo puzzle-tracker)

- Scan caméra → EAN côté app.
- Appel à cette API depuis le formulaire d'ajout de puzzle-tracker.
