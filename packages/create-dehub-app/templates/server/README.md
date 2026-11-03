# {{APP_NAME}} server

Checks what DeHub sends your app: sign-in tokens, payment receipts and webhooks, and sends notifications.

```bash
npm install
DEHUB_APP_DOMAIN=yourdomain.com DEHUB_NOTIFY_KEY=dhmk_... npm run dev
```

| Route | For |
| --- | --- |
| `POST /api/session` | `Authorization: Bearer <dehub.auth.getToken() token>` → `{ wallet }` |
| `POST /api/payments` | `{ receipt }` from `dehub.actions.pay()` |
| `POST /api/dehub-webhook` | set as `webhookUrl` in your dehub.json |

Docs: https://dehub.io/docs/webhooks
