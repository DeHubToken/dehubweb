import { MilestoneContentMap } from './types';

export const milestones2025: MilestoneContentMap = {
  'interactive-streaming-on-chain-live-streams-with-animated-tips---a-dehub-milestone-from-q1-2025': {
    excerpt:
      'Live streams where the tip settles on-chain and the animation fires in the same moment. The hard part was making those two things feel like one.',
    content: `In Q1 2025 we released on-chain live streams with real-time animated tips.

### Two systems with incompatible tempos

A tip on DeHub is a real transaction. It settles on-chain, the creator receives it directly, and there is a permanent record neither party depends on us to maintain.

A tip in a live stream is a social moment. Someone does something generous in front of an audience, and the value of it is almost entirely in the reaction — which has to happen now, while the stream is on the thing that prompted it.

Those two requirements pull in opposite directions. Blockchain settlement has latency and variability. A live moment has neither, and a celebration that arrives forty seconds late is worse than no celebration, because it lands on top of something else entirely.

Most platforms resolve this by not settling on-chain at all — the tip is a database row and the blockchain, if involved, is a detail behind the scenes. That works and it gives up the property we exist to provide.

### How we handled it

The interface responds to the intent immediately while settlement completes underneath, and the two are reconciled honestly rather than optimistically.

The critical design rule was that the visible celebration must never claim more certainty than the chain has provided. Showing a confirmed tip that later fails would be a straightforward lie to both the creator and the room, and it is the shortcut every implementation of this is tempted by.

Getting that boundary right — responsive without being dishonest — was most of the work.

### Why animations are not decoration

They are the mechanism. Tipping is social behaviour, and social behaviour needs visible consequence. A tip that produces a line in a log produces one tip. A tip that produces something everyone in the room sees produces more tips, from other people, because the behaviour has been demonstrated as welcome.

Scaling the response to the amount is what makes that legible — small tips get a small acknowledgement, large ones dominate the stream. It sounds crude and it is the entire economy of live streaming, on every platform, everywhere.

### What it rested on

Three years of streaming infrastructure. The [stream app with 4K and 99.9% uptime](/guides/crystal-clear-dehub-stream-app-with-4k-support--high-uptime---a-dehub-milestone-from-q2-2022) from 2022, the [compression work](/guides/efficient-streaming-advanced-video-compression-reduces-costs---a-dehub-milestone-from-q2-2022) that made the economics survivable, and the [200% backend speed improvement](/guides/faster-and-sleeker-ui-overhaul-and-200-backend-speed-boost---a-dehub-milestone-from-q3-2024) shipped the previous quarter.

It also depended on the chain being cheap enough for small tips to make sense at all, which is why the same quarter includes [discontinuing Ethereum mainnet support](/guides/strategic-shift-discontinuing-ethereum-mainnet-support-for-dhb---a-dehub-milestone-from-q1-2025). A tip economy does not work where the transaction costs more than the tip, and no amount of interface polish fixes that.

### What creators told us afterwards

The feedback that mattered was not about the animations. It was that the tip arrives directly.

On conventional platforms a gift passes through the platform, sits in a balance, is subject to a payout schedule, and eventually becomes money in a bank account weeks later minus a share. Creators have adapted to that so completely that they mostly do not think of it as a cost.

Direct settlement removes the schedule, the intermediate balance and the discretion. What a creator receives is what a viewer sent, when they sent it.

That is a smaller technical claim than "on-chain streaming" and a much larger practical one, and it is the part that came up unprompted in almost every conversation with the [thousand streamers on the agency roster](/guides/leading-the-way-dehub-agency-becomes-uk-1-with-1000-streamers---a-dehub-milestone-from-q4-2024).`,
  },

  'scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025': {
    excerpt:
      'Livepeer integration taking us to 50,000+ concurrent viewers, with headroom beyond that on higher tiers — and a delivery layer that is not one company.',
    content: `In Q1 2025 we integrated Livepeer, supporting more than 50,000 concurrent viewers with, in principle, unlimited capacity on higher spend tiers.

### Why not just add servers

Because concurrency is the specific thing that does not scale by adding servers.

Fifty thousand people watching fifty different streams is a manageable distribution problem. Fifty thousand watching one stream, at once, in real time, from everywhere, is a different problem entirely — and it is the one that matters, because the streams that decide a platform's reputation are exactly the ones with a large simultaneous audience.

A platform that handles ordinary load well and fails at a creator's biggest moment has failed at the only moment anyone will remember.

### Why Livepeer specifically

It fits the direction we had already committed to.

[DePIN Phase 1 went live in Q4 2024](/guides/the-future-of-infrastructure-depin-phase-1-goes-live---a-dehub-milestone-from-q4-2024), beginning the work of distributing video delivery across independently operated infrastructure rather than concentrating it with a few providers. Livepeer is decentralised transcoding and delivery, which makes it the same argument applied to the most expensive part of the pipeline.

That matters beyond principle. A centralised provider is a single commercial relationship that can be withdrawn, repriced or subjected to a jurisdiction's requirements. For a platform whose entire proposition is that creators should not be exposed to unilateral decisions by intermediaries, running all delivery through one is an obvious inconsistency.

### The honest framing of "unlimited"

The bullet in our roadmap says unlimited in theory on higher spend tiers, and the qualifier is doing real work.

Capacity above the tested level is a function of what you are willing to pay for. There is no architectural ceiling in the way there is with a fixed fleet, and there is very much a commercial one. We tested to 50,000+. Beyond that is a budget question, and we would rather state it that way than imply a number nobody has verified.

### What it needed underneath

The [200% backend improvement](/guides/faster-and-sleeker-ui-overhaul-and-200-backend-speed-boost---a-dehub-milestone-from-q3-2024) from Q3 2024, without which none of this would have been survivable, and the [custom CDN reaching sub-200ms globally](/guides/speed-of-light-custom-cdn-achieves-sub-200ms-global-latency---a-dehub-milestone-from-q1-2025) shipped alongside it.

Those two are complementary rather than alternatives — Livepeer handles transcoding and distribution at scale, and the CDN determines how quickly the result reaches a particular viewer.

Together with [99.99% uptime](/guides/reliability-perfected-9999-uptime-for-dehub-streaming---a-dehub-milestone-from-q1-2025) in the same quarter, they are the numbers that let us make the decentralised-delivery argument without asking creators to accept a worse stream for it. That was always the condition. A principle a viewer can perceive as buffering is not a principle anyone will adopt.

### Concurrency is a reputation problem

The reason we treat this as a priority rather than a capacity planning exercise is that the failures are not evenly distributed in their consequences.

A platform that handles ordinary streams well and struggles at 20,000 concurrent viewers has not failed 0.1% of the time. It has failed during the events that define what people think of it — the tournament, the launch, the collaboration that brought a new audience in.

Those are also the streams most likely to be clipped, screenshotted and discussed. A buffering failure at that moment does more damage than a month of flawless ordinary operation repairs.

So the capacity target is not set by average load. It is set by the largest thing a creator might plausibly do on the platform, which is a much more expensive number to design for and the only defensible one.`,
  },

  'speed-of-light-custom-cdn-achieves-sub-200ms-global-latency---a-dehub-milestone-from-q1-2025': {
    excerpt:
      'Sub-200ms globally, from our own CDN. The word doing the work in that sentence is "globally".',
    content: `In Q1 2025 we brought a custom CDN into production, reaching sub-200ms latency globally.

### Why build rather than buy

Commercial CDNs are excellent and we used them for years. Two things eventually made building worth it.

**Cost structure.** We give creators [90% of ad revenue on tokenised uploads](/guides/creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023) and pay the full delivery cost. That means delivery cost is effectively our margin, and it is why we [cut bandwidth around 60% with compression work back in 2022](/guides/efficient-streaming-advanced-video-compression-reduces-costs---a-dehub-milestone-from-q2-2022). At sufficient volume, general-purpose CDN pricing becomes the dominant term in that equation.

**Direction of travel.** [DePIN Phase 1](/guides/the-future-of-infrastructure-depin-phase-1-goes-live---a-dehub-milestone-from-q4-2024) had already begun distributing delivery across independently operated infrastructure. Routing everything through a single commercial CDN sits awkwardly with that, for the same reason routing all transcoding through one provider does.

### The "globally" part

Sub-200ms in North America and Western Europe is not difficult. That is where the infrastructure is, and any competent setup achieves it.

Sub-200ms globally means the markets where it is genuinely hard — and those are exactly the markets our [creator partnerships across 15 countries](/guides/worldwide-creators-partnerships-spanning-15-countries---a-dehub-milestone-from-q2-2024) put us in, and the ones the [Dubai event](/guides/global-footprint-dehub-expands-middle-east-presence-via-dubai-event---a-dehub-milestone-from-q2-2024) opened.

A platform that is fast in London and slow in Manila is not a global platform. It is a Western platform with international users, and they can tell.

### Why latency, not bandwidth

For recorded video, bandwidth is what matters and latency is largely hidden by buffering.

Live is the opposite. Latency is the difference between a stream where the chat is part of the conversation and one where viewers are reacting to something the creator said half a minute ago. Once the delay passes a certain point, the interaction stops being live in any sense that matters — and everything we had just built assumed it was.

[Animated on-chain tips](/guides/interactive-streaming-on-chain-live-streams-with-animated-tips---a-dehub-milestone-from-q1-2025) shipped in the same quarter. That feature is worthless at high latency: the celebration lands after the moment it was responding to, on top of something unrelated. The CDN is what makes it coherent.

### What it does not solve

The last mile. A viewer on poor mobile data in a rural area is not helped by a fast edge node, and no amount of CDN work changes their connection.

That is the constraint behind adaptive delivery generally, and behind [degrading quality rather than dropping a stream](/guides/crystal-clear-dehub-stream-app-with-4k-support--high-uptime---a-dehub-milestone-from-q2-2022) — a principle set in 2022 and unchanged.

Alongside [Livepeer](/guides/scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025) and [99.99% uptime](/guides/reliability-perfected-9999-uptime-for-dehub-streaming---a-dehub-milestone-from-q1-2025), this is the quarter DeHub's streaming stopped having an excuse attached to it.

### How the figure is measured

Worth stating, because latency numbers are easy to publish and hard to interpret.

Ours is measured to the edge, across the regions we actually serve, rather than as a global average weighted by traffic. A traffic-weighted average is flattering by construction: most of your traffic is in your strongest regions, so the number reflects where you are already good.

The distinction matters most for exactly the markets this work was for. A platform can report excellent average latency while being slow everywhere its growth is coming from, and nothing in the figure would reveal it.

We report the worst regions rather than hiding them in an average, which produces a less impressive headline and a number that means something.`,
  },

  'reliability-perfected-9999-uptime-for-dehub-streaming---a-dehub-milestone-from-q1-2025': {
    excerpt:
      '99.99% across all streaming services. The fourth nine costs more than the first three combined, and here is why we paid for it.',
    content: `In Q1 2025 we reached 99.99% uptime across all streaming services.

### What the extra nine costs

Our [2022 stream app shipped at 99.9%](/guides/crystal-clear-dehub-stream-app-with-4k-support--high-uptime---a-dehub-milestone-from-q2-2022) — roughly eight and a half hours of downtime a year. 99.99% is about 52 minutes.

Getting from the first to the second is not ten percent more work. It is a different engineering posture. At three nines you can recover from most failures by responding to them competently. At four, the response has to be automatic, because the entire annual budget is smaller than the time it takes a human to be paged, orient and act.

That means redundancy at every point where a single failure would be visible, failover that happens without a decision, and — the expensive part — regularly proving the failover works, because untested failover is a belief rather than a property.

### Why bother

Because of the asymmetry we identified in 2022 and have never revised.

A creator who goes live to a scheduled audience and cannot broadcast has not been delayed. That audience is gone, and the creator spends their own credibility explaining a failure that was not theirs. Do it twice and they stop scheduling on your platform, which is a rational response.

Fifty-two minutes a year is roughly one bad stream. Eight and a half hours is potentially dozens, and they do not land conveniently — they land during the events that matter, because that is when load is highest.

### "All streaming services" is the load-bearing phrase

Not the streams. Everything a live broadcast depends on: ingest, transcoding, delivery, chat, the tipping path, the authentication in front of all of it.

A stream that stays up while tipping is down is not up in any sense a creator cares about. Composite availability is much harder than any single component's, because the failure probabilities compound, and quoting a number for the easy component is a common way to publish a figure that is technically true and practically meaningless.

### What made it possible

Everything shipped around it. [Livepeer for concurrency](/guides/scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025), the [custom CDN](/guides/speed-of-light-custom-cdn-achieves-sub-200ms-global-latency---a-dehub-milestone-from-q1-2025), the [200% backend improvement](/guides/faster-and-sleeker-ui-overhaul-and-200-backend-speed-boost---a-dehub-milestone-from-q3-2024) the previous quarter, and the [distributed delivery work begun with DePIN Phase 1](/guides/the-future-of-infrastructure-depin-phase-1-goes-live---a-dehub-milestone-from-q4-2024).

Distribution is what made four nines realistic. Independently operated infrastructure has no single component whose failure takes everything with it, which is the property centralised delivery cannot offer at any price.

### The caveat we keep

Uptime is measured, and measurement is a choice. Ours covers the composite service rather than the most flattering component, and we would rather report a harder number honestly than a soft one impressively.

The standard has not changed since 2022: if a creator's stream fails, it is our failure, whatever the cause.

![DeHub card reading "52 minutes a year" — what 99.99% uptime actually allows for](/lovable-uploads/inbody-fourth-nine.jpg)

### What we are not claiming

That nothing will go wrong. Four nines is 52 minutes a year, not zero, and a creator who loses a stream inside those 52 minutes is not consoled by the annual figure.

We are also not claiming that the number will hold automatically. Availability degrades quietly as a system grows — new dependencies, new failure paths, the slow accumulation of things that have never been tested together. Reaching four nines once and reporting it forever is a common and dishonest pattern.

It is measured continuously and it is reported as measured, including in periods where it dips. An availability figure that only appears in announcements is a marketing artefact, and the difference between that and an operating standard is whether it survives a bad quarter.`,
  },

  'strategic-shift-discontinuing-ethereum-mainnet-support-for-dhb---a-dehub-milestone-from-q1-2025': {
    excerpt:
      'We ended Ethereum mainnet support a year after adding it, and concentrated on Base. Fees, not ideology.',
    content: `In Q1 2025 we discontinued Ethereum mainnet support for DHB and concentrated on Base, with Solana next on the roadmap.

We [listed on mainnet in Q1 2024](/guides/expanding-reach-dhb-lists-on-ethereum-mainnet---a-dehub-milestone-from-q1-2024). Reversing that within a year is not a comfortable thing to publish, so here is the reasoning in full.

### The problem was arithmetic

DHB is a consumer token. It tips creators, enters arcade games, unlocks content and pays for small things. The transactions are frequently worth a few pounds.

On mainnet, the gas to perform those actions could exceed their value. That is not a user experience problem that better design solves — it is a cost floor beneath which the product does not function. Every consumer behaviour we had spent four years building assumed transactions cheap enough to be thoughtless.

### Why this is the ecosystem's own direction

Ethereum's thought leadership, including the Ethereum Foundation and Vitalik Buterin, has been consistent: scaling happens through Layer 2, not by loading the base chain. Rollups now scale Ethereum by roughly 17x while cutting fees by a similar margin, and an L2-centric ecosystem is treated as necessary for a pluralistic, decentralised future rather than as a workaround.

Read that way, moving to an L2 is not leaving Ethereum. It is doing what Ethereum's roadmap asks applications to do.

### Why Base

**Speed and cost.** Upgrades targeting around 200ms confirmations and sub-cent fees — the range where tipping is a normal action rather than a considered one.

**Where users already are.** Roughly 4.6 million weekly active addresses, more than half of overall L2 usage.

**The Coinbase path.** Base tokens appear directly in Coinbase wallets and users can onboard instantly, removing the bridging step that loses ordinary people.

We [listed sDHB on Base in Q2 2024](/guides/layer-2-expansion-sdhb-lists-on-base---a-dehub-milestone-from-q2-2024), so this was consolidation onto a chain already carrying our staking activity rather than a leap.

### Solana next

Base is the focus, not the endpoint. Solana's high-throughput, low-latency design complements it, its DeFi and NFT ecosystems are active, and a Coinbase listing opens cleaner integration paths. It is on the roadmap as a second leg rather than a replacement.

### What the freed capacity goes to

- **Liquidity provisioning** with leading AMMs on Base, building organic depth — an extension of the [automated provision strategies](/guides/smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023) running since late 2023.
- **Capital deployment** from treasury to support incentives and unlocks.
- **User acquisition** — onboarding rewards, wallet connection bonuses, bridge credits.
- **Developer engagement** through hackathons, grants and DHB-native tooling.

### On reversing a decision

Maintaining a mainnet listing our users could not afford to use, purely because withdrawing would look like retreat, would have been vanity at their expense.

The reach argument for mainnet was real. The consumer-usage argument was wrong, and it was knowable in advance — the fee structure was never a secret. We would rather record that plainly than quietly let the listing decay.

### What discontinuing does not mean

It does not mean DHB stops existing for anyone holding on mainnet, and it does not mean support was withdrawn without a route.

Discontinuing support means we stop maintaining liquidity, integrations and product functionality on that chain, and concentrate all of it where users transact. Announcing it explicitly, with notice, is the difference between a decision and abandonment — and abandonment is what usually happens, because quietly letting a listing become illiquid attracts no criticism and requires no announcement.

The version that would have been genuinely wrong is the one where nothing is said, depth erodes over a year, and holders discover the position is unexecutable at the moment they try to use it. That is common in this industry and it is not something we were prepared to do.`,
  },

  'connect-and-converse-advanced-messaging-system-with-paidfree-dms---a-dehub-milestone-from-q1-2025': {
    excerpt:
      'Paid or free DMs and unlockable chat content — a creator-side answer to an inbox that is 95% noise.',
    content: `In Q1 2025 we completed a messaging system supporting paid or free direct messages and unlockable chat content.

### The problem paid DMs actually solve

A creator with any audience has an unusable inbox. Not a busy one — unusable. The volume makes it impossible to find the message that matters, so most creators stop reading, and the people with something genuinely worth saying lose the channel along with everyone else.

Every existing answer is bad. Filters guess wrong. Assistants are expensive and only available at the top. Closing DMs entirely severs the connection that made the audience valuable.

A price is a filter that costs the sender something and pays the recipient. It does not measure importance, which is a real limitation. It does measure willingness to spend on being heard, which correlates well enough to make an inbox readable — and unlike an algorithmic filter, the creator controls it and can see exactly how it is set.

### Why free had to stay

Because a purely paid inbox is a worse product for the audience, and most of the reason someone follows a creator is the possibility of contact.

Both modes exist together. Creators set what applies. A fan can message free where the creator allows it, and paying is a way to be certain of reaching someone who has otherwise had to close the channel.

Making it configurable rather than deciding for everyone was the right call. A 1,000-follower creator and a 500,000-follower creator have opposite problems, and one policy cannot serve both.

### Unlockable chat content

Content within a conversation that opens on payment.

The reason this belongs in messaging rather than in a separate purchase flow is that it matches how the interaction actually happens. A creator offering something specific to a specific person, in the conversation where it came up, should not have to route them to a storefront and hope they return.

It also inherits the [tokenised upload economics](/guides/creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023) — settlement on-chain, terms attached to the item, not a rate we honour administratively.

### The lesson we had already paid for

Delivery is the feature, not the message.

When [friend challenges shipped in the arcade in 2022](/guides/challenge-accepted-social-features-and-friend-challenges-arrive---a-dehub-milestone-from-q1-2022), the mechanic worked and the loop leaked badly — challenges sent, never seen, quietly expired — and fixing notification mattered more than anything we did to the feature itself.

We built messaging with that in front of us. A paid message that does not reliably arrive is not a degraded product, it is a refund and a broken promise.

### Where it fits

Alongside the [feed revamp with audio replies and live talk spaces](/guides/fresh-experience-revamped-app-feed-with-audio-replies--live-talk-spaces---a-dehub-milestone-from-q2-2025) the following quarter, and later an [open-source end-to-end encryption implementation](/guides/privacy-first-open-source-e2ee-dehub) — because a private message that the platform can read is only private by policy.

### The objection to paid messaging

That it puts access behind a paywall and advantages people with money over people without.

It does, and the honest response is that the alternative advantages people with time — those willing to message repeatedly until something gets noticed — and produces an inbox nobody reads, which advantages nobody at all.

The design does what it can about this. Free messaging remains available wherever a creator allows it, which for most creators is most of the time. The paid tier exists for the case where the alternative was a closed inbox, not as a replacement for an open one.

It is a genuine trade-off rather than a solved problem, and any platform telling you it has solved inbox overload without one is not describing its actual mechanism.`,
  },

  'main-event-ready-last-chad-standing-full-trailer-gains-mma-promoter-attention---a-dehub-milestone-from-q1-2025': {
    excerpt:
      'The full trailer landed, and the people who noticed were MMA promoters rather than crypto media. That was the entire objective.',
    content: `In Q1 2025 we released the full trailer for Last Chad Standing, and it was picked up by major MMA promoters.

### Why the audience matters more than the reach

The [teaser had already passed a million views in Q4 2024](/guides/the-hype-is-real-last-chad-standing-teaser-hits-1m-views---a-dehub-milestone-from-q4-2024), overwhelmingly from gaming and MMA audiences rather than crypto.

The full trailer went further in a way that is harder to buy: it reached people who work in the sport. Promoters are not a general audience. They evaluate combat properties professionally, they see a great deal of ambitious material, and their attention is not available through marketing spend.

That is a qualitatively different signal from view count. A million people watching means the marketing landed. Promoters paying attention means the thing itself reads as credible to specialists.

### Why it reads as credible

Because the people making it are not tourists in the sport.

Our [first tokenised documentary in 2022](/guides/lights-camera-blockchain-dehubs-first-tokenized-documentary---a-dehub-milestone-from-q2-2022) was directed by Luke Barnatt and featured Jorge Masvidal, Brad Pickett and other working fighters. Those relationships were real and predate any of this. The founders' background is streaming and combat sports.

MMA audiences detect inauthenticity immediately, and there is no production budget that compensates for it. A fighting game made by people who do not understand fighting announces itself in the first ten seconds.

### What the documentary taught us that this applied

The 2022 project produced an uncomfortable finding: the crypto-native audience was most interested in the tokenisation and least interested in the content, while the people who actually wanted to watch did not care how it was distributed.

So neither the teaser nor the trailer led with the chain. They showed the game — a hyper-realistic, gory, gritty MMA-inspired battle royale, presented as something you might want to play.

The token exists and the [airdrops attached to it are real](/guides/get-ready-players-final-snapshot-for-last-chad-standing-airdrop---a-dehub-milestone-from-q2-2025), with the final snapshot for holders and stakers running in Q2 2025. None of that belongs in a trailer aimed at MMA fans.

### The honest caveat

A trailer is still a promise. It demonstrates that the concept, the art direction and the understanding of the sport are right. It does not demonstrate that the game is good, and the gap between an excellent trailer and an excellent game has buried a great many projects — several of them in this industry, with better funding than ours.

What can be said is that Last Chad Standing has now been evaluated twice by audiences with no stake in DeHub: a million-plus viewers who watched it as a game, and professionals who assessed it as an MMA property. Both times it held up.

The rest has to be earned by shipping it.

### Why promoter interest changes the calculation

Because it opens a distribution route that has nothing to do with this industry.

A game endorsed within combat sports reaches an audience through events, broadcasts and fighters' own channels — none of which require anyone to understand a wallet, and all of which reach people who will never read a crypto publication.

That is the answer to the problem the [2022 documentary](/guides/lights-camera-blockchain-dehubs-first-tokenized-documentary---a-dehub-milestone-from-q2-2022) exposed. We had content the mainstream audience would want and no route to them that did not pass through crypto channels first.

The property being taken seriously by the sport is what closes that gap, and it is worth considerably more to this project than the view count that preceded it.`,
  },

  'transparency-hub-dhbscancom-launches-for-contract-activity-tracking---a-dehub-milestone-from-q2-2025': {
    excerpt:
      'dhbscan.com — every DHB contract in one place, so verifying us does not require knowing which addresses to look at.',
    content: `In Q2 2025 we released dhbscan.com, letting users track activity across all DHB contracts.

### Why a block explorer already exists and was not enough

Everything on dhbscan has always been public. It is on-chain. Anyone determined enough could find it.

That is the standard defence for not building something like this, and it is weak. "Technically available" and "practically checkable" are very different, and the gap between them is where opacity actually lives.

To verify DHB activity before this, you needed to know which contracts exist, across which chains, which addresses are ours and which are not, and what normal activity looks like. That is a research project. It filtered verification down to people with the time and expertise to do it — which is a small group, and not the group most exposed to being misled.

Publishing a policy and then requiring specialist knowledge to check compliance is only slightly better than not publishing it.

### What it does

Collects DHB contract activity in one place, so a holder can see what is happening without first assembling a map of the ecosystem.

The design constraint was that it must not become a source of truth in its own right. dhbscan is a view over the chain, not a database of our claims about the chain. If it disagrees with the chain, the chain is right, and anything shown should be traceable back to the transaction it came from.

A "transparency" product that asks you to trust its own numbers has inverted its purpose.

### Where this comes from

A direct line, and it starts with a failure.

In Q4 2021 our [listing agent took the fundraise and dumped our chart](/guides/trials-and-tribulations-the-gateio-listing-agent-incident---a-dehub-milestone-from-q4-2021). Gate investigated, apologised, and could not identify anyone because the records were lost. Our recourse ended at somebody else's missing paperwork.

Everything since has moved in one direction: [provably fair draws](/guides/fair-play-provably-fair-randomization-in-dehub-games---a-dehub-milestone-from-q4-2021), [on-chain verified raffle mechanics](/guides/trust-and-transparency-on-chain-verified-raffle-mechanics---a-dehub-milestone-from-q3-2022), a [published DEX policy](/guides/open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023), [transparency reports](/guides/full-disclosure-dehubs-comprehensive-transparency-reports---a-dehub-milestone-from-q4-2023), [leaving centralised exchanges by choice](/guides/prioritizing-principles-voluntary-delisting-from-gateio-for-decentralization---a-dehub-milestone-from-q4-2023).

dhbscan is that sequence finished. Not "we will tell you what we did", but "here is where you look".

### The point of it

To make trusting us optional.

We would rather be checked than believed. Belief is fragile, it does not survive a bad quarter, and this project has had several. A verifiable record survives them, because it does not depend on anyone's opinion of us — including our own.

![DeHub card reading "checked not believed" — dhbscan shows the bad quarters too](/lovable-uploads/inbody-dhbscan.jpg)

### The uncomfortable consequence

It shows the bad periods too, and it cannot be configured not to.

Contract activity during the [v2 migration](/guides/moving-forward-successful-migration-of-25000-holders-to-v2---a-dehub-milestone-from-q4-2022), the aftermath of the [listing agent incident](/guides/trials-and-tribulations-the-gateio-listing-agent-incident---a-dehub-milestone-from-q4-2021), every treasury movement during quarters we would rather not revisit — all of it is visible, and none of it is annotated with our explanation.

That is the correct design. A transparency tool with a curation layer is a publishing platform, and the moment we could choose what it displays, it would stop answering the question it exists for.

The written accounts of those periods live in this archive, at full length, with the failures named. The tool shows the data. Keeping those two things separate is what makes either one worth anything.`,
  },

  'fresh-experience-revamped-app-feed-with-audio-replies--live-talk-spaces---a-dehub-milestone-from-q2-2025': {
    excerpt:
      'A rebuilt feed, audio replies, and live talk spaces — aimed squarely at the discovery problem users had been reporting for years.',
    content: `In Q2 2025 we revamped the main app feed and introduced audio replies and live talk spaces.

### The problem this was for

Discovery, which had been the most persistent unresolved complaint in the product.

When the [major app upgrade drew 95% positive feedback in Q3 2024](/guides/leveling-up-major-app-upgrade-earns-95-positive-feedback---a-dehub-milestone-from-q3-2024), the critical 5% clustered on two things. One was onboarding. The other was that people could not reliably find things they knew existed.

Discovery failures are insidious because they are invisible in the metrics. Users do not report missing what they never found, and satisfaction scores stay high while the platform quietly fails to connect people to most of what is on it.

### The feed

Rebuilt rather than adjusted. The old feed was organised around what had been posted, which is the obvious structure and the wrong one once there is more content than any person can see. A feed is a routing problem, not a list.

The rule we held to was that anything affecting what a creator earns must remain legible. DeHub pays creators [90% of ad revenue on tokenised uploads](/guides/creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023), settled on-chain, and a distribution system nobody can reason about undermines that regardless of how good the payment terms are. Creators on every major platform will tell you the algorithm is the term of their contract they understand least and fear most.

### Audio replies

Replying to a post with your voice rather than text.

The reason this is more than a format option is friction. Text replies are work — composition, editing, and a permanent record of exactly how you phrased something. Audio is faster to produce and carries tone, which removes most of the ambiguity that makes text threads go wrong.

It also suits our audience. DeHub's creators are streamers. Talking is what they do, and asking them to express themselves in a text box is asking for their weakest medium.

### Live talk spaces

Live, audio-only rooms — closer to a conversation than a broadcast.

Video streaming demands a great deal of a creator: presence, setup, appearance, full attention. Audio rooms demand very little, which means they happen far more often. A creator who streams weekly can hold a talk space daily.

They ride on the infrastructure built the previous quarter — [Livepeer](/guides/scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025), the [custom CDN](/guides/speed-of-light-custom-cdn-achieves-sub-200ms-global-latency---a-dehub-milestone-from-q1-2025), [99.99% uptime](/guides/reliability-perfected-9999-uptime-for-dehub-streaming---a-dehub-milestone-from-q1-2025). Audio is cheaper than video, and a talk space that drops is exactly as damaging to a creator's credibility as a failed stream.

### Where it fits

With the [messaging system](/guides/connect-and-converse-advanced-messaging-system-with-paidfree-dms---a-dehub-milestone-from-q1-2025) from the previous quarter, this is the pair of releases aimed at the same underlying question: how people find each other on DeHub, and what happens once they do.

### The commitment attached to the feed

Any change to how content is distributed gets explained, and the explanation is written for creators rather than for us.

That is a harder promise than it sounds. Distribution changes are where every platform becomes least communicative, partly for legitimate reasons — explaining ranking in detail invites gaming — and partly because vagueness is convenient when a change reduces someone's reach.

The position we have taken is that a creator earning [90% of ad revenue settled on-chain](/guides/creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023) is owed an account of what determines whether anyone sees their upload. Transparent payment terms attached to an opaque distribution system is a half-measure, and it is the half that most platforms have chosen.

We would rather accept some gaming than reproduce the thing creators most distrust about every platform they already use.`,
  },
};
