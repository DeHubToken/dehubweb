// @vitest-environment node
import { expect, it } from 'vitest';
import { Wallet } from 'ethers';
import { deriveFromSecret, ETH_PATH, isValidMnemonic } from '../derive';

const words12 = `${'abandon '.repeat(11)}about`;
const words24 = `${'abandon '.repeat(23)}art`;

it.each([words12, words24])('imports BIP-39 phrases with the same owner key as mobile', phrase => {
  expect(isValidMnemonic(phrase)).toBe(true);
  const expected = Wallet.fromPhrase(phrase).privateKey;
  expect(ETH_PATH).toBe("m/44'/60'/0'/0/0");
  expect(deriveFromSecret(phrase).ethPrivateKey).toBe(expected);
  expect(deriveFromSecret(phrase.toUpperCase().replace(/ /g, '\n')).ethPrivateKey).toBe(expected);
});

it('accepts private keys with or without a hex prefix', () => {
  const key = `0x${'11'.repeat(32)}`;
  expect(deriveFromSecret(key).ethPrivateKey).toBe(key);
  expect(deriveFromSecret(key.slice(2)).ethPrivateKey).toBe(key);
});

it('rejects invalid seed phrases and private keys', () => {
  expect(() => deriveFromSecret('not a seed phrase')).toThrow();
  expect(() => deriveFromSecret('0x1234')).toThrow();
  expect(() => deriveFromSecret('0'.repeat(64))).toThrow();
});
