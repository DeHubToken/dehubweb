import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle, isUntitled, requestText } from './title.ts';

test('a title that is just the start of the description counts as untitled', () => {
  assert.equal(isUntitled('Should be edited as Riftn.com', 'Should be edited as Riftn.com'), true);
  assert.equal(isUntitled('Every time I close the app', 'Every time  I close the app, the badge resets'), true);
  assert.equal(isUntitled('Notification badge resets', 'Every time I close the app, the badge resets'), false);
});

test('bug report details are left out of what gets named', () => {
  assert.equal(requestText('Upload freezes\n\nPage: /app\nReported: now'), 'Upload freezes');
  assert.equal(requestText('Upload freezes\nat 99%\n\nDevice & OS: Android 15'), 'Upload freezes\nat 99%');
});

test('model answers are tidied into a heading', () => {
  const d = 'When I try to open someone\'s profile from the comments it does not open';
  assert.equal(cleanTitle('"profile won\'t open from comments."', d), 'Profile won\'t open from comments');
  assert.equal(cleanTitle('Title: Shortcut to global chat', d), 'Shortcut to global chat');
  assert.equal(cleanTitle('<think>x</think>\nBadge resets on restart', d), 'Badge resets on restart');
  assert.equal(cleanTitle('I\'m sorry, I can\'t help with that', d), null);
  assert.equal(cleanTitle('', d), null);
  assert.equal(cleanTitle(d, d), null);
});
