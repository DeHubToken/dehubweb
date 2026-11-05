# {{APP_NAME}}

A DeHub mini app with React + Vite and [dehub-sdk](https://github.com/DeHubToken/dehubweb/tree/main/packages/dehub-sdk).

```bash
npm install
npm run dev
```

1. Replace `YOUR-DOMAIN` in `index.html` and `public/.well-known/dehub.json`.
2. `npm run build` and host `dist/` on https.
3. Sign ownership and submit at https://dehub.io/apps/dev.
4. For sign-in, payments and webhooks on your own server, start from the `server` template (`npx https://github.com/DeHubToken/dehubweb/releases/download/packages/create-dehub-app.tgz my-server --template server`).

Docs: https://dehub.io/docs/developers
