# VoteSColaire

Application de vote en ligne pour les élèves.

## Déploiement sur Render

1. Poussez le projet sur un dépôt GitHub.
2. Sur Render, cliquez sur New + puis Blueprint, puis connectez ce dépôt.
3. Render détectera le fichier `render.yaml`.
4. Dans les variables d’environnement du service, définissez `ADMIN_PASSWORD` à une valeur forte et unique. Ne pas utiliser `admin123` en production.
5. Une fois déployé, ouvrez l’URL fournie par Render.

Le service utilisera automatiquement `npm ci` pour installer les dépendances et `npm start` pour démarrer.

## Variables d’environnement

- `PORT`: fournie automatiquement par Render.
- `NODE_ENV`: définie à `production` par la configuration Render.
- `ADMIN_PASSWORD`: mot de passe administrateur requis en production.

Une version d’exemple est disponible dans `.env.example`.

## Limite importante

Les votes, les candidats ajoutés et les sessions administrateur sont actuellement stockés en mémoire. Ils sont perdus au redémarrage ou au redéploiement. Cela convient à une démo mais pas à un vote réel avec persistance.

## Développement local

```bash
npm install
npm run dev
```

L’application démarre sur `http://localhost:3000`.

En local, le mot de passe par défaut est `admin123` si `ADMIN_PASSWORD` n’est pas défini.

```bash
npm test
```
