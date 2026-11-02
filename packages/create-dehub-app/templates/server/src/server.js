import express from 'express';
import { verifyDehubToken, verifyDehubPayment, verifyDehubWebhook, sendDehubNotification } from 'dehub-sdk/server';

// Your app's domain exactly as registered on dehub.io/apps/dev.
const DOMAIN = process.env.DEHUB_APP_DOMAIN || 'YOUR-DOMAIN';
// Created on dehub.io/apps/dev. Keep it secret.
const NOTIFY_KEY = process.env.DEHUB_NOTIFY_KEY;

const app = express();
app.use(express.json());

// Sign-in: the mini app sends dehub.auth.getToken() as a Bearer token.
app.post('/api/session', async (req, res) => {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const { wallet } = await verifyDehubToken(token, { domain: DOMAIN });
    res.json({ wallet });
  } catch {
    res.status(401).json({ error: 'Not signed in' });
  }
});

// Payments: the mini app sends the receipt from dehub.actions.pay().
const seen = new Set(); // use your database in production
app.post('/api/payments', async (req, res) => {
  try {
    const payment = await verifyDehubPayment(String(req.body.receipt || ''), { domain: DOMAIN });
    if (seen.has(payment.txHash)) return res.status(409).json({ error: 'Already recorded' });
    seen.add(payment.txHash);
    res.json({ ok: true, payment });
  } catch {
    res.status(400).json({ error: 'Receipt did not verify' });
  }
});

// Webhooks: set webhookUrl (and webhookEvents for tip/follow/mention) in dehub.json.
app.post('/api/dehub-webhook', async (req, res) => {
  try {
    const { event, wallet, data } = await verifyDehubWebhook(req.body, { domain: DOMAIN });
    console.log('DeHub event', event, wallet, data);
    if (event === 'app_added' && NOTIFY_KEY) {
      await sendDehubNotification({
        key: NOTIFY_KEY,
        notificationId: `welcome-${wallet}`,
        title: 'Thanks for adding {{APP_NAME}}',
        wallets: [wallet],
      }).catch((e) => console.error(e.message));
    }
    res.sendStatus(200);
  } catch {
    res.sendStatus(400);
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`{{APP_NAME}} server on http://localhost:${port}`));
