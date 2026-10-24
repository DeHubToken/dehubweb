import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { RoomChatText } from './RoomChatText';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../TranslatableText', () => ({
  renderTextWithLinks: (text: string) => text,
  useTranslation: (text: string) => {
    const [isTranslated, setTranslated] = useState(false);
    return {
      isTranslated, translatedText: `Translated: ${text}`, isTooShort: !/\p{L}/u.test(text), isLoading: false, error: null,
      handleTranslate: () => setTranslated(true), handleShowOriginal: () => setTranslated(false),
    };
  },
}));
afterEach(cleanup);

it('offers translation for Latin chat and only changes the selected message', () => {
  render(<><RoomChatText text="Bonjour tout le monde" /><RoomChatText text="Hola a todos" /></>);
  fireEvent.click(screen.getAllByRole('button', { name: 'common.translate' })[0]);
  expect(screen.getByText('Translated: Bonjour tout le monde')).toBeTruthy();
  expect(screen.getByText('Hola a todos')).toBeTruthy();
  expect(screen.queryByText('Translated: Hola a todos')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'common.showOriginal' }));
  expect(screen.getByText('Bonjour tout le monde')).toBeTruthy();
});

it('does not offer translation for emoji-only messages', () => {
  render(<RoomChatText text="🔥🔥" />);
  expect(screen.queryByRole('button')).toBeNull();
});
