import { BlogPost } from '@/types/blog';

export const decentralizationSpectrumPost: BlogPost = {
  id: 'decentralization-spectrum-social-media',
  slug: 'decentralization-spectrum-social-media',
  title: 'The Decentralization Spectrum: How Decentralized Can Social Media Really Get?',
  excerpt: 'Every "decentralized" social app runs on an internet that is already very centralized. Here is an honest spectrum of 30 crypto and decentralized social platforms, where Riftn sits on it, and why open source matters more than a perfect score.',
  content: `Every decentralized social app has a slightly awkward secret: it runs on the same internet as everything else. And the internet is a lot more centralized than most "Web3" marketing would like you to believe.

So instead of asking whether an app is decentralized, yes or no, it is more honest to ask **how far along the spectrum it is**, and on which parts. This guide lays out that spectrum, places 30 crypto and decentralized social platforms on it, and shows exactly where Riftn sits, including the bits that are centralized on purpose.

![The decentralization spectrum: from fully centralized apps to fully on-chain networks, with 30 social platforms placed along it](/media/fig-decentralization-spectrum-riftn.jpg)

## First, a reality check: the internet is already centralized

Before anyone gets too proud of their node count, here is what almost every decentralized app quietly depends on.

- **Names.** Every web address relies on the DNS root, which is coordinated by one non-profit, ICANN, and served by 13 root server identities run by 12 organizations. Your ".com" is rented from a registrar that can suspend it.
- **Cloud.** Amazon, Microsoft and Google together run roughly two thirds of the world's cloud infrastructure. When one AWS region stumbled on 20 October 2025, apps from Signal to Snapchat went down with it.
- **The front door.** A Cloudflare outage on 18 November 2025 took X and ChatGPT offline for hours. A big slice of the web sits behind a single company's network.
- **App stores.** Two companies decide what can be installed on almost every phone on earth. In January 2021 Apple and Google pulled Parler from their stores, and Amazon stopped hosting it, all within days.
- **Your internet provider.** Whoever runs your connection can block, throttle or log what you reach.
- **Blockchains too.** Most wallets and apps read the chain through a few big node providers instead of running their own node, and a large share of nodes live in the same handful of clouds. Riftn is no exception: we use Alchemy to watch the chain.

None of this means decentralization is pointless. It means it is a matter of degree, and anyone who claims to be "fully decentralized" is either running on a ham radio or rounding up.

## The five questions that place an app on the spectrum

Decentralization is not one dial. It is at least five, and most apps score very differently on each.

1. **Who holds your identity?** A company account, a server you picked, or a key only you control?
2. **Where are your words stored?** In one company's database, across many servers, or on a blockchain?
3. **Where is your media stored?** Photos and videos are huge. Almost nobody puts them on chain.
4. **Who decides what gets seen?** One trust and safety team, each server's admin, the community, or you?
5. **Can anyone read and run the code?** If the code is public, people can check it, and leave with it.

## The spectrum, rung by rung

Here is the ladder from fully centralized to fully on-chain, with 30 platforms placed where they really sit today. Placements are our honest read of how each works, not a ranking of how good they are. For user numbers and developer activity, see our [Top 50 Decentralized Social Apps 2026](/guides/top-50-decentralized-social-apps-2026) index.

### Rung 0: Fully centralized

One company owns the accounts, the data, the servers, the rules and the code.

- **X, Instagram, TikTok, YouTube, Facebook**: the baseline. Your account is a row in their database and can disappear with one decision.

### Rung 1: Centralized, but with a token or open code

Still one company running the servers, but with something extra: public code, or a token and a wallet bolted on.

- **Minds**: open source code under the AGPL, but one company runs the network.
- **Phaver, Arena, UXLINK, Cheelee**: crypto rewards and wallets, but the app, the data and the rules are run centrally.
- **Odysee**: started on the LBRY blockchain. After LBRY Inc. lost its case with the SEC in 2023, Odysee carried on as a mostly ordinary video platform.
- **Friend.tech**: keys were traded on Base, but the app itself was centralized. When the team walked away in 2024, the contracts stayed on chain and the app went quiet. A good lesson in why "on-chain" alone is not the whole story.

### Rung 2: Federated

Thousands of independent servers that talk to each other. Each server's admin moderates their own patch and can block other servers.

- **Mastodon**: microblogging on ActivityPub, fully open source. Your identity belongs to your server, so if it shuts down, you move.
- **Pixelfed, PeerTube, Misskey, Lemmy, Friendica**: the same idea for photos, video, Japanese-style microblogging, link sharing and Facebook-style profiles.
- **Matrix and Element**: federated, encrypted chat that any organization can host.

### Rung 3: Portable identity on shared infrastructure

You can take your account and followers to another provider, but in practice most of the pipes are still run by one team.

- **Bluesky**: built on the AT Protocol. Your posts live in a personal data server that you can move, and moderation is stackable, so you can subscribe to labelers run by other people. Most accounts still live on Bluesky's own servers, and Bluesky runs the main relay and app.
- **Blacksky and Skylight**: community and video apps on the same protocol, proving others can build on it.

### Rung 4: Hybrid on-chain

Identity, ownership or payments on a blockchain. Posts and media mostly off chain, for speed and cost.

- **Farcaster**: your account ID is registered on Optimism, an Ethereum layer 2. Posts are spread across Farcaster's own network of nodes, not a blockchain. Images are links to files hosted elsewhere.
- **Lens**: profiles and the social graph live on Lens Chain. Post content and media are stored off chain.
- **Zora**: every post is a coin on Base. The trading is on chain; the app and the media hosting are run by Zora.
- **Base App**: Coinbase's wallet and social app. Its social side rides on Farcaster and Zora, while the app itself is run by Coinbase.
- **Audius**: music is stored on content nodes run by independent operators, with a token for governance and rewards.
- **Riftn**: identity is your wallet, and any post can be minted so **its words are written onto the blockchain itself**. Media stays off chain. More on exactly how below.

### Rung 5: Keys and relays

No company, no chain, no servers you have to trust. Just a key you hold and many relays that pass messages around.

- **Nostr** (Damus, Primal, Amethyst, Iris, Coracle): your identity is a key pair. You post to as many relays as you like, and anyone can run one. Media is hosted separately. There is no central moderation, so relays and apps choose what to carry and show.

### Rung 6: Everything on chain

The posts themselves are blockchain data.

- **Hive** (PeakD, Ecency): every post and comment is stored on the Hive blockchain. Images are hosted elsewhere and linked.
- **Steemit**: the original. In 2020, after Justin Sun bought Steemit Inc., exchanges used their customers' deposits to vote in new validators. The community answered by copying the chain and leaving to start Hive. That was only possible because the code and the data were public.
- **DeSo** (Focus, Diamond): a layer 1 blockchain built just for social, storing posts on chain, with images kept off chain.
- **OpenChat, DSCVR, Taggr**: apps that run as smart contracts on the Internet Computer, so the content and the app itself live on chain.

Notice something? **Even at the very top of the ladder, images and video almost always live off chain.** Storing a two minute video on a blockchain would cost a fortune and be slow for everyone. That is not a flaw in any one project. It is physics and economics.

## Where Riftn sits, honestly

Here is how Riftn answers the five questions.

- **Identity:** your wallet. Sign in with it, and your on-chain posts and payments are tied to an address you control, not to a password we hold.
- **Words:** off chain by default, on chain when you mint. When a post is minted, its full text goes into the blockchain record of the mint, along with a fingerprint (a keccak256 hash) of the original. Very long posts are trimmed in that record, but the fingerprint still proves the full original. Later edits never change what was minted. If Riftn vanished tomorrow, anyone could still read your minted words straight from the chain.
- **Media:** off chain. Videos, images and audio live in regular cloud storage behind a CDN, served by our apps.
- **Moderation:** layered. Part community, part you, part us. Details in the next section.
- **Federation:** your Riftn profile can be followed from Mastodon and the wider fediverse at @yourname@riftn.com.
- **Code:** our web and mobile apps are public on GitHub, and you can read every change as it lands. Our server code is not public yet.

That puts Riftn on rung 4: hybrid on-chain. That is a choice, not an accident, and the next two sections explain why.

## Why only words go on chain

Putting words on chain and keeping media off it is not just about cost. It is also the line that keeps a censorship-resistant network legally sane.

The worst content on the internet is overwhelmingly media: child sexual abuse material, non-consensual intimate images, pirated films. If that kind of file were written to a blockchain, nobody could ever remove it, and every node operator would be holding it. By keeping every image, video and sound file off chain, Riftn can take that material down completely and report it, the same day.

Words are different. Writing words is not a crime in itself: no string of characters is illegal to type. What the law cares about is intent and action, like threatening someone, defrauding them or harassing them. Those are already crimes, covered by laws that apply to the person who did them, wherever they did it. So nobody needs to censor a blockchain to keep it legal.

If anything, words on chain help. A minted post is permanent, timestamped and tied to a wallet. If someone uses words to threaten or to scam, the chain is not their accomplice. It is the evidence. **The chain stays uncensored, and the law deals with intent, the way it always has.** What Riftn's apps choose to show and pay for is a separate question, and that is what the moderation layer below is for.

## Decentralized and centralized moderation, together

Riftn runs both kinds of moderation at once, on purpose.

**The community layer (decentralized):**

- **Reports are weighted by standing.** Anyone can report a post for one of 11 reasons, from spam to child abuse. A badgeless account needs 5 reports to raise a community alert, while higher badges need fewer, down to 1 for Giant Tortoise and above. Long-standing members count for more, and new or throwaway accounts count for less.
- **The crowd can bury a post.** When dislikes outweigh likes and at least 2 separate accounts disliked it, the post leaves public feeds like Home and Explore. Nobody can bury anyone on their own, at any badge level. A buried post still stays on its author's profile, in the Following feed and on its own page.

**The personal layer (yours):**

- **Mute, block and keyword filters** decide what you see, and a **kids mode** tightens everything up.

**The central layer (us, for compliance):**

- **Moderators** review community alerts and reports, and can remove posts and media that break the rules or the law.
- **Curator accounts.** A short list of accounts set by the team can take a post out of public discovery with a dislike. Nothing is deleted, and the post stays on the author's profile.
- **Appeals.** If your post is removed or your account is warned, you can appeal and get a reference number, and the answer comes back to you.

The chain is the part nobody can take from you. The moderation layer is the part that keeps the app safe and legal to run. You need both.

## Why fully open source beats "fully decentralized"

If we had to choose between a perfectly decentralized network with closed code and a centralized one with fully open code, we would pick open code every time. Here is why.

- **You can check it.** Open code lets anyone verify what an app really does with your data, your money and your posts. Decentralization claims you cannot inspect are just marketing.
- **You can leave with it.** The Steemit story above is the proof. When the company was captured, the community copied the code and the data and walked out. That is the real safety net, and it only works when the code is public.
- **It is realistic.** As the reality check showed, nobody escapes DNS, clouds, app stores and internet providers completely. Publishing your code is something any team can do today.
- **Trust comes from openness.** Signal runs central servers, yet privacy experts trust it, because its code is public and its claims can be tested. Mastodon became the backbone of the fediverse because anyone could run it.
- **Decentralization without openness can still be a trap.** A network can be spread across thousands of nodes and still be controlled by whoever writes the only client nobody else can read.

That is the standard we hold ourselves to as well. Riftn's web and mobile apps are public, built in the open with [thousands of public commits](/guides/top-50-decentralized-social-apps-2026), and shaped by community requests on [riftn.com/features](https://riftn.com/features). Opening up the server code is the obvious next step on that path.

## The bottom line

- **Total decentralization is a myth.** Every app on this list still leans on DNS, clouds, app stores and internet providers somewhere.
- **The useful question is which parts are decentralized**: identity, words, media, moderation and code.
- **Words on chain, media off chain** gives you a permanent, censorship-resistant record without turning the network into a permanent home for the worst files on the internet.
- **Good moderation is layered**: community signals, personal tools, and a central team for the law.
- **Open source is the foundation.** It is what lets you check, fork and leave, and it is achievable today.

Want to see the spectrum from the inside? Open [riftn.com](https://riftn.com), mint a post, and read it back from the chain yourself. New here? Start with [What is Riftn?](/guides/what-is-dehub)`,
  bannerImage: '/media/decentralization-spectrum-banner-manrope.jpg',
  bannerImageAlt: 'The decentralization spectrum: how decentralized can social media really get?',
  author: { name: 'Riftn Team' },
  publishedAt: '2026-11-13T22:00:00.000Z',
  tags: ['Decentralization', 'Decentralized Social Media', 'Open Source', 'Moderation', 'Blockchain', 'Riftn'],
  readingTime: 11,
  featured: false,
  status: 'published',
  seoTitle: 'The Decentralization Spectrum: How Decentralized Can Social Media Get?',
  seoDescription: 'An honest look at 30 decentralized and crypto social apps, from Mastodon and Bluesky to Farcaster, Nostr and Hive. What goes on chain, who moderates, and why open source matters most.',
};
