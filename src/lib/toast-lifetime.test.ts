import { describe, expect, it } from 'vitest';
import {
  TOAST_ACTION_MAX_MS,
  TOAST_ERROR_MAX_MS,
  TOAST_HOVER_GRACE_MS,
  TOAST_LOADING_MAX_MS,
  TOAST_MAX_MS,
  toastLifetimeMs,
  toastStateKey,
} from './toast-lifetime';

describe('toastLifetimeMs', () => {
  it('gives a plain toast the toaster default plus the grace', () => {
    expect(toastLifetimeMs({ type: 'success', title: 'Welcome back!' }, 3000)).toBe(3000 + TOAST_HOVER_GRACE_MS);
  });

  it('never lets a pinned toast stay forever', () => {
    expect(toastLifetimeMs({ type: 'success', title: 'Done', duration: Infinity })).toBe(TOAST_MAX_MS + TOAST_HOVER_GRACE_MS);
    expect(toastLifetimeMs({ type: 'error', title: 'Failed', duration: Infinity })).toBe(TOAST_ERROR_MAX_MS + TOAST_HOVER_GRACE_MS);
  });

  it('gives toasts with buttons the longest finite time', () => {
    expect(toastLifetimeMs({ title: 'New version', description: { type: 'span' }, duration: Infinity }))
      .toBe(TOAST_ACTION_MAX_MS + TOAST_HOVER_GRACE_MS);
    expect(toastLifetimeMs({ type: 'error', title: 'x', action: { label: 'Retry' }, duration: 60_000 }))
      .toBe(TOAST_ACTION_MAX_MS + TOAST_HOVER_GRACE_MS);
  });

  it('keeps short asks short', () => {
    expect(toastLifetimeMs({ type: 'error', title: 'Slow down', duration: 2500 })).toBe(2500 + TOAST_HOVER_GRACE_MS);
  });

  it('caps loading toasts', () => {
    expect(toastLifetimeMs({ type: 'loading', title: 'Uploading', duration: Infinity })).toBe(TOAST_LOADING_MAX_MS);
  });
});

describe('toastStateKey', () => {
  it('changes when a loading toast becomes a success', () => {
    expect(toastStateKey({ type: 'loading', title: 'Signing in' })).not.toBe(toastStateKey({ type: 'success', title: 'Welcome back!' }));
  });

  it('changes when progress moves', () => {
    expect(toastStateKey({ type: 'loading', title: '10%' })).not.toBe(toastStateKey({ type: 'loading', title: '20%' }));
  });

  it('stays put for the same words', () => {
    expect(toastStateKey({ type: 'error', title: 'Slow down' })).toBe(toastStateKey({ type: 'error', title: 'Slow down' }));
  });
});
