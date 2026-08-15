import { MilestoneContentMap } from './types';

export const milestones2024: MilestoneContentMap = {
  'expanding-reach-dhb-lists-on-ethereum-mainnet---a-dehub-milestone-from-q1-2024': {
    excerpt:
      'DHB listed on Ethereum mainnet. A year later we discontinued it — this post is where the reasoning for both starts.',
    content: `DHB listed on Ethereum mainnet in Q1 2024.

### Why mainnet

Ethereum is where the deepest liquidity, the most institutional attention and the largest developer ecosystem sit. For a token whose community had [voted BNB Chain as home in 2021](/guides/power-to-the-people-community-governed-listings---a-dehub-milestone-from-q2-2021), mainnet represented reach into a market that had largely never encountered DHB.

There was also a credibility component, whether or not it should exist. A meaningful part of the market treats mainnet presence as a filter, and being absent from it is read as a statement about seriousness rather than about cost structure.

### What made it possible

[Standard ERC-20 tokenomics](/guides/stability-first-adopting-standard-erc20-tokenomics---a-dehub-milestone-from-q4-2022).

That is not a throwaway line. After the [contract malfunction in Q4 2022](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022) we stripped everything out of the transfer path, and the dividend showed up here. A token with no unusual transfer behaviour deploys and integrates without special cases — no exception handling, no accommodation from bridges or aggregators, no explanation required.

The [automated liquidity provision](/guides/smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023) built the previous quarter was the other half. Listing on a chain is trivial. Having usable depth on it is the actual work, and by early 2024 that had become a process rather than a manual effort.

### The problem we walked into

Ethereum mainnet fees.

DHB is a consumer token. It is used for tipping creators, entering arcade games, unlocking content and paying for small things — actions where the transaction is frequently worth less than the gas to perform it.

That is not a problem you optimise your way out of. It is arithmetic. Mainnet in 2024 was excellent for holding value and poor for moving it in small amounts, and almost everything DeHub does is moving it in small amounts.

We understood this in principle before listing. We underestimated how completely it would determine actual usage.

### What happened next

One quarter later we [listed sDHB on Base](/guides/layer-2-expansion-sdhb-lists-on-base---a-dehub-milestone-from-q2-2024), and a year after that we [discontinued Ethereum mainnet support entirely](/guides/strategic-shift-discontinuing-ethereum-mainnet-support-for-dhb---a-dehub-milestone-from-q1-2025) to concentrate on the L2 where users could actually transact.

Reading this milestone alongside that one, the obvious question is whether mainnet was a mistake.

Partly. The reach argument was real and the liquidity was real. The consumer-usage argument was wrong, and we could have reasoned our way to that before spending the effort — the fee structure was not a secret.

What we would defend is the willingness to reverse it. Discontinuing a mainnet listing a year after announcing one is an uncomfortable thing to publish, and it was the correct call. The alternative was maintaining presence on a chain our users could not afford to use, because withdrawing looked like a retreat.

### Why the reach argument was seductive

Because it is true in isolation, and because it is the argument every adviser, partner and holder makes at once.

Mainnet presence genuinely does open doors. It genuinely is treated as a seriousness filter. Holders genuinely do ask for it, repeatedly, and the ask is not unreasonable.

What none of that survives is the question of what a user will actually do once they are there. We had four years of evidence that DeHub's transactions are small and frequent, and we let a legitimate argument about credibility outweigh a decisive one about arithmetic.

The general failure mode is worth naming: a strong argument for a decision is not the same as an answer to the strongest argument against it.`,
  },

  'fueling-growth-1m-raised-for-fansite-bj-fork---a-dehub-milestone-from-q1-2024': {
    excerpt:
      '$1,000,000 raised for the fork, from VCs, launchpads and public sales. A fork of our app, funded independently, with our stakers airdropped.',
    content: `In Q1 2024 fan.site — the adult-market fork of DeHub, previously BJ — raised $1,000,000 from VCs, launchpads and public sales.

### Why this is in DeHub's archive

Because it is the outcome of a decision we made, even though the company raising is not ours.

In Q3 2023 a group of large, long-term DeHub holders [forked the app](/guides/decentralization-in-practice-the-fansite-fork-story---a-dehub-milestone-from-q3-2023) to target a market we had declined. We did not obstruct it, we [transferred engineering knowledge to the team](/guides/supporting-growth-knowledge-transfer-to-fansite-team---a-dehub-milestone-from-q3-2023), and DeHub stakers were [allocated a portion of the supply through a partner airdrop](/guides/expanding-horizons-partner-airdrop-for-fansite-bj-fork---a-dehub-milestone-from-q3-2023).

Six months later that project raised a million dollars from outside investors. That is the strongest available evidence that supporting the fork was correct rather than merely principled.

### What changed between plan and execution

The original intent had been a straight-to-listing model. Market conditions and a specific opportunity changed it.

The team behind a number of instant sell-outs came on board, confident a raise of around $600,000 was achievable and would provide a serious launch budget. The marketing team working with $PAAL came across, along with an advisory board and incubators connected to top exchanges and launchpads, and agreements with major KOLs in the space.

The final figure came in at $1,000,000.

### Why the adult market attracted that funding

The economics are genuinely better on several dimensions, and investors know it: lower customer acquisition cost, lower brand royalties, and higher return on investment than mainstream consumer platforms. That was the explicit case put to the market at the time.

It is also a market DeHub was never going to serve directly, for the reasons set out plainly when the fork happened — protecting children and the vulnerable, and users of all faiths and none, is not compatible with hosting that content on the main platform. Separate markets, separate communities, no cross-promotion.

### What DeHub got

Not the money. The fork is a separate company with separate investors.

What our holders got was the airdrop. What we got was a demonstration that the [framework for community-driven forks](/guides/paving-the-way-framework-for-community-driven-forks---a-dehub-milestone-from-q3-2023) produces real results — a fork can be supported properly, remain genuinely separate, and succeed on its own terms without either side compromising.

That matters more than a fee would have. Any project can claim to be permissionless. Very few have an instance where someone took the technology, aimed it somewhere the original team would not go, raised a million dollars, and left the relationship intact.

### The part that is easy to misread

This is not a story about DeHub incubating a project. We did not select the team, set the strategy, take equity or share in the raise.

Holders of ours decided to do something, told us, and we chose not to obstruct it. The support we gave was engineering knowledge, offered because a badly built fork would have been worse for everyone including our own community.

The distinction matters because "we helped a project raise a million dollars" would be a considerably more flattering sentence than the accurate one, and it would misrepresent the mechanism entirely. What actually happened is that permissionless technology worked as advertised, which is less impressive to claim and more unusual to demonstrate.`,
  },

  'layer-2-expansion-sdhb-lists-on-base---a-dehub-milestone-from-q2-2024': {
    excerpt:
      'sDHB on Base. The chain where the transaction costs less than the thing you are buying — which is the entire requirement.',
    content: `sDHB listed on Base in Q2 2024, one quarter after DHB went live on Ethereum mainnet.

### Why so quickly after mainnet

Because mainnet had already demonstrated the problem it was always going to have.

DHB is a consumer token. It is used to tip creators, enter arcade games and unlock content — transactions frequently worth a few pounds. On [Ethereum mainnet](/guides/expanding-reach-dhb-lists-on-ethereum-mainnet---a-dehub-milestone-from-q1-2024) in 2024, the gas to perform those actions could exceed their value.

You cannot design around that. A platform whose core interactions are small payments needs a chain where small payments make sense.

### Why Base specifically

Several reasons, and only one of them is technical.

**Fees and speed.** Base was targeting confirmations in the low hundreds of milliseconds and fees below a cent — the range where tipping a creator is a normal action rather than a considered one.

**Where the users are.** Base carried a very large share of total L2 activity, with millions of weekly active addresses. Being on the busiest L2 is a distribution decision.

**The Coinbase relationship.** Base users see Base tokens in their Coinbase wallets and can onboard without the usual bridging exercise. For a consumer product, removing that step is worth more than any technical advantage.

**Ecosystem direction.** Ethereum's own thesis is L2-centric scaling. Building on an L2 is not a workaround for mainnet, it is what mainnet's roadmap asks applications to do.

### What sDHB is for

Staked DHB. Listing it on Base rather than only the base token was deliberate: staking is where the utility concentrates — [airdrop eligibility has run through staking since the first whitepaper in 2021](/guides/expanding-horizons-partner-airdrop-for-fansite-bj-fork---a-dehub-milestone-from-q3-2023) — and putting that on the chain with the lowest friction meant participation was not gated by transaction cost.

### What it led to

Base became the primary chain. In Q1 2025 we [discontinued Ethereum mainnet support for DHB](/guides/strategic-shift-discontinuing-ethereum-mainnet-support-for-dhb---a-dehub-milestone-from-q1-2025) and concentrated on Base, with Solana on the roadmap behind it.

That sequence — mainnet, then Base one quarter later, then leaving mainnet a year after that — reads like indecision compressed into twelve months. It is more accurate to say we tested a hypothesis about reach, got a clear answer about usage, and acted on it rather than defending the earlier decision.

The infrastructure that made moving between chains cheap was the [automated liquidity provision](/guides/smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023) built in late 2023 and the [plain ERC-20 contract](/guides/stability-first-adopting-standard-erc20-tokenomics---a-dehub-milestone-from-q4-2022) that deploys anywhere without special handling. Both were decisions made under duress in 2022 that kept paying.

### What multi-chain actually costs

More than the deployment, which is the part everyone budgets for.

Every additional chain is another liquidity position to fund and defend, another set of integrations to keep current, another surface where a bridge or an aggregator can behave unexpectedly, and another place for a user to end up holding the right token on the wrong network.

That last one is the real cost. Support load from cross-chain confusion is substantial and it falls hardest on exactly the non-technical users a consumer product is trying to serve.

Concentrating on Base rather than accumulating chains was partly a response to that. Being present in more places is not the same as being usable in more places, and the second is the only one that helps anybody.`,
  },

  'global-footprint-dehub-expands-middle-east-presence-via-dubai-event---a-dehub-milestone-from-q2-2024': {
    excerpt:
      'A Dubai event and the Middle East expansion behind it. Written up in more detail separately — this is what it was for.',
    content: `In Q2 2024 we expanded our Middle East presence through an event in Dubai. There is a [fuller account of the event itself](/guides/global-footprint-dehub-expands-middle-east-presence-via-dubai-event); this entry covers why the region mattered to the roadmap.

### Why the Middle East

Three reasons, in order of weight.

**Regulatory posture.** The UAE spent several years building an actual framework for digital assets rather than treating the category as a problem to be managed. For a company that had already learned what an unhelpful regulator does to a plan — the [Palawan tokenisation attempt died on the Philippine SEC's position](/guides/ambitious-ventures-the-palawan-real-estate-tokenization-attempt---a-dehub-milestone-from-q3-2022) — a jurisdiction with clear rules is worth considerable travel.

**Creator economics.** The region has a large, young, mobile-first audience and a creator economy that grew up without the assumption that Western platforms are the default. That is a much better market for a platform arguing that creators should keep 90% than one where existing arrangements are entrenched.

**Capital and partnerships.** Dubai is where a large share of this industry's serious conversations physically happen. Attending is not optional if you want to be in them.

### Why an event rather than an office

Because the honest answer at that point was that we did not know enough to commit to a permanent presence, and pretending otherwise would have been expensive.

An event is a way of finding out. You meet the actual partners, discover which assumptions about the market are wrong, and learn whether the interest is real or polite — all without a lease, a local entity and a team you may need to unwind.

That approach came directly out of 2022. We committed heavily to a property venture in a jurisdiction we did not understand well enough, did all the [registration](/guides/building-bridges-philippine-sec-registration-secured---a-dehub-milestone-from-q2-2022) and [advisory](/guides/strategic-alliances-partnering-with-real-estate-and-legal-experts---a-dehub-milestone-from-q3-2022) groundwork correctly, and still lost the venture to a regulatory position we had not confirmed in advance. Testing before committing is the lesson from that, applied.

### What it connected to

It sits alongside the [creator partnerships spanning 15 countries](/guides/worldwide-creators-partnerships-spanning-15-countries---a-dehub-milestone-from-q2-2024) established in the same quarter, and the co-founders' work building what became the [UK's largest TikTok partner agency](/guides/leading-the-way-dehub-agency-becomes-uk-1-with-1000-streamers---a-dehub-milestone-from-q4-2024).

That combination is the actual strategy of 2024: DeHub's growth was going to come through creators and the people who represent them, in markets where the incumbent platforms had not already locked everything down. Dubai was one of those markets and the event was how we tested it.

### What events are actually good for

Disqualifying things quickly.

The value is rarely the partnership that gets signed on the day. It is discovering, in the space of a few conversations, that an assumption you had built a plan around is wrong — that the payment rail you expected people to use is not the one they use, or that a category you thought was open is already served by something you had never heard of.

That information is available nowhere else at that speed, and it is worth the travel on its own.

The corollary is that an event where everything confirms what you already believed has probably not told you anything. We came back from Dubai with several plans in worse shape than they went out, which is the correct outcome.`,
  },

  'entrepreneurial-spirit-co-founders-launch-tiktok-agency---a-dehub-milestone-from-q2-2024': {
    excerpt:
      'Mike Hales and Indi Cammish opened a TikTok agency with TikTok executives directly, after a year topping the UK stream charts at around £1k a day.',
    content: `In Q2 2024 co-founders Mike Hales and Indi Cammish opened a TikTok agency in partnership with TikTok executives directly, following a year in which they topped the UK stream charts earning around £1,000 a day.

### The obvious question

Why are the founders of a decentralised streaming platform building a business on the most centralised streaming platform there is?

The answer is that you cannot credibly build for creators without being one.

Mike and Indi were not observing the live-streaming economy. They were at the top of it in the UK, on the platform where it is largest, earning at a level that only happens if you understand the format properly. Our team collectively holds over half a million followers and has run a leading social media agency alongside the platform work.

That produces knowledge you cannot get from research. What actually drives a gift. Why a stream dies at a particular point. What a creator's income really looks like month to month, and how much of it depends on decisions made by a platform they have no relationship with.

### What the agency is

A TikTok official partner agency, built in direct partnership with TikTok executives — not an unofficial operation. It represents live streamers, and by [Q4 2024 it had grown to 1,000 exclusively signed streamers and become the UK's largest](/guides/leading-the-way-dehub-agency-becomes-uk-1-with-1000-streamers---a-dehub-milestone-from-q4-2024).

### The uncomfortable part

DeHub's argument is that centralised platforms take too much and can change terms unilaterally. The agency's business is helping creators succeed on exactly such a platform.

We do not think that is hypocrisy, but it is a tension and it should be named rather than smoothed over.

The position is this: creators exist where the audience is, and telling them to abandon their income on principle is advice from people who are not paying their bills. What you can do is help them earn now, understand the risk they are carrying, and give them somewhere to go that does not have the same structure. The agency does the first two. DeHub is the third.

### What it gave the platform

**A thousand working streamers**, whose actual problems shape what we build.

**Institutional credibility.** The [partnerships across 15 countries](/guides/worldwide-creators-partnerships-spanning-15-countries---a-dehub-milestone-from-q2-2024) established that quarter were considerably easier to open as the people running the UK's top agency.

**A permanent reality check.** It is very hard to ship a bad creator tool when a thousand creators are one message away.

### Why it did not stall DeHub

Because the team had been [distributed with real ownership since 2021](/guides/global-reach-dehub-team-grows-to-15-strong---a-dehub-milestone-from-q3-2021). A company where two founders are the critical path cannot survive them building something else. That structure is why this was possible, and it is a fair test of whether the delegation was ever real.

### What the agency taught us that research could not

Three things, all of which changed the product.

**Income is lumpy and terrifying.** A creator's monthly earnings vary enormously for reasons they cannot control or predict, and that instability shapes every decision they make about which platform to invest time in. Features that offer predictability are worth more than features that offer upside.

**Support response time is a product feature.** When a payout is wrong, a creator is not experiencing a bug, they are experiencing a threat to their rent. Platforms are judged on this far more than on capability.

**Most creators are not technical and do not want to be.** Every step that requires understanding a wallet is a step where a meaningful percentage stop, regardless of what is on the other side.`,
  },

  'worldwide-creators-partnerships-spanning-15-countries---a-dehub-milestone-from-q2-2024': {
    excerpt:
      'Creator partnerships across 15 countries. The interesting part was how differently each market treats a platform that pays in tokens.',
    content: `By Q2 2024 we had established creator partnerships spanning 15 countries.

### Why geography matters more than it should

A streaming platform is theoretically borderless. In practice almost nothing about a creator's business is.

Payment rails differ. Whether a token payout is convenient or a compliance problem differs. Which platforms dominate differs — the assumption that everyone is on the same three services collapses the moment you leave a handful of markets. Even what "going live" means socially varies enormously.

Fifteen countries is not a large number. What made it useful was that it forced those differences into view early, before we had built too much on the assumption that our own market was representative.

### What we learned per market

Three findings that changed the product:

**Payout beats percentage.** Our [90% revenue share on tokenised uploads](/guides/creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023) is the strongest number we have, and in several markets it was not the deciding factor. What decided it was whether the creator could actually get the value out, in local terms, without a bank problem. A generous share that is difficult to realise loses to a smaller one that lands cleanly.

**Mobile-first is not a preference.** In a number of these markets it is the only thing. That validated the [React Native rebuild](/guides/building-for-all-app-rebuild-with-react-native---a-dehub-milestone-from-q3-2021) and the [custom game engine built for old hardware](/guides/powering-play-dehubs-custom-mobile-game-engine---a-dehub-milestone-from-q1-2022) more than any decision made in the UK.

**Transaction cost decides participation.** Where fees are meaningful relative to income, they do not reduce activity, they eliminate it. That fed directly into the move to [Base](/guides/layer-2-expansion-sdhb-lists-on-base---a-dehub-milestone-from-q2-2024) and eventually into [dropping Ethereum mainnet](/guides/strategic-shift-discontinuing-ethereum-mainnet-support-for-dhb---a-dehub-milestone-from-q1-2025).

### How the partnerships came about

Mostly through relationships rather than outreach. The founders were building what became the [UK's largest TikTok partner agency](/guides/leading-the-way-dehub-agency-becomes-uk-1-with-1000-streamers---a-dehub-milestone-from-q4-2024) in the same period, and the [Dubai event](/guides/global-footprint-dehub-expands-middle-east-presence-via-dubai-event---a-dehub-milestone-from-q2-2024) that quarter opened the Middle East.

Creator networks are personal. A partnership in a new market almost always starts with one creator who already trusts someone we know, which is slow and does not scale but is the only version that works.

### What we would do differently

Go narrower. Fifteen countries in a quarter meant spreading support thin, and a partnership without proper support is a logo on a slide.

The subsequent work — the [ambassador programme with 50 vacancies](/guides/community-champions-ugc-ambassadorship-program-launched---a-dehub-milestone-from-q2-2025) and the creator education curriculum in 2025 — was largely a correction. Fewer relationships, properly resourced, beats more of them announced.

### The number we should have reported

Fifteen countries is a reach metric, and reach metrics are the ones most worth distrusting. A more useful figure would have been how many of those partnerships were still producing uploads six months later, and we did not publish it because for a while we were not measuring it well enough to be confident.

We are now. It is the standard we hold this kind of announcement to internally, and it is why later creator milestones in this archive are framed around what a programme does rather than how many places it touches.

The general point applies well beyond creator partnerships. Any metric that counts how many things you have started, rather than how many are still running, will look better the less carefully you follow up — which is precisely why it is the one most often published.`,
  },

  'leveling-up-major-app-upgrade-earns-95-positive-feedback---a-dehub-milestone-from-q3-2024': {
    excerpt:
      '95% positive feedback on a major app upgrade — and the 5% is the part that shaped the following year.',
    content: `A major app upgrade shipped in Q3 2024 and drew 95% positive feedback.

### What a 95% figure is worth

Less than it appears, and we would rather say so.

Feedback on a release is self-selecting. The people who respond are disproportionately the engaged ones, and satisfaction scores on a redesign tend to be high in the first weeks regardless of the redesign, because novelty reads as improvement.

We report it because it is what the number was. We did not treat it as validation, and the more useful signals were behavioural — whether sessions got longer, whether people found features they had previously missed, whether support volume on specific screens dropped.

### What the upgrade contained

It shipped alongside the [interface overhaul and a 200% backend speed improvement](/guides/faster-and-sleeker-ui-overhaul-and-200-backend-speed-boost---a-dehub-milestone-from-q3-2024) in the same quarter. In practice they were one release described two ways: the parts users could see, and the parts that made those parts usable.

The reason they arrived together is that a redesign on a slow backend is a slower application that looks nicer, which users correctly experience as worse.

### The 5%

The critical feedback is why this milestone matters at all, because it was specific and it was consistent.

Almost all of it clustered on two things:

**Onboarding, still.** The single most persistent complaint in DeHub's history, unchanged in substance since the [50 user interviews we ran in Q1 2021](/guides/listening-to-our-users-50-interviews-shape-dehub---a-dehub-milestone-from-q1-2021), where wallet setup was identified as the wall people hit. Three years and a full rebuild later, it was still the wall.

**Discovery.** People could not reliably find things they knew existed. That is a much harder problem than it sounds, and it does not show up in satisfaction scores because users do not report missing what they never found.

### What it produced

Both complaints shaped the following year directly. The [revamped app feed with audio replies and live talk spaces](/guides/fresh-experience-revamped-app-feed-with-audio-replies--live-talk-spaces---a-dehub-milestone-from-q2-2025) in Q2 2025 was largely a discovery response, and the messaging work in [Q1 2025](/guides/connect-and-converse-advanced-messaging-system-with-paidfree-dms---a-dehub-milestone-from-q1-2025) addressed the related problem of things reaching people at all.

### The general lesson

A 95% positive result is a reason to look harder at the 5%, not a reason to stop. The satisfied majority tells you the release did not break anything they relied on. The dissatisfied minority tells you where the product still is not good, and on both counts here they had been telling us for three years.

### Why we publish the figure anyway

Because omitting it would be its own kind of dishonesty, and because the caveats are more useful attached to a real number than delivered in the abstract.

The industry norm is to publish satisfaction figures without any explanation of how they were gathered, which makes them impossible to weigh. Ours came from users who chose to respond, in the weeks after a release, when novelty is doing part of the work. That is not a criticism of the result — it is the context required to read it.

If a project reports a satisfaction number and does not tell you who was asked, when, and what proportion answered, the number is decoration. Including ours.`,
  },

  'faster-and-sleeker-ui-overhaul-and-200-backend-speed-boost---a-dehub-milestone-from-q3-2024': {
    excerpt:
      'A full interface overhaul and a backend three times faster. Shipped together, because either one alone would have been worse than nothing.',
    content: `In Q3 2024 we overhauled the user interface and improved backend speed by 200%.

### Why they shipped together

Because separately they are both bad releases.

A redesign on a slow backend is a slower app that looks different, and users experience it as a downgrade no matter how good the design is — the visual change draws attention to every wait. A backend improvement with no visible change is invisible: users do not notice three times faster if the thing they are waiting for looks exactly the same.

Together they are a single perceptible improvement. Everything looks different and everything responds immediately, and those reinforce rather than undermine each other. That is why the [same release drew 95% positive feedback](/guides/leveling-up-major-app-upgrade-earns-95-positive-feedback---a-dehub-milestone-from-q3-2024).

### What "200% faster" means

Three times the previous throughput, across the paths that matter — feed loads, stream starts, wallet operations, arcade launches.

The honest detail is that this was not one clever optimisation. It was the accumulated cost of four years of shipping, paid down. Queries written when the dataset was small and never revisited. Sequential calls that could always have been parallel. Caching applied where it was easy rather than where it helped. Every one of them was individually reasonable at the time and collectively expensive.

There is no glamorous version of this work. It is measurement, then unpicking, then measuring again.

### What the overhaul actually changed

Less than a screenshot comparison suggests, and more than users could articulate.

The [50 user interviews from 2021](/guides/listening-to-our-users-50-interviews-shape-dehub---a-dehub-milestone-from-q1-2021) had produced two findings that remained true three years later: wallet setup was where people gave up, and anything requiring a mental model to understand its value was treated with suspicion. The overhaul was largely those two findings applied across the whole surface.

Fewer steps between opening the app and doing something. Clearer statements of what an action is worth before you take it. Less of the app assuming you already knew how it worked.

### What it did not fix

Onboarding, entirely. It got better and it remained the most common place people stop, which is the [single most persistent finding in DeHub's history](/guides/listening-to-our-users-50-interviews-shape-dehub---a-dehub-milestone-from-q1-2021).

Discovery also stayed weak, and that fed the [feed revamp with audio replies and live talk spaces](/guides/fresh-experience-revamped-app-feed-with-audio-replies--live-talk-spaces---a-dehub-milestone-from-q2-2025) the following year.

### Why the speed work mattered most

Because everything after it depended on the headroom. The [Livepeer integration for 50,000+ concurrent viewers](/guides/scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025), the [custom CDN](/guides/speed-of-light-custom-cdn-achieves-sub-200ms-global-latency---a-dehub-milestone-from-q1-2025) and [99.99% uptime](/guides/reliability-perfected-9999-uptime-for-dehub-streaming---a-dehub-milestone-from-q1-2025) in Q1 2025 all arrived within two quarters, and none of them would have been survivable on the backend as it stood in mid-2024.

### How the debt accumulated

Not through carelessness, which is the comforting explanation and the wrong one.

Every slow query in that codebase was written by someone competent, under a deadline, against a dataset where it performed fine. Every sequential call that should have been parallel was sequential because that was the simplest correct version at the time. None of it was a mistake when it was made.

The mistake was structural: nothing in our process ever revisited a decision after the conditions that justified it had changed. Code was reviewed when written and never again.

The fix was not better engineers. It was making performance a standing measurement rather than an incident response, so that degradation shows up as a trend rather than as a complaint.`,
  },

  'the-hype-is-real-last-chad-standing-teaser-hits-1m-views---a-dehub-milestone-from-q4-2024': {
    excerpt:
      'A million views on the teaser for the first MMA-inspired battle royale. The audience it reached was mostly not a crypto audience.',
    content: `The teaser for Last Chad Standing passed a million views in Q4 2024.

### What Last Chad Standing is

An MMA-inspired battle royale — hyper-realistic, gory and gritty, built as a fighting experience rather than as a token with a game attached.

It grew out of the [Chads NFT collection minted in Q2 2022](/guides/the-chads-arrive-genesis-mint-of-the-chads-nft-collection---a-dehub-milestone-from-q2-2022), which is an unusual outcome for a 2022 collection. Most did not become anything. This one became a property with a trailer that people outside the industry watched.

### Why the number matters

Not because a million views is large in absolute terms. Because of where they came from.

The overwhelming majority of that audience was not crypto. It was gaming and MMA — people who watched a fighting game teaser because it looked like a fighting game they might want to play, with no idea that a token was involved and no reason to care.

That is the audience DeHub has been trying to reach since the [documentary featuring Jorge Masvidal and Brad Pickett in 2022](/guides/lights-camera-blockchain-dehubs-first-tokenized-documentary---a-dehub-milestone-from-q2-2022), which taught us the lesson this teaser applied: the crypto-native audience was most interested in the tokenisation and least interested in the content, and the people who actually wanted to watch did not care how it was distributed.

So the teaser did not mention the chain. It showed the game.

### Why MMA, again

Because it is a sport we actually know rather than a market we selected. The founders' background is in streaming and combat sports, the [2022 documentary](/guides/lights-camera-blockchain-dehubs-first-tokenized-documentary---a-dehub-milestone-from-q2-2022) was directed by Luke Barnatt and featured working fighters, and the relationships were real ones.

That matters for a genre where authenticity is immediately obvious to the audience. MMA fans can tell within seconds whether the people making something understand the sport.

### What followed

One quarter later the [full trailer was released and picked up by major MMA promoters](/guides/main-event-ready-last-chad-standing-full-trailer-gains-mma-promoter-attention---a-dehub-milestone-from-q1-2025) — professionals in the sport, not crypto media, treating it as a serious property.

By Q2 2025 we were running the [final snapshot for the game's airdrop](/guides/get-ready-players-final-snapshot-for-last-chad-standing-airdrop---a-dehub-milestone-from-q2-2025), covering both holders and stakers.

### The honest caveat

A teaser is a promise. A million views measure interest in the promise, not satisfaction with the thing, and the gap between an excellent trailer and an excellent game is where a great many projects have been buried.

We report this as what it is: strong evidence that the concept and the execution of the marketing landed with an audience that owed us nothing. The game has to earn the rest.

### Why not lead with the token

Because the audience that would be attracted by it is not the audience that makes a game succeed.

A fighting game lives or dies on whether people want to play it repeatedly. That requires players, and players are recruited by gameplay, art direction and the sense that the people making it understand the genre. A token is irrelevant to all three, and mentioning it early filters for people evaluating an investment rather than a game.

We have watched a great many Web3 games get this backwards, assemble an audience of holders, and discover at launch that holders do not play. The token then becomes the only thing holding the project up, which is a structure with a well-documented ending.

Players first. Everything else is downstream of whether the game is good.`,
  },

  'leading-the-way-dehub-agency-becomes-uk-1-with-1000-streamers---a-dehub-milestone-from-q4-2024': {
    excerpt:
      '1,000 exclusively signed live streamers and the UK\'s number one position. Covered at length elsewhere — this is what it meant for the platform.',
    content: `By Q4 2024 the agency founded by DeHub's co-founders had grown to 1,000 exclusively signed live streamers and become the UK's largest. There is a [fuller write-up of the agency itself](/guides/leading-the-way-dehub-founders-official-tiktok-partner-agency-becomes-uk-1-with-1000-streamers); this entry is about what it changed for DeHub.

### The scale of it

A thousand exclusively signed streamers is not a roster, it is an operation. It means contracts, payouts, disputes, onboarding, performance support and a constant stream of people whose income depends on decisions being made competently.

The agency was [opened in Q2 2024 in direct partnership with TikTok executives](/guides/entrepreneurial-spirit-co-founders-launch-tiktok-agency---a-dehub-milestone-from-q2-2024), after Mike Hales and Indi Cammish spent a year at the top of the UK stream charts earning around £1,000 a day. Reaching number one in the UK within roughly two quarters is fast even with that starting position.

### What it gave the platform

**A permanent source of truth about creators.** Not survey data. A thousand people whose livelihoods depend on live streaming, one message away, whose complaints arrive before they become industry consensus.

Several of DeHub's priorities came directly out of that channel. The emphasis on payout mechanics over headline percentages in the [15-country partnership work](/guides/worldwide-creators-partnerships-spanning-15-countries---a-dehub-milestone-from-q2-2024). The attention to delivery and notification in the [messaging system](/guides/connect-and-converse-advanced-messaging-system-with-paidfree-dms---a-dehub-milestone-from-q1-2025). The creator education curriculum in 2025, which exists because the agency demonstrated how much of a creator's success is skills rather than tools.

**Credibility that does not require explaining crypto.** Being the UK's number one TikTok partner agency is a fact a broadcaster, brand or regulator can evaluate without any of the usual preamble.

### The tension, again

DeHub argues that centralised platforms extract too much and can change terms unilaterally. The agency's business is helping creators succeed on one.

The position has not changed since the agency launched: creators are where the audience is, telling them to leave on principle is advice from people not paying their bills, and the useful thing is to help them earn now while building somewhere structurally different to go. It remains a tension. It is not a secret one.

### What it proves about the company

That DeHub was not dependent on its founders' full attention — which is the actual test of whether [distributing ownership across a team in 2021](/guides/global-reach-dehub-team-grows-to-15-strong---a-dehub-milestone-from-q3-2021) was real or decorative.

Q4 2024 also delivered [DePIN Phase 1](/guides/the-future-of-infrastructure-depin-phase-1-goes-live---a-dehub-milestone-from-q4-2024), [on-chain tradable subscriptions](/guides/revolutionizing-access-on-chain-tradable-subscriptions-launch---a-dehub-milestone-from-q4-2024) and a [Last Chad Standing teaser that passed a million views](/guides/the-hype-is-real-last-chad-standing-teaser-hits-1m-views---a-dehub-milestone-from-q4-2024). The platform did not slow down.

### The number behind the number

A thousand exclusive signings is a retention statistic before it is a growth one.

Streamers leave agencies constantly. The industry runs on short commitments and better offers, and an agency's roster figure at any moment says more about recruitment than about whether anyone stays.

Exclusive is the word doing the work. Exclusivity means creators declined other representation, which is a judgement about the relationship rather than about the pitch — and it is the only part of the figure that could not have been bought.

It is also the reason the roster is useful to DeHub as a source of truth. People who are leaving in three months tell you what they think you want to hear. People who have committed tell you what is actually wrong.`,
  },

  'the-future-of-infrastructure-depin-phase-1-goes-live---a-dehub-milestone-from-q4-2024': {
    excerpt:
      'Phase 1 of decentralised physical infrastructure. The point where "decentralised streaming" stops being a description of the token and starts being one of the delivery.',
    content: `DePIN Phase 1 went live in Q4 2024.

### What the problem actually is

DeHub has described itself as decentralised streaming for years, and for most of that time the honest scope of that claim was the economics — [on-chain revenue sharing](/guides/creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023), [verifiable ownership](/guides/empowering-creators-dehub-nft-marketplace-with-royalties---a-dehub-milestone-from-q2-2022), [checkable outcomes](/guides/on-chain-glory-blockchain-leaderboards-and-rewards-in-dehub-arcade---a-dehub-milestone-from-q1-2022).

The video itself moved over ordinary infrastructure. Servers, CDNs, providers — the same stack as everyone else, with the same properties. A provider can decline to serve you. A jurisdiction can require content removed. A commercial decision made by a company you do not control can take you off the internet.

Decentralised payment on top of centralised delivery is a real improvement and an incomplete one. If the pipe can be closed, the censorship-resistance argument has a hole in it.

### What DePIN means here

Decentralised physical infrastructure: distributing the actual work of delivering video across independently operated nodes rather than concentrating it with a small number of providers.

Phase 1 is the first stage of that, and calling it Phase 1 is deliberate. This is a multi-year replacement of the least glamorous and most load-bearing part of the platform, and any project claiming to have completed it in a quarter is describing something smaller than it sounds.

### Why now

Because the surrounding infrastructure was finally good enough to take it.

By late 2024 we had [three times the backend throughput](/guides/faster-and-sleeker-ui-overhaul-and-200-backend-speed-boost---a-dehub-milestone-from-q3-2024) and years of compounding delivery work behind us — the [compression that cut bandwidth costs by around 60%](/guides/efficient-streaming-advanced-video-compression-reduces-costs---a-dehub-milestone-from-q2-2022), and the [stream app built around failure modes rather than best cases](/guides/crystal-clear-dehub-stream-app-with-4k-support--high-uptime---a-dehub-milestone-from-q2-2022).

Distributed delivery is harder than centralised delivery on every axis that matters — consistency, latency, debugging. Attempting it before the centralised version was genuinely good would have produced something worse in exchange for a principle, and creators do not accept a degraded stream in return for an architecture diagram.

### What it has to clear

The bar is that a viewer cannot tell. Not that it is acceptable given the trade-off — that it is indistinguishable.

That is why [Livepeer integration for 50,000+ concurrent viewers](/guides/scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025), a [custom CDN at sub-200ms globally](/guides/speed-of-light-custom-cdn-achieves-sub-200ms-global-latency---a-dehub-milestone-from-q1-2025) and [99.99% uptime](/guides/reliability-perfected-9999-uptime-for-dehub-streaming---a-dehub-milestone-from-q1-2025) all landed in the following quarter. Those are the numbers that make the decentralised version defensible rather than aspirational.

Phase 1 is a start on the hardest remaining part of the original claim. It is not finished and we will not describe it as such.

### Why we are explicit about the phasing

Because "decentralised infrastructure" is one of the most abused terms in this industry, and the abuse follows a pattern.

A project announces decentralised delivery, ships something with a handful of nodes that it operates itself, and stops. The claim is technically defensible and practically meaningless, because a network you control entirely is a network with a single point of failure wearing a different label.

The honest measure is not whether the architecture is distributed but whether the operators are independent, and how much of the traffic they actually carry. Those numbers move slowly and unglamorously.

Calling this Phase 1 is a commitment to reporting the later phases when they happen rather than declaring the problem solved at the point where the announcement is available.`,
  },
};
