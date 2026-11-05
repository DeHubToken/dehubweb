# dehub-sdk

Build mini apps for [DeHub](https://riftn.com): sign people in, take DHB payments, post to the feed and send notifications. Your app runs inside DeHub on the web and in the DeHub app.

```bash
npm i https://riftn.com/sdk/dehub-sdk.tgz
```

In the browser with no build step:

```js
import { dehub } from 'https://riftn.com/sdk/dehub-sdk.mjs';
```

Or start from a template:

```bash
npx https://riftn.com/sdk/create-dehub-app.tgz my-app
```

## In your app

```ts
import { dehub } from 'dehub-sdk';

dehub.ready(); // hide the splash screen

const { user, client } = await dehub.context; // user is null when signed out
const { token } = await dehub.auth.getToken(); // send to your server

await dehub.actions.composePost({ text: 'I just played this', embedUrl: location.href });
const { receipt } = await dehub.actions.pay({ amount: 10, memo: 'Thanks!' });
```

| Method | What it does |
| --- | --- |
| `dehub.ready()` | Hide the splash screen once your first screen is on. |
| `dehub.context` | `{ user, location, client }`. |
| `dehub.auth.getToken()` | Signed JWT with the person's wallet, for your server. |
| `dehub.actions.composePost({ text, embedUrl })` | Open the DeHub composer. |
| `dehub.actions.viewProfile({ handle })` | Open a profile. |
| `dehub.actions.viewPost({ postId })` | Open a post. |
| `dehub.actions.openUrl(url)` | Open a link outside the app. |
| `dehub.actions.addApp()` | Ask to add your app (needed for notifications). |
| `dehub.actions.pay({ amount, memo })` | Take a DHB payment, paid straight to your wallet. |
| `dehub.haptics.impact(style)` | A tap on phones. |
| `dehub.isInDehub()` | False when opened outside DeHub. |

## On your server

```ts
import { verifyDehubToken, verifyDehubPayment, verifyDehubWebhook, sendDehubNotification } from 'dehub-sdk/server';

const { wallet } = await verifyDehubToken(token, { domain: 'myapp.com' });
const payment = await verifyDehubPayment(receipt, { domain: 'myapp.com' });
const event = await verifyDehubWebhook(req.body, { domain: 'myapp.com' }); // app_added, payment, tip, follow, mention...
await sendDehubNotification({ key: process.env.DEHUB_NOTIFY_KEY!, notificationId: 'turn-42', title: 'Your turn' });
```

Server helpers need `jose` (`npm i jose`).

## Ship it

1. Put a `dehub.json` at `https://yourdomain/.well-known/dehub.json`.
2. Check and submit it on [riftn.com/apps/dev](https://riftn.com/apps/dev). It works by link straight away and joins the store after review.

Docs: [riftn.com/docs/developers](https://riftn.com/docs/developers)
