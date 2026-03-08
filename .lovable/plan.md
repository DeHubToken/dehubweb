

## Plan: Insert 5 Missing Feature Requests

Insert the following professionally worded entries into `feature_requests` using the data insert tool, all attributed to `maldoteth`.

### Entries to Insert

| # | Title | Description | Category |
|---|-------|-------------|----------|
| 1 | **Web: Live chat messages, DMs, and Tip DMs not persisting or syncing** | Live chat messages sent from the web client are not being saved or displayed on mobile. Direct messages and tip-related DMs also fail to send/receive. Parity with the mobile app's messaging stack is required. | `bug_fix` |
| 2 | **Web: Tips not triggering notifications or registering on-chain** | When a tip is sent from the web app, the recipient receives no notification and the transaction does not appear in their tip history. Mobile tipping works correctly — this is a web-only regression. | `bug_fix` |
| 3 | **Optimise transaction confirmation UX for near-instant feedback** | Tipping, PPV unlocks, and other on-chain actions should provide immediate optimistic UI feedback so the experience feels instant, rather than blocking on full confirmation. | `performance` |
| 4 | **Mobile: Make cashtags ($DHB, $ETH, etc.) tappable with search and chart view** | Any token symbol prefixed with `$` should be interactive on mobile — tapping it should open a search/chart view for that token, matching the existing web app behaviour. | `new_feature` |
| 5 | **Add view counter for comments and replies** | Track and display view counts on individual comments and replies, giving creators visibility into engagement beyond likes. | `new_feature` |

### Technical Details

- Table: `feature_requests`
- Author fields: `author_wallet_address = 'maldoteth'`, `author_username = 'maldoteth'`, `author_avatar = 'avatars/0x9324840523a5d17dd12a2f11a9472e5a199c1937.jpg'`
- All entries: `status = 'open'`, default `vote_count`, `like_count`, `dislike_count`, `comment_count` = 0
- 5 individual INSERT statements via the data insert tool

