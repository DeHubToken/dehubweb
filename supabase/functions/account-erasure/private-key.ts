export function normalizeApplePrivateKey(value: string): string {
  const text = value.replace(/\\r\\n|\\n/g, '\n').trim();
  const envelope = /^-----BEGIN PRIVATE KEY-----\s*([\s\S]*?)\s*-----END PRIVATE KEY-----$/;
  const match = text.match(envelope);
  const body = (match ? match[1] : text).replace(/\s/g, '');
  // A PKCS#8 key is a DER SEQUENCE, so its first byte is 0x30. Checking that
  // (rather than rejecting lines that open with `//`) keeps comment-wrapped
  // junk out without refusing a real key whose base64 happens to put `//` at
  // the start of a line.
  if (!body || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body) || atob(body.slice(0, 4)).charCodeAt(0) !== 0x30) {
    throw new Error('Apple private key format is invalid');
  }
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
}
