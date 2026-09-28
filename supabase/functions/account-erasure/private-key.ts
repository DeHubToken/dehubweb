export function normalizeApplePrivateKey(value: string): string {
  const text = value.replace(/\\r\\n|\\n/g, '\n').trim();
  const envelope = /^-----BEGIN PRIVATE KEY-----\s*([\s\S]*?)\s*-----END PRIVATE KEY-----$/;
  const match = text.match(envelope);
  const body = (match ? match[1] : text).replace(/\s/g, '');
  if (!body || /^\s*\/\//m.test(text) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body)) {
    throw new Error('Apple private key format is invalid');
  }
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
}
