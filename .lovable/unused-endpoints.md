# Unused DeHub API Endpoints
> Tracked list of endpoints defined in `src/lib/api/dehub.ts` and `src/lib/api/dpay.ts` but not yet consumed in any UI component or hook.

## Status Legend
- ⬜ Not started
- 🔨 In progress
- ✅ Wired up

---

## 1. Livestream Management (11 endpoints)
- ✅ `POST /api/live` → `createLiveStream` — Create/schedule a live stream
- ✅ `GET /api/live/user/{addr}` → `getUserLiveStreams` — Get user's live streams
- ✅ `GET /api/live/user/{addr}/scheduled` → `getUserScheduledStreams` — Get scheduled streams
- ✅ `GET /api/live/{id}` → `getLiveStream` — Get single stream details
- ✅ `GET /api/live/{id}/key` → `getStreamKey` — Get stream key for broadcast
- ✅ `GET /api/live/{id}/activities` → `getStreamActivities` — Stream activity log
- ✅ `GET /api/live/{id}/ingesturl` → `getStreamIngestUrl` — Get ingest URL
- ✅ `POST /api/live/start` → `startLiveStream` — Start broadcasting
- ✅ `POST /api/live/{id}/like` → `likeLiveStream` — Like a live stream
- ✅ `POST /api/live/{id}/gift` → `sendLiveStreamGift` — Send gift during live
- ✅ `POST /api/live/{id}/end` → `endLiveStream` — End a live stream

## 2. Subscriptions & Plans (7 endpoints)
- ✅ `GET /api/plans/{id}` → `getPlan` — Get subscription plan
- ✅ `GET /api/plans` → `getPlans` / `getMyPlans` — List subscription plans
- ✅ `GET /api/subscription/me` → `getMySubscriptions` — User's active subscriptions
- ✅ `GET /api/subscription/{id}` → `getSubscription` — Single subscription detail
- ✅ `POST /api/plans` → `createPlan` — Create subscription plan
- ✅ `POST /api/plans/{id}` → `updatePlan` — Update subscription plan
- ✅ `POST /api/plan/buy` → `buyPlan` — Purchase a subscription
- ✅ `isSubscribedToCreator` — Helper: Check subscription status

## 3. DM Admin & Group Features (10 endpoints)
- ✅ `GET /api/dm/search` — DM conversation search
- ✅ `GET /api/dm/{id}` → `getConversation` — Get single conversation
- ✅ `POST /api/dm/block` → `blockConversation` — Block a DM user
- ✅ `GET /api/dm/un-block/{id}` → `unblockConversation` — Unblock a DM user
- ✅ `POST /api/dm/group/info` → `getGroupInfo` — Get group details
- ✅ `POST /api/dm/group/join` → `joinGroup` — Join a group chat
- ✅ `PUT /api/dm/group` → `updateGroup` — Update group settings
- ✅ `POST /api/dm/group-user-exit` → `leaveGroup` — Leave group chat
- ✅ `POST /api/dm/group-user-block` → `blockUserInGroup` — Block user in group
- ✅ `POST /api/chat-image` → `uploadChatImage` — Upload image for chat

## 4. DM Status & Gating (4 endpoints)
- ✅ `GET /api/dm/user-status/{addr}` → `getDMUserStatus` / `getUserOnlineStatus` — User online status
- ✅ `POST /api/dm/user-status/{addr}` → `updateUserOnlineStatus` — Heartbeat/presence
- ✅ `GET /api/dm/plan/{id}` → `getDMPlanSettings` — DM subscription gates
- ✅ `GET /api/dm/dm-videos` → `getDMVideos` — Videos shared in DMs

## 5. LiveChat Moderation (6 endpoints)
- ✅ `GET /api/livechat/rooms/{id}` → `getLiveChatRoom` — Single room details
- ✅ `GET /api/livechat/user/{addr}` → `getLiveChatUserProfile` — Chat user profile
- ✅ `POST /api/livechat/rooms/topic` → `createTopicRoom` — Create topic room
- ✅ `POST .../messages/{id}/pin` → `pinLiveChatMessage` — Pin a message
- ✅ `DELETE .../messages/{id}/pin` → `unpinLiveChatMessage` — Unpin a message
- ✅ `POST .../rooms/{id}/ban` → `banLiveChatUser` — Ban from room
- ✅ `DELETE .../ban/{addr}` → `unbanLiveChatUser` — Unban from room
- ✅ `POST .../rooms/{id}/moderators` → `addLiveChatModerator` — Add moderator
- ✅ `PATCH .../rooms/{id}/settings` → `updateLiveChatRoomSettings` — Room settings

