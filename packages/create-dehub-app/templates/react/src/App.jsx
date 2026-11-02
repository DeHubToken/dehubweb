import { useEffect, useState } from 'react';
import { dehub } from 'dehub-sdk';

const button = { width: '100%', marginTop: 12, padding: 14, border: 0, borderRadius: 14, fontSize: 16, fontWeight: 600 };

export default function App() {
  const [user, setUser] = useState(null);
  const [added, setAdded] = useState(true);
  const [status, setStatus] = useState('');
  const inDehub = dehub.isInDehub();

  useEffect(() => {
    if (!inDehub) return;
    dehub.context.then(({ user, client }) => {
      setUser(user);
      setAdded(client.added);
      dehub.ready();
    });
  }, [inDehub]);

  const run = (fn) => async () => {
    try { await fn(); } catch (e) { setStatus(e.message); }
  };

  // Your server checks this token with verifyDehubToken from 'dehub-sdk/server'.
  const signIn = run(async () => {
    const { token } = await dehub.auth.getToken();
    const res = await fetch('/api/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    setStatus(res.ok ? 'Signed in on your server.' : 'Your server said no. See the server template.');
  });
  const share = run(() => dehub.actions.composePost({ text: 'Trying {{APP_NAME}} on DeHub', embedUrl: location.href }));
  const pay = run(async () => {
    const { amount } = await dehub.actions.pay({ amount: 10, memo: 'Support {{APP_NAME}}' });
    setStatus(`Thanks for the ${amount} DHB!`);
  });
  const add = run(async () => {
    await dehub.actions.addApp();
    setAdded(true);
  });

  return (
    <main style={{ width: 'min(360px, 90vw)', margin: '15vh auto', textAlign: 'center' }}>
      <h1>{user ? `Hi ${user.displayName || user.handle}` : '{{APP_NAME}}'}</h1>
      <p style={{ color: '#aaa' }}>{inDehub ? status || 'Running inside DeHub.' : 'Open this page inside DeHub to try it.'}</p>
      <button style={{ ...button, background: '#fff', color: '#000' }} onClick={share}>Share to DeHub</button>
      <button style={{ ...button, background: '#222', color: '#fff' }} onClick={pay}>Pay 10 DHB</button>
      <button style={{ ...button, background: '#222', color: '#fff' }} onClick={signIn}>Sign in to my server</button>
      {!added ? <button style={{ ...button, background: '#222', color: '#fff' }} onClick={add}>Add app for updates</button> : null}
    </main>
  );
}
