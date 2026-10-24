# VoteSColaire

Application de vote en ligne pour les élèves, avec persistance des votes, des candidats et des photos dans MongoDB.

## MongoDB en local

Installez et démarrez le serveur MongoDB sur votre ordinateur. L’adresse locale par défaut est `mongodb://127.0.0.1:27017`.

1. Copiez `.env.example` en `.env`.
2. Gardez ou ajustez `MONGODB_URI=mongodb://127.0.0.1:27017/nodifs_vote`.
3. Démarrez l’application :

```bash
npm install
npm run dev
```

L’application est disponible à `http://localhost:3000`. Le fichier `.env` est ignoré par Git et ne doit pas être publié.

Si MongoDB n’est pas installé ou si `MONGODB_URI` est absent hors production, l’application démarre en mode mémoire pour le développement. Les données de ce mode temporaire sont perdues à l’arrêt.

## Déploiement sur Render

Render exécute `npm ci` puis `npm start`, et fournit automatiquement le port du service. Le fichier `render.yaml` configure le service web et son health check sur `/api/health`.

Render ne démarre pas automatiquement un serveur MongoDB pour l’application. Il faut donc disposer d’un serveur MongoDB accessible depuis Render, puis configurer ses paramètres :

- `MONGODB_URI`: URI réseau du serveur MongoDB, par exemple `mongodb://utilisateur:mot-de-passe@hote:27017/nodifs_vote?authSource=admin`.
- `MONGODB_DB`: nom de la base, `nodifs_vote` par défaut.
- `ADMIN_PASSWORD`: mot de passe administrateur fort et unique.

Ajoutez ces variables dans **Render → votre service → Environment**, puis redéployez. N’utilisez pas `127.0.0.1` comme hôte dans Render : cela désignerait le conteneur Render lui-même, et non votre ordinateur ou le serveur de base de données. En production, le serveur refuse de démarrer si `MONGODB_URI` ou `ADMIN_PASSWORD` manque.

Si le mot de passe MongoDB contient des caractères spéciaux, encodez-les pour les inclure dans l’URI. Gardez l’URI et le mot de passe hors du dépôt et ne les partagez pas publiquement.

## Tests

```bash
npm test
```

Les tests utilisent un stockage en mémoire isolé et ne nécessitent pas de serveur MongoDB.

## Données persistées

Les votes, candidats et images téléversées sont conservés dans MongoDB. Le bouton de réinitialisation efface les votes et restaure les candidats initiaux.
