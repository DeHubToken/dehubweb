import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  __resetAfterSignInForTests,
  armAfterSignIn,
  isAccountOnlyPath,
  recordTap,
  replayTap,
  takeAfterSignIn,
} from './after-sign-in';

beforeEach(() => {
  __resetAfterSignInForTests();
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

it('knows the account-only pages', () => {
  expect(isAccountOnlyPath('/app/notifications')).toBe(true);
  expect(isAccountOnlyPath('/settings/')).toBe(true);
  expect(isAccountOnlyPath('/app/profile')).toBe(true);
  expect(isAccountOnlyPath('/app')).toBe(false);
  expect(isAccountOnlyPath('/maldoteth')).toBe(false);
});

it('opens the page they asked for after a new account signs in, even across a reload', () => {
  armAfterSignIn({ path: '/app/messages', fromAddress: null });
  expect(JSON.parse(sessionStorage.getItem('riftn.afterSignIn')!).path).toBe('/app/messages');
  expect(takeAfterSignIn('0xabc')?.path).toBe('/app/messages');
  expect(takeAfterSignIn('0xabc')).toBeNull();
});

it('does nothing for the account that was already signed in', () => {
  armAfterSignIn({ path: '/app/messages', fromAddress: '0xABC' });
  expect(takeAfterSignIn('0xabc')).toBeNull();
});

it('presses the tapped button again once signed in', () => {
  const like = document.createElement('button');
  like.textContent = 'Like';
  const onClick = vi.fn();
  like.addEventListener('click', onClick);
  document.body.appendChild(like);
  recordTap(like);
  armAfterSignIn({ fromAddress: null });
  const action = takeAfterSignIn('0x1');
  expect(action?.tap).toBeTruthy();
  expect(replayTap(action!.tap!)).toBe(true);
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('does not press a button that changed while they signed in (already liked, already following)', () => {
  const follow = document.createElement('button');
  follow.textContent = 'Follow';
  document.body.appendChild(follow);
  recordTap(follow);
  armAfterSignIn({ fromAddress: null });
  follow.textContent = 'Following';
  const action = takeAfterSignIn('0x1');
  expect(replayTap(action!.tap!)).toBe(false);
});

it('never replays a Log in button', () => {
  const login = document.createElement('button');
  login.textContent = 'Log in';
  document.body.appendChild(login);
  recordTap(login);
  armAfterSignIn({ fromAddress: null });
  expect(takeAfterSignIn('0x1')).toBeNull();
});

it('ignores a tap from long before the sheet opened', () => {
  vi.useFakeTimers();
  const btn = document.createElement('button');
  btn.textContent = 'Bookmark';
  document.body.appendChild(btn);
  recordTap(btn);
  vi.advanceTimersByTime(5000);
  armAfterSignIn({ fromAddress: null });
  expect(takeAfterSignIn('0x1')).toBeNull();
});
