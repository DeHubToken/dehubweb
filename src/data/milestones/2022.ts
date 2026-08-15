import { MilestoneContentMap } from './types';

export const milestones2022: MilestoneContentMap = {
  'level-up-dehub-arcade-launches-with-5-games--predictions---a-dehub-milestone-from-q1-2022': {
    excerpt:
      'Five games — Super Robin Hood and Tomb Runner among them — plus predictions, shipped as one arcade rather than five separate apps.',
    content: `The DeHub Arcade launched in Q1 2022 with five games, including Super Robin Hood and Tomb Runner, alongside the prediction games we had introduced the previous quarter.

### Why an arcade and not a game

We could have built one game well. An arcade was the harder choice and the right one, because the thing we actually needed to prove was not that we could make a game — plenty of projects can — but that we could run a platform where games plug in, share an account, share a wallet and share a leaderboard.

One game is a product. An arcade is an argument about architecture. If the second game costs as much to add as the first, you do not have a platform, you have a folder.

By the time five titles were live it was clear which one we had. Adding a game meant adding a game, not rebuilding the surrounding machinery each time. That is the property that later let us drop new titles in without a release cycle around each one.

### What the five had to have in common

The constraint we set was that every title had to work with the same primitives:

- **One identity.** Your DeHub account is your arcade account. No per-game signup, no separate balance.
- **One wallet path.** Whatever a game needs to do with tokens, it does through the same route, so a user learns it once.
- **One leaderboard model.** Scores land somewhere shared, which is what made [on-chain leaderboards and rewards](/guides/on-chain-glory-blockchain-leaderboards-and-rewards-in-dehub-arcade---a-dehub-milestone-from-q1-2022) possible in the same quarter rather than as a per-game feature.

That sounds obvious written down. It is also the part most projects skip, because the first game ships faster without it and the cost only appears at the third.

### Predictions sitting alongside

Keeping predictions in the arcade rather than in their own section was deliberate. Both are things you do in a short session, both have an outcome, and both live or die on whether the outcome is verifiable — which we had already committed to with [provably fair randomisation](/guides/fair-play-provably-fair-randomization-in-dehub-games---a-dehub-milestone-from-q4-2021) the previous quarter.

Splitting them across the app would have meant two places to check, two mental models, and two sets of rules for the same trust question.

### What it did for the app

The arcade turned out to be the best answer we had to a hard problem: what does someone do in the app on a day when there is no announcement, nothing to claim and nothing new to watch?

Feeds need content. Streams need a creator to be live. Games need neither. They work at 2am on a quiet Tuesday, which is why [monthly active gamers passed 5,000](/guides/high-score-dehub-gaming-hits-5000-monthly-active-users---a-dehub-milestone-from-q1-2022) in the same quarter the arcade opened.

### Where it went

Later titles followed, including Street Slayer, which we ended up rebalancing before running competitive tournaments on stream — a nerf to some overpowered combos that the community had been vocal about for months.

The arcade is still on DeHub today and the model has not changed: one account, one wallet path, shared leaderboards, and new titles that arrive as content rather than as engineering projects. Of the decisions made in early 2022, this is the one that has needed the least revisiting.

### What we got wrong about it

We expected the arcade to be a feature and treated it as one internally for far too long — resourced as a section of the app rather than as a product with its own audience.

The [5,000 monthly active gamers](/guides/high-score-dehub-gaming-hits-5000-monthly-active-users---a-dehub-milestone-from-q1-2022) it reached in the same quarter were, to a significant extent, people whose entire relationship with DeHub was the games. They were not holders. Many had no interest in the token at all.

That is the hardest audience in this industry to reach and we had reached it almost by accident, then spent a year not building for it properly. The correction came later, and the games that followed — including Street Slayer, which we rebalanced before running competitive tournaments on stream — were planned as titles rather than as content drops.`,
  },

  'high-score-dehub-gaming-hits-5000-monthly-active-users---a-dehub-milestone-from-q1-2022': {
    excerpt:
      '5,000 monthly active gamers in the arcade\'s first quarter. The number that mattered was how many came back on quiet days.',
    content: `The arcade passed 5,000 monthly active gamers in Q1 2022, the same quarter it launched.

### Why we track gamers separately

DeHub has several distinct things a person can be. A holder is not a viewer. A viewer is not a creator. A gamer is none of the above, and lumping them into a single "active user" figure hides more than it reveals.

Separating them meant we could see something specific: the arcade was pulling people who were not there for the token. A meaningful share of arcade usage in that first quarter came from people whose relationship with DeHub was "I play the games", which is exactly the audience a project built on tokenomics normally never reaches.

### The metric behind the metric

Monthly actives is a headline number and a weak one. It rewards a good launch and tells you nothing about whether the thing is alive.

What we actually watched was day-over-day return on days with no announcement. Games are the only surface in the app that works without an input from us — a feed needs posts, a stream needs a creator online, an airdrop needs an airdrop. A game needs a person and a few minutes.

The arcade held up on those days, which is what made 5,000 worth reporting rather than just worth publishing.

### What drove it

Three things, roughly in order of impact:

- **Session length was short by design.** Super Robin Hood and Tomb Runner are things you can play in the gap where you would otherwise scroll. Nothing in the arcade demanded a sitting.
- **No separate onboarding.** Because [every title shared one identity and one wallet path](/guides/level-up-dehub-arcade-launches-with-5-games--predictions---a-dehub-milestone-from-q1-2022), trying a second game cost nothing. Most of our per-user game counts were above one.
- **The leaderboard gave a reason to return.** [On-chain leaderboards and rewards](/guides/on-chain-glory-blockchain-leaderboards-and-rewards-in-dehub-arcade---a-dehub-milestone-from-q1-2022) shipped in the same quarter, and a score that persists publicly is a much stronger return hook than a score that does not.

### What we misread

We assumed competitive players would be the core and casual players the tail. It was the other way round. The overwhelming majority of sessions were short, casual and solo, and the competitive layer — while loud, and disproportionately represented in our community channels — was a small fraction of actual play.

That shaped later decisions. When [friend challenges](/guides/challenge-accepted-social-features-and-friend-challenges-arrive---a-dehub-milestone-from-q1-2022) arrived the same quarter, they were built as a light overlay on solo play rather than as a competitive mode, precisely because the data said most people were not there to compete.

### Why it still matters

Five thousand monthly gamers is not a large number in gaming terms and we have never pretended otherwise. What it bought was proof that the arcade could hold an audience with no token incentive attached, on a platform where almost everything else at the time depended on one. That is the reason the arcade survived every subsequent pivot in the roadmap.

### The number that would have been better

Percentage of arcade users who were not holders.

We did not report it at the time and we should have, because it was the genuinely unusual thing about that quarter. A crypto project reaching people who do not hold its token is rare enough to be worth measuring deliberately rather than noticing in passing.

It also would have protected the arcade internally. For a period in 2023 there was a reasonable-sounding argument that the games should be more tightly coupled to token mechanics, on the basis that they were not contributing to the token economy. The counter-argument was that their entire value was reaching people the token could not — and it was much harder to make without a figure attached.`,
  },

  'on-chain-glory-blockchain-leaderboards-and-rewards-in-dehub-arcade---a-dehub-milestone-from-q1-2022': {
    excerpt:
      'Once a score decides a reward, the score is a financial record. It has to be checkable by the person who came second.',
    content: `In Q1 2022 we put the arcade's leaderboards and rewards on-chain.

### The moment a score stops being a score

A leaderboard in an ordinary game is entertainment. Nobody audits it, because nothing depends on it beyond pride.

The moment a position on that board decides a reward, the leaderboard becomes a financial record maintained by the party paying out. That is a conflict of interest whether or not anyone acts on it, and the player in second place has no way to distinguish an honest board from an adjusted one.

We had already reasoned through this for draws when we built [provably fair randomisation](/guides/fair-play-provably-fair-randomization-in-dehub-games---a-dehub-milestone-from-q4-2021). Rewarded leaderboards are the same problem with a different input.

### What we put on-chain, and what we did not

Being precise matters here, because "on-chain leaderboards" is frequently claimed and rarely means what it sounds like.

Gameplay does not run on a blockchain. It cannot, at any sensible cost or latency, and any project telling you otherwise is describing something else.

What lives on-chain is the part that carries value:

- **The scores that qualify for rewards**, recorded so a standing can be reconstructed independently.
- **The reward rules**, fixed in advance rather than described afterwards.
- **The distribution itself**, executed from those rules rather than by an administrator with a spreadsheet.

The distinction is between the game being on-chain — which is marketing — and the consequences of the game being on-chain, which is the part that actually protects the player.

### The awkward part: anti-cheat

Publishing scores immutably makes cheating permanent rather than preventable. If a bad score lands, it is there.

That forced validation to happen before submission rather than by correcting the board afterwards, which is harder and which we did not get entirely right at first. Some of the earliest arcade tournaments needed manual intervention we would rather not have needed, and the fix was tightening what could be submitted rather than reserving the right to edit what had been.

Retaining an edit key would have been much easier. It would also have quietly destroyed the entire property we were building.

### Why it was worth it

Because it made competitive play possible without asking anyone to trust us. By the time we were running livestreamed tournaments on titles like Street Slayer, the results were checkable by everyone watching, including the people who lost.

The same reasoning carried forward into every rewarded surface DeHub has built since — watch-to-earn, creator revenue share, staking snapshots. If the platform decides that something is owed, the deciding should be inspectable by the person it went against. This quarter is where that stopped being a principle and became infrastructure.

### The cost nobody mentions

Publishing scores permanently means publishing the bad ones too.

Every tournament we have run has a public record including the rounds where something went wrong on our side — a submission accepted that should not have been, a period where validation was weaker than it should have been. Those are visible, permanently, attached to our name.

A private leaderboard would have let us quietly correct all of it and nobody would have known. We would have been a platform with a spotless competitive history and no way for anyone to verify it, which is precisely the position we were trying to get out of.

The permanent record of your own mistakes is not a side effect of verifiability. It is most of what makes it worth anything.`,
  },

  'challenge-accepted-social-features-and-friend-challenges-arrive---a-dehub-milestone-from-q1-2022': {
    excerpt:
      'Friend challenges, built deliberately as a light layer over solo play rather than a competitive mode — because that is what the data said people wanted.',
    content: `Friend challenges arrived in the arcade in Q1 2022, the first genuinely social mechanic DeHub shipped.

### Why this shape

The obvious version of "social gaming" is competitive matchmaking — ranked ladders, live opponents, seasons. We did not build that, and the reason was in the numbers from the arcade's first months.

[Monthly active gamers had passed 5,000](/guides/high-score-dehub-gaming-hits-5000-monthly-active-users---a-dehub-milestone-from-q1-2022), and the overwhelming majority of that was short, casual, solo play. The competitive audience was real but small, and loud in a way that made it look larger than it was in our own community channels.

Building a ranked mode for that audience would have served maybe a tenth of arcade users and made the experience worse for the rest, because competitive systems have a habit of colonising the interface they live in.

A challenge is different. You play the same game you were already playing. Afterwards, you can point it at someone. Nobody has to be online at the same time, nobody is matched against a stranger who plays six hours a day, and if you ignore the whole thing the arcade is unchanged.

### The asynchronous decision

Requiring two people online simultaneously is a much heavier product than it appears. It needs a matchmaking queue, it needs to handle disconnects fairly, and it needs enough concurrent players for the queue to resolve quickly — which at our scale, spread across five titles, it would not have.

Asynchronous challenges have none of those constraints and one significant advantage: they work at any population size. A challenge between two friends is exactly as good with 5,000 users as with 500,000.

### What it did to retention

The effect was smaller than we hoped and more durable than we expected.

It did not produce a step change in usage. What it did produce was a category of session that would not otherwise have existed — people opening the app because somebody had specifically pointed something at them, rather than out of habit or in response to an announcement.

That is a qualitatively different reason to return, and it is the only one in the entire product that does not originate with us.

### The mistake we made

We under-invested in the notification side. A challenge is worthless if the person never learns about it, and for the first few months the loop leaked badly — challenges sent, never seen, quietly expired.

Fixing delivery mattered more than anything we did to the mechanic itself. It is a lesson that came back years later when we built the [messaging system with paid and free DMs](/guides/connect-and-converse-advanced-messaging-system-with-paidfree-dms---a-dehub-milestone-from-q1-2025): the feature is not the message, it is whether the message arrives.

### The through line

The design principle from this quarter has held. Social features on DeHub sit on top of things people already do alone, rather than requiring coordination to be worth anything. It is why the arcade never fragmented into a competitive product and a casual one, and why a challenge sent today works exactly as it did in 2022.

### Why we did not build a ranked ladder later

The question came back roughly annually, usually after a period of strong competitive engagement, and the answer has not changed.

A ranked system does not sit alongside casual play. It restructures the interface around itself, it makes the casual experience feel like the lesser one, and it concentrates attention on a small group of highly engaged players whose behaviour then gets mistaken for the audience.

We watched several platforms do exactly that and lose the players who were quietly generating most of the sessions.

Competitive play on DeHub lives in tournaments instead — scheduled, streamed, [verifiable on-chain](/guides/on-chain-glory-blockchain-leaderboards-and-rewards-in-dehub-arcade---a-dehub-milestone-from-q1-2022), and contained. It serves the same audience without colonising the product.`,
  },

  'powering-play-dehubs-custom-mobile-game-engine---a-dehub-milestone-from-q1-2022': {
    excerpt:
      'Building our own engine is normally the wrong answer. Here is the specific reason it was not, and what it cost us.',
    content: `In Q1 2022 we built a custom game engine optimised for mobile devices.

"We wrote our own engine" is usually a warning sign. Unity and Unreal exist, they are extraordinary pieces of software, and most teams who reject them are solving a problem they invented. So the burden of explanation sits with us.

### The actual constraint

Our games do not run as standalone installs. They run inside the DeHub app, which is [React Native](/guides/building-for-all-app-rebuild-with-react-native---a-dehub-milestone-from-q3-2021), already carrying a video pipeline, a feed, and a wallet stack — on phones that in a large part of our audience are several years old.

That combination is the problem. Embedding a general-purpose engine into an app like that means shipping a large runtime alongside everything already there, paying its startup cost every time somebody taps a game, and fighting it for the graphics context our video player also wants.

For a title you download and launch on its own, none of that matters. For five games that have to open from a tap inside a social app in under a second, all of it does.

### What we optimised for

The engine was built around a short list of properties, none of which are impressive in isolation:

- **Near-instant start.** A game in an arcade competes with scrolling. If it takes five seconds to load, it loses to the feed permanently.
- **Small footprint per title.** Adding a game should add a game, not another runtime.
- **Predictable behaviour on old hardware.** Consistent frame pacing on a four-year-old midrange Android mattered far more to us than what the engine could do on a flagship.
- **Native access to the wallet and account layer** without a bridge between two worlds that each think they own the main loop.

That last one is the piece nobody sees. Arcade titles need to read an identity and write a score that [lands on-chain](/guides/on-chain-glory-blockchain-leaderboards-and-rewards-in-dehub-arcade---a-dehub-milestone-from-q1-2022). Doing that across an engine boundary is a permanent source of friction.

### What it cost

Everything a general engine gives you free, we did not have. No mature editor, no asset pipeline, no third-party plugin ecosystem, no large pool of developers who already know the tooling.

That is a real and continuing tax, and it is the reason this is not general advice. We took it because the alternative was worse for our specific case, not because building an engine is clever.

### Whether it was right

Mostly yes, with one caveat.

The arcade shipped five titles in a quarter and games opened fast enough to compete with the feed, which is the outcome the whole exercise was for. Later titles landed without re-architecture. On old hardware — where a lot of our audience actually is — it behaved.

The caveat is talent. Every developer who works on our games learns a system that exists nowhere else, and that has slowed hiring in a way we underestimated in 2022. If we were choosing again with the same constraints we would probably make the same call, and we would budget for that cost honestly rather than discovering it.

### The test we would apply

The question is not "could we build our own?" — a competent team can build almost anything and that is why the question is useless.

It is: can you name the specific property you need that the off-the-shelf option cannot give you, in one sentence, without using the words flexibility or control?

Ours was that a game had to open from a tap inside a React Native social app, in under a second, on a four-year-old midrange Android, while a video pipeline was already resident. That is a real constraint with a real number in it.

If the answer is vaguer than that, the honest conclusion is that you want to build an engine, which is a different thing from needing one — and considerably more expensive than it looks from the first title.`,
  },

  'crystal-clear-dehub-stream-app-with-4k-support--high-uptime---a-dehub-milestone-from-q2-2022': {
    excerpt:
      '4K streaming at 99.9% uptime. The uptime figure was the difficult one, and it is the one creators actually judged us on.',
    content: `The DeHub stream app shipped in Q2 2022 with 4K support and 99.9% uptime.

Two numbers, and they are not equally hard.

### 4K is table stakes

Supporting 4K is largely a matter of doing the encoding work properly and paying for the bandwidth. It is expensive rather than difficult, and by 2022 a platform that could not do it was not a serious option for creators who had spent money on their setup.

What made it worth doing was less about resolution than about not being the reason somebody's production looked worse than it was. A creator with a good camera, good lighting and a fast connection should not have their work degraded by the platform carrying it. Anything less makes you the amateur option regardless of the rest of the product.

### Uptime is the hard number

99.9% is roughly eight and a half hours of downtime a year. That sounds generous until you consider where those hours land.

Streaming failure is not like a website being slow. A creator who goes live to a scheduled audience and cannot broadcast has lost that audience — not deferred it. The people who showed up have gone elsewhere, and the creator has to spend goodwill explaining a failure that was not theirs. Do it twice and they stop scheduling on your platform.

That asymmetry drove essentially every architectural decision in the stream app. The question was never "how good can this look" but "what happens when a component fails mid-broadcast", which is a much less enjoyable thing to design around and considerably more important.

### What that meant in practice

- **Ingest and playback fail separately.** A problem serving viewers should never terminate the broadcast, because a recoverable viewing problem is survivable and a dropped stream is not.
- **Degrade before dropping.** Falling to a lower bitrate is an inconvenience. Ending the stream is an incident.
- **Redundancy where a single failure would be visible**, which is a different and much shorter list than redundancy everywhere.

### The cost problem underneath

None of this is free, and 4K makes it worse. Streaming economics are brutal in a way that is easy to miss from the outside: the more successful a stream is, the more it costs, and unlike storage those costs do not amortise.

That pressure produced the [advanced video compression work](/guides/efficient-streaming-advanced-video-compression-reduces-costs---a-dehub-milestone-from-q2-2022) in the same quarter, which cut bandwidth costs by around 60% — not a nice-to-have but the thing that made offering 4K at all financially survivable.

### Where it went

The 2022 stream app is the direct ancestor of everything since: [Livepeer integration for 50,000+ concurrent viewers](/guides/scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025), a [custom CDN at sub-200ms globally](/guides/speed-of-light-custom-cdn-achieves-sub-200ms-global-latency---a-dehub-milestone-from-q1-2025), and [99.99% uptime](/guides/reliability-perfected-9999-uptime-for-dehub-streaming---a-dehub-milestone-from-q1-2025) three years later — an extra nine that took considerably more work than the first three.

The standard set here has not moved. A creator's stream failing is our failure, regardless of cause.

### Why "regardless of cause"

Because from the creator's side the distinction does not exist.

A stream that fails because of a provider outage, a bad deploy, a regional network problem or a bug in our code all look identical to the person who scheduled it and to the audience that turned up. Attributing it externally is accurate and completely useless — the creator still lost the session, and still has to explain it.

Adopting that framing has a practical consequence we did not fully anticipate. It rules out a whole category of comfortable engineering decisions, because "the provider was down" stops being an acceptable end state and becomes a design requirement to route around.

That is a large part of why [distributing delivery](/guides/the-future-of-infrastructure-depin-phase-1-goes-live---a-dehub-milestone-from-q4-2024) eventually became a priority rather than a philosophical preference.`,
  },

  'lights-camera-blockchain-dehubs-first-tokenized-documentary---a-dehub-milestone-from-q2-2022': {
    excerpt:
      'A documentary by Luke Barnatt featuring Jorge Masvidal and Brad Pickett — and the first time we tokenised something that already had an audience.',
    content: `In Q2 2022 we produced our first tokenised documentary, directed by Luke Barnatt and featuring Jorge Masvidal, Brad Pickett and others.

### Why a documentary

Because it was real content with an audience that already existed, and because MMA is a sport we know rather than a market we picked.

Most tokenised media in 2022 was an NFT with a video attached — the token was the product and the content was the justification. We wanted the opposite: something people would want to watch if the blockchain part were removed entirely, with names attached that meant something to an audience outside crypto.

Masvidal and Pickett are not crypto figures. Barnatt is a fighter turned filmmaker. None of them needed us to explain what a token was to their audience, and none of that audience arrived because of one.

### What tokenising it actually meant

The useful version of this is not "we minted it". It is that ownership, access and revenue could be expressed on-chain rather than in a contract nobody outside the deal ever sees.

Traditional media rights are private by construction. Who owns what percentage, who gets paid when, and in what order are all buried in agreements between parties, and everyone downstream — including the people who made the thing — takes it on trust.

Putting that structure on-chain makes it inspectable. That is the whole proposition, and it is the same one behind [tokenised uploads with a 90% creator revenue share](/guides/creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023) the following year and, much later, [on-chain tradable subscriptions](/guides/revolutionizing-access-on-chain-tradable-subscriptions-launch---a-dehub-milestone-from-q4-2024).

### What we learned

Three things, one of them uncomfortable.

**Talent does not care about the mechanism.** Every conversation was about audience, distribution and payment terms. Nobody asked how the chain worked, and treating that as a failure of understanding rather than a reasonable prioritisation was our mistake to make once.

**Production is a different business.** Making a film is not a feature release. It has a fixed schedule, non-refundable costs, and no way to ship a smaller version if you run late. That is an unfamiliar shape for a software team and we absorbed it slowly.

**The crypto-native audience was not the audience.** The people most interested in the tokenisation were least interested in the documentary, and the people who wanted to watch it did not care how it was distributed. Bridging those is the actual problem, and it is still the problem.

### Where the thread leads

This is the earliest point in DeHub's history where we were making content rather than infrastructure for content. That line runs directly to [Last Chad Standing](/guides/the-hype-is-real-last-chad-standing-teaser-hits-1m-views---a-dehub-milestone-from-q4-2024) — the MMA-inspired battle royale whose teaser passed a million views in Q4 2024 and whose full trailer was [picked up by major MMA promoters](/guides/main-event-ready-last-chad-standing-full-trailer-gains-mma-promoter-attention---a-dehub-milestone-from-q1-2025).

Same sport, same instinct, considerably more experience. The documentary is where we learned it was possible.

### What we would do differently

Distribute it far more widely, and worry far less about where.

We treated the documentary partly as a demonstration of tokenised media, which meant a lot of thought went into the on-chain structure and comparatively little into simply getting people to watch it. That is the wrong emphasis for a first piece of content, and it is the mistake the [Last Chad Standing teaser](/guides/the-hype-is-real-last-chad-standing-teaser-hits-1m-views---a-dehub-milestone-from-q4-2024) deliberately avoided two years later by not mentioning the chain at all.

The lesson generalises beyond media. When you build something that is both a product and a proof of concept, the proof-of-concept framing will quietly win every prioritisation argument, and the product will underperform for reasons that have nothing to do with its quality.`,
  },

  'the-chads-arrive-genesis-mint-of-the-chads-nft-collection---a-dehub-milestone-from-q2-2022': {
    excerpt:
      'The genesis mint of the Chads. What the collection was for, and what we would not do again.',
    content: `The Chads collection had its genesis mint in Q2 2022.

Writing about a 2022 NFT mint from here requires some honesty about the period. The market was near its peak, mints were the default fundraising mechanism in the industry, and a great many collections launched with a roadmap that was never going to be delivered.

### What the Chads were for

The collection was tied to the DeHub ecosystem rather than sold as a standalone speculative asset. The intent was membership — a persistent identity in an ecosystem that already had an app, an [arcade](/guides/level-up-dehub-arcade-launches-with-5-games--predictions---a-dehub-milestone-from-q1-2022), a [stream product](/guides/crystal-clear-dehub-stream-app-with-4k-support--high-uptime---a-dehub-milestone-from-q2-2022) and a token, rather than a picture with a promise attached.

That is the distinction that mattered then and matters more now. A collection whose entire value proposition is a future roadmap is a fundraise. A collection that plugs into something already running is a membership, and it survives the market losing interest in the category.

### The Chads outlived the mint

The clearest evidence is that the character work did not stay in a collection. It became a property.

[Last Chad Standing](/guides/the-hype-is-real-last-chad-standing-teaser-hits-1m-views---a-dehub-milestone-from-q4-2024) — the MMA-inspired battle royale whose teaser passed a million views in Q4 2024 and whose [full trailer drew attention from major MMA promoters](/guides/main-event-ready-last-chad-standing-full-trailer-gains-mma-promoter-attention---a-dehub-milestone-from-q1-2025) — grew out of this. So did the airdrops attached to it, which by Q2 2025 were running [final snapshots for both holders and stakers](/guides/get-ready-players-final-snapshot-for-last-chad-standing-airdrop---a-dehub-milestone-from-q2-2025).

Very few 2022 collections turned into anything. This one turned into a game with a trailer that professionals in the sport took seriously.

### What we would do differently

Two things, stated plainly.

**We would not tie the mint's framing so closely to a market condition.** Mid-2022 made a lot of things look like durable demand that were actually a cycle. Some of the pacing around the mint reflected the market's expectations rather than ours, and that was avoidable.

**We would set the utility earlier and narrower.** The collection's value ended up being downstream of things we built afterwards, which is fortunate rather than planned. A tighter, smaller commitment stated at mint would have been more honest than a broad one that later worked out.

### The pattern that survived

The general rule we took out of it is the one we have applied to everything since — the [NFT marketplace with royalties](/guides/empowering-creators-dehub-nft-marketplace-with-royalties---a-dehub-milestone-from-q2-2022) that quarter, tokenised uploads the following year, tradable subscriptions in 2024. Tokens should attach to something that already works. Where they have, they have lasted. Where they were the thing itself, they have not.

### On writing about 2022 from here

There is a temptation, four years later, to describe every decision from that period as deliberate positioning against a bubble we could see coming. We could not, and claiming otherwise would be revisionism.

What is true is that the collection was built to connect to an ecosystem that already existed, and that this turned out to matter enormously when the category cooled. Whether that was foresight or a consequence of already having a product to connect it to is a question we would answer honestly as the second one.

The archive is more useful if the reasoning is reported as it was rather than as it would flatter us to remember. Several other entries here record decisions that were simply wrong, and this one records a decision that was right for slightly less impressive reasons than it appears.`,
  },

  'building-bridges-philippine-sec-registration-secured---a-dehub-milestone-from-q2-2022': {
    excerpt:
      'SEC registration in the Philippines for real estate, construction and brokerage. It was necessary, it was slow, and it was not sufficient.',
    content: `In Q2 2022 we secured registration with the Philippine SEC covering real estate, construction and brokerage services.

### Why the Philippines, and why those categories

The registration was not about the token. It covered real estate, construction and brokerage because that was the actual business being contemplated: tokenising real property, starting with land in the Philippines.

You cannot approach that as a software company that happens to be interested in land. Selling, brokering or developing property is a regulated activity carried out by registered entities, and the fact that you intend to represent ownership on a blockchain does not change which regulator is responsible for it.

So the registration came first — before the deals, before any structure, before anything was tokenised.

### What registration is and is not

It is permission to operate in defined categories, subject to ongoing obligations. It is a real, verifiable status that a counterparty can check.

It is not, and we want to be precise here, approval of a tokenisation model. No regulator granted us permission to tokenise anything. The registration established that we could legitimately conduct real estate, construction and brokerage business. Whether a specific tokenised structure was permissible was a separate question, and it was the question we eventually got the answer to.

### What happened next

The following quarter we secured [power of attorney over multiple islands and a sea-front strip in Palawan worth more than $15 million](/guides/ambitious-ventures-the-palawan-real-estate-tokenization-attempt---a-dehub-milestone-from-q3-2022), with the intention of tokenising the sales.

That attempt failed. The Philippine SEC's position on the tokenised structure ended it, and no amount of correctly held registration changed that outcome.

We keep both posts in this archive because the pair is the actual lesson. Registration was necessary — without it there would have been no legitimate route to those assets at all. It was also insufficient, and the gap between those two facts cost us a quarter of work and a serious opportunity.

### What we took from it

**Regulatory groundwork has to be done in the right order and it is slow.** Months of work with legal advisers before anything visible happened. Every subsequent structural decision at DeHub has been made with that lead time assumed rather than discovered.

**Being registered is not the same as being permitted.** The question that matters is not "are we allowed to operate" but "is this specific structure allowed", and the second one has to be asked explicitly and early, of the regulator, in writing.

**Doing it properly still beats not doing it.** [DeLabs LTD was incorporated](/guides/official-standing-delabs-ltd-incorporated---a-dehub-milestone-from-q3-2022) the following quarter, and the pattern held: a real company, real registrations, real obligations. The Palawan venture failed on its merits, in the open, rather than collapsing into a legal problem — which is a meaningfully better way to lose.

### Why this is worth reading if you are building something similar

Tokenised real-world assets come back into fashion roughly every eighteen months, and the pitch is always that the technology has matured enough to make it work now.

The technology was never the constraint. Representing fractional ownership of land on a chain was straightforward in 2022 and is straightforward now. What stopped us was a regulator's position on whether that representation could legitimately be sold, and no advance in the technology addresses that.

If you are contemplating this, the sequence that matters is: identify the regulator, ask the specific structural question in writing, and get the answer before you spend anything on the asset side. We did the registration properly and still got that order wrong, and it cost us a quarter and a $15 million opportunity.`,
  },

  'efficient-streaming-advanced-video-compression-reduces-costs---a-dehub-milestone-from-q2-2022': {
    excerpt:
      'A 60% cut in bandwidth costs. Unglamorous, invisible to users, and the reason the streaming product was viable at all.',
    content: `In Q2 2022 we implemented advanced video compression that reduced bandwidth costs by around 60%.

This is the least interesting-sounding milestone in the archive and one of the most consequential.

### The economics problem

Video platforms have an unusual cost structure: success is expensive. Every additional viewer of every additional stream costs real money in egress, and unlike storage or compute those costs do not flatten out with scale in any way that saves you.

We had just shipped a [stream app with 4K support](/guides/crystal-clear-dehub-stream-app-with-4k-support--high-uptime---a-dehub-milestone-from-q2-2022), which multiplies the problem. High resolution is exactly where bandwidth costs escalate fastest.

Meanwhile the model we were building towards gave creators the overwhelming majority of the revenue — which became [90% of ad revenue on tokenised uploads](/guides/creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023) the following year. If you are keeping a small share of revenue and paying the full delivery cost, your margin is the delivery cost. Compression is not an optimisation in that model. It is the business.

### What 60% actually bought

It changed which decisions were possible.

At the previous cost profile, offering 4K broadly would have meant either capping it, charging for it, or taking a smaller share from creators. All three were on the table. None of them happened, because the delivery got cheap enough that we did not have to choose.

That is the pattern with infrastructure work generally — it rarely produces a feature. It removes a constraint that was about to force a bad product decision, and the evidence it worked is a compromise nobody ever had to see.

### The part users notice

Nothing, ideally. Compression work that users can perceive has failed.

The honest tension is that every codec decision trades bitrate against quality, and the temptation when you are cost-constrained is to take the saving and let the picture soften. We had just told creators their 4K would be delivered properly. Softening it to save money would have been a straightforward breach of that.

So the constraint was one-directional: reduce cost without a visible change at the same source quality. That is a considerably harder brief than "reduce cost", and it is why this took a quarter rather than a sprint.

### Where it led

The same pressure produced the [custom CDN with sub-200ms global latency](/guides/speed-of-light-custom-cdn-achieves-sub-200ms-global-latency---a-dehub-milestone-from-q1-2025) and the [Livepeer integration for 50,000+ concurrent viewers](/guides/scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025) in early 2025. Each is the same question at a larger scale: how do you serve more video, to more people, further away, without the cost curve deciding your product for you.

Three years on, DeHub still runs streaming at a cost profile that lets creators keep the large majority of what they earn. That is not a coincidence, and it starts here.

### Why this kind of work gets deprioritised

Because it competes for time against features, and features are visible.

A quarter spent on compression produces nothing anyone can point at in a release note. A quarter spent on a new surface produces something to announce, something to screenshot, and a measurable spike in engagement. Every incentive inside a company favours the second.

The reason we did the first is that we had already committed to the revenue share, which converted an invisible engineering problem into an existential commercial one. The constraint forced the priority.

That is generally how infrastructure work gets funded honestly: not by arguing it is important, which everyone agrees with and nobody schedules, but by making a promise elsewhere that cannot be kept without it.`,
  },

  'empowering-creators-dehub-nft-marketplace-with-royalties---a-dehub-milestone-from-q2-2022': {
    excerpt:
      'A marketplace where royalties are enforced by the contract rather than requested by the marketplace. In 2022 that distinction was about to matter enormously.',
    content: `In Q2 2022 we launched an NFT marketplace with a royalty distribution system.

### The royalty problem, as of 2022

Creator royalties in that era were mostly a convention. A collection declared a royalty percentage, marketplaces honoured it, and everyone described it as though it were a property of the asset.

It was not. It was a policy of whichever venue the trade happened on. Within about a year, that convention collapsed — marketplaces competing on fees made royalties optional and then default-off, and a large number of creators discovered that their long-term income had been a courtesy all along.

### What we built instead

Our marketplace distributed royalties as part of the transaction rather than as a service the marketplace performed. The distinction sounds academic and is the entire thing.

If the venue processes the royalty, the royalty exists at the venue's discretion. If the transfer itself carries the distribution, it happens because the transaction happened.

That approach constrains you. It means a narrower set of designs, more work per sale, and less flexibility to add whatever trading feature is fashionable that quarter. We took the constraint because the alternative was building the same fragile arrangement everyone else had.

### Royalties as a business model, not a bonus

The wider point is that this was consistent with everything else we were building. The [tokenised documentary](/guides/lights-camera-blockchain-dehubs-first-tokenized-documentary---a-dehub-milestone-from-q2-2022) that quarter, [tokenised uploads with a 90% ad revenue share](/guides/creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023) the following year, [tradable subscriptions](/guides/revolutionizing-access-on-chain-tradable-subscriptions-launch---a-dehub-milestone-from-q4-2024) in 2024 — all of them rest on the same claim.

The claim is that a creator's economics should be a property of the thing they made, enforced by the chain, not a term in an agreement with a platform that can revise it. Every platform in the traditional creator economy has revised those terms, usually downward, usually with notice measured in weeks.

If that claim is true, royalty enforcement cannot be a marketplace feature. It has to be structural, and it has to survive us.

### What we would revisit

The marketplace itself was narrower than it should have been. It was built primarily for assets originating inside DeHub, which made it coherent but limited its reach, and by the time the broader NFT market cooled we had a well-built venue for a category that had lost most of its participants.

The royalty mechanism was the durable part. The marketplace around it was a product of its moment.

### Why it still matters

Because the argument was settled in public shortly afterwards, and not in favour of the people who had assumed goodwill. Creators who relied on marketplace-honoured royalties in 2022 mostly do not receive them now.

We would rather have built the constrained version and been right about why.

### The uncomfortable qualifier

Enforcement is only as strong as the venue's willingness to route through the mechanism.

Nothing we built prevents an asset from being traded somewhere that ignores the distribution entirely — that is the nature of transferable tokens, and any project claiming otherwise is describing a restriction that would break the asset in other ways.

What structural enforcement gives you is that the honest path is the default path, and that circumventing it requires deliberate effort rather than merely using a different website.

That is a weaker claim than "royalties cannot be avoided" and it is the true one. We would rather state the limit than let people discover it, which is roughly what the wider market did to creators in 2023.`,
  },

  'dream-big-the-1m-home-crypto-raffle-by-dehub---a-dehub-milestone-from-q3-2022': {
    excerpt:
      'A $1,000,000 house, 15,000+ participants, and a raffle that did not hit its minimum. Everyone was refunded and the NFT kept its place in the app.',
    content: `In Q3 2022 we acquired a $1,000,000 home for what was, at the time, the largest crypto raffle ever run. More than 15,000 people participated.

It did not sell out, and this post exists to say so clearly.

### What we were actually testing

The prize was a house. The point was the machinery.

By this stage we had spent nearly a year building [provably fair randomisation](/guides/fair-play-provably-fair-randomization-in-dehub-games---a-dehub-milestone-from-q4-2021) and [on-chain verified raffle mechanics](/guides/trust-and-transparency-on-chain-verified-raffle-mechanics---a-dehub-milestone-from-q3-2022). A raffle with a games prize and a raffle with a million-pound property are the same code and the same trust problem — only the consequences of getting it wrong differ.

Running it at that value was the real test. At £5, nobody scrutinises the draw. At a million, everybody does, and rightly.

### What went wrong

Sales did not reach the required minimum.

That threshold existed for a reason: below it, the raffle cannot fairly be drawn, because the prize is worth more than the pot and completing the draw would mean funding it from somewhere other than the entries. Setting a minimum and honouring it is the difference between a raffle and a promise.

![DeHub card reading "refunded in full" — the $1m house raffle missed its published minimum](/lovable-uploads/inbody-raffle-minimum.jpg)

### What we did about it

Every purchase was refunded.

The minted NFTs retained their value and were incorporated into the app, so participants were not left with a dead asset from a cancelled event. Nobody was asked to absorb a shortfall that was ours to absorb.

That was expensive. We had acquired the property, run the campaign, and carried the costs of both, and the outcome was a full refund. The alternative — drawing anyway, or quietly leaving refunds to whoever chased them hardest — would have been cheaper and would have permanently ended our ability to run anything like it again.

The same reasoning had produced the [automatic 1:1 airdrop](/guides/rewarding-loyalty-automatic-airdrop-for-all-holders---a-dehub-milestone-from-q3-2021) after the v1 issue the previous year, and it is the same reasoning we applied later to the [v2 relaunch](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022). When our thing does not work, the people who backed it do not pay for it.

### What we misjudged

The demand, straightforwardly. Fifteen thousand participants is a great many people and it was not enough, which means the entry economics were wrong for the market as it stood in late 2022 — a market that had turned sharply against exactly this kind of discretionary spend.

We also underestimated how much of a raffle's difficulty is not the draw. Acquiring a property, holding it, structuring the offer across jurisdictions and handling refunds at scale is most of the work, and none of it is the part we had spent a year making verifiable.

### What came after

Smaller raffles — toys, memberships, holidays — became the sensible format, sized so the minimum is reachable rather than aspirational. The verification machinery carried over unchanged, which was the point of building it properly at small stakes in the first place.

### Why we still think it was worth attempting

Because the alternative was never attempting anything at that scale, and a project that only runs things it is certain will succeed is not doing anything interesting.

The failure was in the sizing, which is a genuine and correctable error. It was not in the mechanics, the verification, the fairness of the process or the treatment of participants — every one of those held up under the maximum pressure we could have put on them.

We would rather record a failed attempt at the largest crypto raffle ever run, handled properly, than a series of safe successes. The thing that would have been unforgivable is a shortfall handled quietly, and that is the version this post exists to rule out.`,
  },

  'ambitious-ventures-the-palawan-real-estate-tokenization-attempt---a-dehub-milestone-from-q3-2022': {
    excerpt:
      'Power of attorney over islands and a sea-front strip worth $15m+, and a plan to tokenise the sales. The Philippine SEC ended it.',
    content: `In Q3 2022 we secured power of attorney over multiple islands and a sea-front strip in Palawan, together worth more than $15 million, intending to tokenise the sales.

It failed. The regulatory position taken by the Philippine SEC ended the structure, and we did not proceed.

### What we had

Power of attorney over the assets — the legal authority to act in relation to them. That is a real position, not a letter of intent, and it took months of work with local partners to reach.

It sat on top of groundwork already done. We had [secured SEC registration for real estate, construction and brokerage services](/guides/building-bridges-philippine-sec-registration-secured---a-dehub-milestone-from-q2-2022) the previous quarter, and had [established partnerships with real estate and legal firms](/guides/strategic-alliances-partnering-with-real-estate-and-legal-experts---a-dehub-milestone-from-q3-2022) in the same one. This was not a crypto company wandering into property. It was a registered entity with advisers and standing.

### What we were trying to do

Fractionalise ownership of high-value land so that participation did not require the capital to buy an island.

The reasoning is the same one behind everything else in this archive. A $15 million asset is available to people who have $15 million. Represented on-chain and divided, it is available to people who have considerably less, with ownership and transfer that are inspectable rather than buried in a private register.

### Why it did not happen

The Philippine SEC's position on tokenised real estate sales.

Being accurate about this matters: our registration was legitimate and remained so. What we did not have — and could not obtain — was regulatory acceptance of the specific tokenised structure. Those are different things, and the gap between them is where this venture died.

We stopped rather than pushing. Land, in a jurisdiction where the regulator has stated a position, is not a place to find out how much interpretation you can get away with.

![DeHub card reading "ask the regulator" — registration is not the same as permission](/lovable-uploads/inbody-palawan.jpg)

### What it cost, and what we kept

A quarter of work, the cost of the legal and partnership groundwork, and a genuinely large opportunity.

What we kept was the lesson, which arrived early enough to matter. Ask the specific question — is this structure permitted — of the regulator, in writing, before building on the assumption. Registration answers "may we operate". It does not answer "may we do this".

It also permanently changed how we assess ventures outside software. The instinct in 2022 was that a registered entity with good advisers could work out the details as it went. That is true in software and false in regulated asset classes, where the details are the thing.

### Why it is published

Because it was a real attempt at a real scale and it did not work. An archive that records the raffle, the listings and the launches but quietly omits a failed $15 million venture is a marketing timeline, not a history.

The next quarter brought [a contract malfunction that froze the token and forced a full v2 relaunch](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022). Late 2022 was not a good period. It is all here.

### What it changed about how we choose work

DeHub has not attempted a venture outside software since, and that is deliberate rather than incidental.

The Palawan attempt was not reckless. It had [registration](/guides/building-bridges-philippine-sec-registration-secured---a-dehub-milestone-from-q2-2022), [advisers](/guides/strategic-alliances-partnering-with-real-estate-and-legal-experts---a-dehub-milestone-from-q3-2022), real legal standing and a genuine asset. It still failed, because in regulated asset classes the details are not implementation — they are the whole question, and they are decided by someone who does not have to explain themselves to you.

Everything since has stayed in domains where we can iterate: streaming, games, creator tooling, payments. Those have their own regulators and their own constraints, and the difference is that being wrong produces a fix rather than an ending.`,
  },

  'strategic-alliances-partnering-with-real-estate-and-legal-experts---a-dehub-milestone-from-q3-2022': {
    excerpt:
      'The advisers behind the property venture. They did not save it — but they are the reason it ended cleanly rather than badly.',
    content: `In Q3 2022 we established partnerships with real estate and legal firms to support the property work we were undertaking in the Philippines.

### Why we needed them

Because we are a software company, and property is not software.

At that point DeHub had [registration with the Philippine SEC for real estate, construction and brokerage](/guides/building-bridges-philippine-sec-registration-secured---a-dehub-milestone-from-q2-2022) and was moving towards [power of attorney over land in Palawan worth more than $15 million](/guides/ambitious-ventures-the-palawan-real-estate-tokenization-attempt---a-dehub-milestone-from-q3-2022). Neither of those is a domain where competence transfers from building apps.

Land title, ownership history, transfer restrictions, foreign ownership rules, local practice — every one of those is specialist knowledge where being wrong is not recoverable by shipping a fix. You cannot iterate your way out of a defective title.

### What the partnerships were for

Three things, none of them advisory in the vague sense.

**Verification.** Confirming that assets were what they were represented to be, and that the parties offering rights over them had the standing to do so. This is the single most common failure point in cross-border property and it is not detectable from the outside.

**Structure.** Determining how a tokenised sale could legitimately be organised — which entity holds what, how proceeds move, what obligations attach where.

**Reading the regulator.** Interpreting the Philippine SEC's position as it developed, which turned out to be the decisive one.

### They did not save the venture

The tokenisation attempt failed. The SEC's position on the structure ended it and no adviser changed that.

It is worth being direct about what advisers buy you, because it is frequently oversold. They do not make a bad idea legal. They tell you which ideas are bad, at what cost you can find out, and when the answer has arrived.

### What they did do

They meant we found out before, rather than after.

The Palawan venture ended as a project we stopped. It did not end as an enforcement action, an unwind, or a set of obligations to people who had bought into a structure that could not be delivered. Given how ambitious that attempt was and how badly it could have gone, ending cleanly is a materially different outcome from ending in the other direction.

The same instinct produced [DeLabs LTD](/guides/official-standing-delabs-ltd-incorporated---a-dehub-milestone-from-q3-2022) in the same quarter — a properly incorporated entity with a real structure and real compliance obligations, rather than the loose arrangements a lot of projects were still operating under in 2022.

### The general rule

Buy expertise before you need it, in domains where mistakes cannot be patched. Software has forgiving failure modes: you ship, you break something, you fix it in an hour. Regulated asset classes do not work that way, and the cost of learning that empirically is not something you can absorb twice.

We paid for advisers on a venture that did not proceed. That is the correct outcome for that spending, not a waste of it.

### How to tell a good adviser from an expensive one

The distinction we learned to apply is whether they tell you things you do not want to hear, early, without being asked twice.

An adviser who confirms your plan is either agreeing because it is sound or agreeing because that is what the engagement rewards, and from the client's side those look identical until it is too late to matter. The useful ones raised objections we found irritating at the time, and several of those objections turned out to be the shape of the problem that eventually ended the venture.

The other test is whether they will put a position in writing. Verbal reassurance is free and unfalsifiable. A written opinion is a professional commitment, and the reluctance to give one is itself the answer.`,
  },

  'trust-and-transparency-on-chain-verified-raffle-mechanics---a-dehub-milestone-from-q3-2022': {
    excerpt:
      'The verification layer built for a $1,000,000 raffle — including the part that proved the draw could not be run.',
    content: `In Q3 2022 we shipped on-chain verified raffle mechanics, in the same quarter we ran a [$1,000,000 house raffle](/guides/dream-big-the-1m-home-crypto-raffle-by-dehub---a-dehub-milestone-from-q3-2022) with more than 15,000 participants.

### The scale changed the requirement

We had built [provably fair randomisation](/guides/fair-play-provably-fair-randomization-in-dehub-games---a-dehub-milestone-from-q4-2021) for the arcade the previous year. The principle was already settled: rules published first, randomness we cannot re-roll, results checkable afterwards by someone who assumes we are lying.

What changed at a million pounds was the surrounding surface. In a small game raffle the only contested question is who won. In a large one, every step is contested — who was eligible, when entries closed, whether the count is right, whether the minimum was met, whether the entry you bought was recorded at all.

Provable randomness answers one of those. On-chain verified mechanics answer the rest.

### What went on-chain

- **Entry records**, so the participant list is reconstructable by anyone rather than asserted by us.
- **The eligibility and closing rules**, fixed before entries opened.
- **The threshold conditions**, including the minimum sales required for the draw to proceed.
- **The draw itself**, executed from those inputs.

The third item is the one that mattered most, and not in the way we expected.

### The part that proved itself by failing

The house raffle did not reach its minimum. It was not drawn, and every purchase was refunded.

Because the minimum was a published, on-chain condition rather than a line in the terms, there was nothing to argue about. The threshold was visible, the sales were visible, and the conclusion followed mechanically. Nobody had to take our word for the fact that we were not simply choosing not to draw.

That is a strange thing to describe as a success and it genuinely was one. A verification system that only works when the outcome is good is not a verification system. Ours produced an unwelcome answer, publicly, and held.

### What it was not

It was not a solution to the parts that are not on-chain. Acquiring a property, holding it, structuring an offer across jurisdictions, processing thousands of refunds — none of that is verifiable by a contract, and all of it is where most of the actual work and most of the actual risk sat.

We have been careful since about which claims we attach to on-chain verification. "The draw is verifiable" is true. "The raffle is trustless" would not have been.

### Where it went

Later raffles were sized so the minimum was reachable rather than aspirational — smaller prizes, festive formats, memberships and holidays. The mechanics carried over unchanged.

The same standard now applies anywhere DeHub decides something with value attached: [leaderboards](/guides/on-chain-glory-blockchain-leaderboards-and-rewards-in-dehub-arcade---a-dehub-milestone-from-q1-2022), airdrop snapshots, creator revenue. If we decide it, you should be able to check it.

### The design rule that came out of it

Publish the condition that lets someone conclude you are in the wrong.

Most transparency in this industry publishes the conditions under which the project is in the right — the successes, the completions, the metrics that went up. That is not verification, it is reporting with a favourable selection.

The house raffle's minimum was useful precisely because it was a condition we could visibly fail, and did. A threshold that can only ever be met is decoration.

Applied generally: if a published rule has no realistic path to embarrassing you, it is not doing the job. Every verification mechanism DeHub has shipped since is assessed against that, including [dhbscan.com](/guides/transparency-hub-dhbscancom-launches-for-contract-activity-tracking---a-dehub-milestone-from-q2-2025), which shows contract activity without filtering it to the flattering parts.`,
  },

  'the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022': {
    excerpt:
      'The contract\'s tax triggers malfunctioned and froze both the token and our liquidity pool. There was no fix short of relaunching.',
    content: `In Q4 2022 the tax triggers in our contract malfunctioned. The token froze. The liquidity pool froze with it. We were forced to relaunch as v2.

This is the most serious technical failure in DeHub's history and it deserves a straight account.

### What happened

The contract carried tax logic in the transfer path — the standard design for the period, where a percentage of each transaction is diverted to liquidity, marketing or holders.

Those triggers malfunctioned under real conditions. The result was not a degraded experience. The token could not move, and because the pool depends on transfers, the liquidity locked with it. Holders could not trade. We could not fix it from outside, because the behaviour was in the deployed contract's own logic.

There was no patch. Immutability is the property you want right up until the moment the thing that is immutable is broken.

### Why an audit did not prevent it

We had commissioned a [full Certik audit](/guides/fortifying-our-walls-v1-security-hardened-with-certik-audit---a-dehub-milestone-from-q3-2021) the previous year and taken security seriously since the v1 vulnerability.

This was not an exploit. Nobody attacked us. The contract did what it was written to do, under a combination of conditions that had not been modelled. Audits look hard at whether code can be abused. They are much weaker at whether a design behaves sensibly at the edges of its own assumptions, and that is where this lived.

It is the clearest illustration we have of the limits of an audit, which is why we have never used the word as a guarantee since.

### What we did

Relaunched. There was no smaller option.

That meant a new contract and [migrating more than 25,000 holders](/guides/moving-forward-successful-migration-of-25000-holders-to-v2---a-dehub-milestone-from-q4-2022) onto it — an enormous operational undertaking carried out under exactly the circumstances in which you have least credibility.

It also meant deciding what the new contract should be, and we [went to plain standard ERC-20 tokenomics](/guides/stability-first-adopting-standard-erc20-tokenomics---a-dehub-milestone-from-q4-2022) with nothing clever in the transfer path at all. No tax triggers. No conditional logic between a holder and their own tokens.

![DeHub card reading "no admin key" — an immutable contract cannot be patched after it fails](/lovable-uploads/inbody-contract-freeze.jpg)

### What we actually learned

**Complexity in the transfer path is the risk.** Every clever tokenomic mechanism is code that runs on every transaction forever, in market conditions nobody has seen yet. The cleverness has to earn its place against that.

**Immutable means immutable.** Design for the case where you cannot intervene, because that is the case you will get.

**The community carries the cost of your design decisions.** Holders could not access their own positions through no fault of their own. Whatever the technical explanation, that is what happened, and it is the frame we have kept.

### Afterwards

V2 shipped, holders migrated, and [trading resumed on Gate.io in Q1 2023](/guides/back-in-action-dehub-v2-trading-resumes-on-gateio---a-dehub-milestone-from-q1-2023). The simplified contract has run without incident since.

Late 2022 was the worst stretch DeHub has had — this, immediately after the [Palawan venture collapsed](/guides/ambitious-ventures-the-palawan-real-estate-tokenization-attempt---a-dehub-milestone-from-q3-2022) and a [$1m raffle missed its minimum](/guides/dream-big-the-1m-home-crypto-raffle-by-dehub---a-dehub-milestone-from-q3-2022). All three are in this archive at full length.

### For anyone designing tokenomics now

The specific advice we would give, having paid for it:

Anything in the transfer path must be justified against the worst case, not the intended one. Ask what this code does at 100x the volume you expect, at 1% of it, during a liquidity event, and when a integrating contract behaves in a way you did not anticipate. If you cannot answer all four, it does not belong there.

And assume you will never be able to change it. The mental exercise that would have saved us is straightforward: write down what you would do if this contract started behaving badly tomorrow and you had no admin key. If the honest answer is "relaunch and migrate everyone", you have already accepted that outcome — you just have not scheduled it yet.`,
  },

  'moving-forward-successful-migration-of-25000-holders-to-v2---a-dehub-milestone-from-q4-2022': {
    excerpt:
      'Moving 25,000+ holders onto a new contract, after a failure that was ours, at the point where we had the least credibility to ask anything of them.',
    content: `Following the contract malfunction, we migrated more than 25,000 token holders to the v2 contract in Q4 2022.

### The position we were in

Worth stating honestly. The [tax triggers had malfunctioned](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022), the token and the liquidity pool were frozen, and holders could not access positions they legitimately owned.

The fix required them to act — to move to a new contract — at the exact moment their reason to trust our instructions was weakest. That is the hardest possible context in which to run an operation of this size, and there was no version where we did not have to.

### What made it work

**We had done it right once before.** After the [v1 vulnerability](/guides/rewarding-loyalty-automatic-airdrop-for-all-holders---a-dehub-milestone-from-q3-2021), every holder was made whole 1:1, automatically, with no claim page and no deadline. That precedent was worth more in Q4 2022 than any communication we could have written, because the community had a prior example of how we behave when we break something.

**The snapshot was published.** Balances taken at a stated block, available for anyone to check their own figure against. Migration disputes are almost always disputes about the record, and a public record removes the argument.

**No deadline that could strand anyone.** Migration windows with hard cut-offs quietly transfer the cost of your failure onto whoever was on holiday. We were not willing to do that on an incident we caused.

**One route, stated plainly.** During a token incident, every additional path is an opportunity for someone to be phished. We kept it to a single documented process and repeated it rather than diversifying it.

![DeHub card reading "25,000 decisions" — every holder had to act during the v2 migration](/lovable-uploads/inbody-migration-25k.jpg)

### The scam problem

This is worth its own paragraph, because it is the part people underestimate.

A publicised migration is an ideal environment for fraud. Holders are expecting to be told to take an unusual action involving their wallet, which is exactly the state attackers need. Every migration of this size attracts impersonators within hours.

Countermeasures were not technical. They were repetition, a single official route, and being extremely boring about it — the same instructions, the same places, no urgency language, no limited windows, nothing that would make a fake announcement blend in.

### What it cost

Distribution and support at that scale is expensive and it was carried by us, which is the only defensible arrangement when the cause was our contract.

The slower cost was trust. A migration is a demand on people's attention and goodwill made at the worst possible moment, and some of it does not come back regardless of how well it is run.

### Afterwards

V2 ran on [plain standard ERC-20 tokenomics](/guides/stability-first-adopting-standard-erc20-tokenomics---a-dehub-milestone-from-q4-2022) with nothing in the transfer path, and [trading resumed on Gate.io](/guides/back-in-action-dehub-v2-trading-resumes-on-gateio---a-dehub-milestone-from-q1-2023) the following quarter.

Twenty-five thousand holders is the number we report. What it actually represents is 25,000 individual decisions to follow instructions from a project that had just failed them.

### What we would tell anyone facing the same

Do not compress the timeline to look decisive.

The instinct under this kind of pressure is to move fast, because speed reads as competence and every day of a frozen token is a day of visible failure. Speed is also what produces missed edge cases, ambiguous instructions and holders left behind — and unlike the original incident, those failures are ones you chose.

Publish the snapshot before you publish the process, so people can verify their own position before they are asked to act on anything. Say plainly that there is no deadline, and mean it. And accept that the communication load is not a distraction from the technical work, it is the larger half of the job.

We got most of that right, and we got it right because [the v1 airdrop the previous year](/guides/rewarding-loyalty-automatic-airdrop-for-all-holders---a-dehub-milestone-from-q3-2021) had already taught us the shape of it at a tenth of the scale.`,
  },

  'stability-first-adopting-standard-erc20-tokenomics---a-dehub-milestone-from-q4-2022': {
    excerpt:
      'No tax triggers, no reflections, nothing in the transfer path. The boring choice, made immediately after the interesting one broke.',
    content: `When we relaunched as v2 in Q4 2022, we moved to plain standard ERC-20 tokenomics. No transaction tax. No reflections. No conditional logic sitting between a holder and their own tokens.

### Why the previous design existed

It is easy to be dismissive with hindsight, so some context. In 2021 and 2022, tax-based tokenomics were close to standard. A percentage of each transaction diverted to liquidity, to marketing, or redistributed to holders. Projects that did not do it were the unusual ones.

The arguments were coherent: automatic liquidity growth, funded operations without selling treasury, a mechanic that rewarded holding. Plenty of people, including us, found them convincing.

### Why we abandoned it

Because [ours malfunctioned and froze the token and the liquidity pool together](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022), and there was no way to intervene.

The failure clarified something the arguments had obscured. Tax logic runs in the transfer path. It executes on every transaction, forever, immutably, under market conditions nobody has modelled — including conditions that will not exist for years. It is the highest-risk place in the entire system, and it is where the cleverness had been put.

Standard ERC-20 is unexciting. It is also code that has been examined by more people, across more chains, in more conditions, than any bespoke design will ever be. When it fails, it fails in documented ways.

### What we gave up

Genuine things, and we should not pretend otherwise:

- **Automatic liquidity growth.** Now handled deliberately, which became the [automated liquidity provision strategies](/guides/smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023) of late 2023 — outside the contract, adjustable, and unable to freeze anyone's tokens.
- **Passive operational funding.** Replaced by explicit treasury management, which is more visible and harder to obscure. That fed directly into the [DEX policy](/guides/open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023) and [transparency reports](/guides/full-disclosure-dehubs-comprehensive-transparency-reports---a-dehub-milestone-from-q4-2023) published that year.
- **A holding incentive.** Replaced by utility — staking, airdrops, and access — which is slower to build and does not evaporate when volume does.

![DeHub card reading "nothing in the path" — v2 moved to plain standard ERC-20 tokenomics](/lovable-uploads/inbody-plain-erc20.jpg)

### What we gained

Compatibility, mainly, and the freedom that comes with it.

A standard token works everywhere without exception handling. Exchanges list it without special cases. Bridges carry it. Aggregators price it correctly. Every non-standard transfer behaviour is a compatibility problem waiting for the integration you have not done yet.

When DHB later [listed on Ethereum mainnet](/guides/expanding-reach-dhb-lists-on-ethereum-mainnet---a-dehub-milestone-from-q1-2024) and [sDHB listed on Base](/guides/layer-2-expansion-sdhb-lists-on-base---a-dehub-milestone-from-q2-2024), none of that required contract-specific accommodation. That is the dividend of boring.

### The general position

Put the interesting parts of a system where they can be changed. A contract that holds people's assets is the worst place in the stack to be clever, because the cost of being wrong there is borne by everyone except the person who was clever.

Three years on, the transfer path has done nothing except move tokens. That is the whole review.

### The argument we still hear

That standard ERC-20 gives a project no mechanism to fund itself or reward holding, and that this is why tax tokenomics existed.

It is a fair objection and the answer is that those needs did not disappear, they moved somewhere they can be observed and corrected. Treasury operations are explicit and disclosed under a [published DEX policy](/guides/open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023). Liquidity growth runs as an [external, adjustable strategy](/guides/smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023). Holding is rewarded through staking and airdrops that people can choose to participate in.

All of that is more work than a percentage in a transfer function. It is also visible, reversible and incapable of freezing anyone's assets, which are three properties the elegant version did not have when it mattered.`,
  },
};