## 6. Content Management (6 endpoints)
- ✅ `GET /api/user/{id}/nfts` → `getUserNFTs` — Get a user's NFTs (paginated)
- ✅ `POST /api/token_visibility` → `updateTokenVisibility` — Toggle post public/private/unlisted
- ✅ `POST /api/comment_image` → `addCommentWithImage` — Image comment
- ✅ `POST /api/edit_comment` → `editComment` — Edit existing comment
- ✅ `PATCH /api/nft/{tokenId}` → `editPost` — Edit post title/description/categories
- ✅ `DELETE /api/nft/{tokenId}` → `deletePost` — Soft delete content

## 7. Follow Request Bulk (2 endpoints)
- ✅ `POST /api/follow-requests/accept-all` → `acceptAllFollowRequests` — Bulk accept
- ✅ `POST /api/follow-requests/reject-all` → `rejectAllFollowRequests` — Bulk reject

## 8. Reports — Legacy (2 endpoints)
- ✅ `GET /api/nft/reports` → `getAllReports` — Admin: get all reports
- ✅ `GET /api/reports/{tokenId}` → `getReportsForNFT` — Reports for specific post

## 9. Reports — New v2 (6 endpoints)
- ✅ `GET /api/report/content/status/{tokenId}` → `getContentReportStatus` — Check if you reported
- ✅ `GET /api/report/user/status/{userId}` → `getUserReportStatus` — Check if user reported
- ✅ `GET /api/report/reasons/content` → `getContentReportReasons` — Content report reasons
- ✅ `GET /api/report/reasons/user` → `getUserReportReasons` — User report reasons
- ✅ `POST /api/report/content` → `reportContent` — Report a video/post
- ✅ `POST /api/report/user` → `reportUser` — Report a user

## 10. DPay Payments (7 endpoints)
- ✅ `GET /api/dpay/price/{chainId}` → `getDPayPriceByChain` — Chain-specific price
- ✅ `GET /api/dpay/available/tokens` → `getAvailableTokens` — Available tokens list
- ✅ `GET /api/dpay/available/gas` → `getAvailableGasTokens` — Gas token list
- ✅ `GET /api/dpay/tnxs` → `getDPayTransactions` — Transaction history
- ✅ `GET /api/dpay/total` → `getDPayTotal` — Volume stats
- ✅ `POST /api/dpay/create-onramp-session` → `createOnrampSession` — Fiat onramp
- ✅ `POST /api/dpay/checkout` → `createCheckoutSession` — Checkout flow

## 11. Additional User Endpoints (2 endpoints)
- ✅ `GET /api/users_count` → `getUsersCount` — Total registered user count
- ✅ `GET /api/is_following` → `isFollowing` — Check if following a user

## 12. Additional Video/Content Endpoints (4 endpoints)
- ✅ `GET /api/getServerTime` → `getServerTime` — Current server time
- ✅ `GET /api/claim-bounty` → `claimBounty` — Get signature to claim bounty
- ✅ `GET /api/unlocked_nfts/{id}` → `getUnlockedNFTs` — Get unlocked PPV videos
- ✅ `POST /api/view/batch` → `recordBatchViews` — Batch record views

## 13. Push Notifications (8 endpoints) — Mobile Only
- ⬜ `POST /api/push/token` — Register push token
- ⬜ `DELETE /api/push/token/{deviceId}` — Unregister device
- ⬜ `DELETE /api/push/tokens` — Unregister all devices
- ⬜ `GET /api/push/devices` — List registered devices
- ⬜ `GET /api/push/preferences` — Get notification preferences
- ⬜ `POST /api/push/preferences` — Update notification preferences
- ⬜ `POST /api/push/preferences/reset` — Reset to defaults
- ⬜ `POST /api/push/test` — Send test push (dev only)

## 14. Mobile App Endpoints (6 endpoints) — Mobile Only
- ⬜ `GET /api/mobile/app/version` — App version info
- ⬜ `GET /api/mobile/app/check-update` — Check for updates
- ⬜ `GET /api/mobile/app/version-history` — Version history
- ⬜ `GET /api/mobile/app/review/stats` — Review stats
- ⬜ `GET /api/mobile/app/review/negative-feedback` — Negative feedback
- ⬜ `POST /api/mobile/app/review` — Submit review

## 15. Legacy/Duplicate
- ⬜ `POST /api/user_mint` → `mintNFT` — Legacy mint (replaced by `mintPost`)
- ⬜ `POST /api/request_follow` (toggle) → `toggleFollow` — Duplicate toggle version
- ⬜ `POST /api/dpay/tk` — Unknown purpose
