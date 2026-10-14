import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LoginImportWalletStep } from './LoginImportWalletStep';
import { deriveFromSecret } from '@/lib/wallet-core/derive';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const key = deriveFromSecret(phrase).ethPrivateKey;

it.each([key, key.slice(2), phrase, phrase.toUpperCase().replace(/ /g, '\n')])('imports a valid key or phrase without an identity login', async secret => {
  const onImport = vi.fn().mockResolvedValue(undefined);
  render(<LoginImportWalletStep busy={false} onImport={onImport} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: secret } });
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(onImport).toHaveBeenCalledWith(key));
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
});

it('rejects invalid secrets before connecting or making a request', async () => {
  const onImport = vi.fn();
  render(<LoginImportWalletStep busy={false} onImport={onImport} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not a valid phrase' } });
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent('loginModal.invalidImportSecret');
  expect(onImport).not.toHaveBeenCalled();
});

it('keeps the form usable after a connection fails', async () => {
  const onImport = vi.fn().mockRejectedValue(new Error('connection failed'));
  render(<LoginImportWalletStep busy={false} onImport={onImport} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: key } });
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent('common.somethingWentWrong');
  expect(screen.getByRole('textbox')).toHaveValue(key);
  expect(screen.getByRole('button')).toBeEnabled();
});
