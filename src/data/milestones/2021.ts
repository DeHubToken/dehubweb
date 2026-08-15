import { MilestoneContentMap } from './types';

export const milestones2021: MilestoneContentMap = {
  'early-traction-dehubs-beta-app-hits-2000-daus---a-dehub-milestone-from-q1-2021': {
    excerpt:
      '500 testers, 2,000 people opening the app every day, and no token yet. The order we did that in explains most of what came after.',
    content: `Most projects in this industry launch a token, promise an app, and hope the second part arrives before the attention runs out. We went the other way round.

By the end of Q1 2021, the first DeHub beta was live on the App Store. Around 500 people had it installed as testers, and roughly 2,000 were opening it every day. There was no token. There was nothing to buy, no chart to check, and no reason to be there except that the app did something you wanted to do.

### Why we shipped before the token

Building an audience around a product is slow. Building one around a ticker is fast, and almost entirely fake — the users are holders, the engagement is price, and the moment the chart turns the room empties out. We had watched that happen to enough projects by early 2021 to know we did not want to inherit it.

Launching the app first gave us a group of people who were there for the thing itself. When the token did arrive, they were already using it. That is a very different starting position from a community that formed around a presale.

### What 2,000 daily actives actually told us

Two thousand is not a large number. What made it useful was the ratio: from 500 testers, daily usage in the low thousands meant people were coming back, sharing access, and bringing others in. Retention at that scale is a much better early signal than downloads, because there is no marketing spend inflating it.

It also gave us real failure data. A pre-token beta is the cheapest possible place to find out that your onboarding is too long, that people cannot find the feature you built the whole release around, or that a screen everyone loved in review is one nobody opens. Every one of those is expensive to discover after a listing, when the same problem arrives attached to a price chart.

### What it set up

Three things followed directly from this quarter:

- The [50-plus user interviews](/guides/listening-to-our-users-50-interviews-shape-dehub---a-dehub-milestone-from-q1-2021) we ran alongside the beta, which is where the actual roadmap came from.
- A community that voted on the token's chain, price, market cap and supply before any of it existed, because they had standing to.
- The decision to rebuild the app properly in React Native later that year, which we would not have committed to without knowing people would use what we built.

The beta itself is long retired. Almost nothing in it survives in the app today. What survived is the sequencing: build the thing, get people using it, and let the token serve the product rather than stand in for it. Every DeHub release since has followed that order, and the times we have been slowest to ship have almost always been the times we refused to break it.

### The part we would change

We should have written down what the beta taught us far more carefully than we did. A great deal of what those first users showed us existed only as shared understanding inside a team of a handful of people, and by the time we had [grown to fifteen across three time zones](/guides/global-reach-dehub-team-grows-to-15-strong---a-dehub-milestone-from-q3-2021) later that year, a meaningful amount of it had quietly evaporated.

Some of the same findings had to be rediscovered in 2024, at considerably greater expense, when a [major upgrade drew its sharpest criticism](/guides/leveling-up-major-app-upgrade-earns-95-positive-feedback---a-dehub-milestone-from-q3-2024) on exactly the onboarding problems the 2021 beta had already surfaced. Institutional memory is not a nice-to-have. It is the difference between learning something once and paying for it repeatedly.`,
  },

  'listening-to-our-users-50-interviews-shape-dehub---a-dehub-milestone-from-q1-2021': {
    excerpt:
      'We sat down with more than 50 users one at a time. Several features we were certain about did not survive the conversations.',
    content: `Alongside the first beta, we ran more than 50 one-to-one user interviews. Not a survey, not a Discord poll — actual calls, one person at a time, mostly with people who had the app installed and were already using it.

It is a slow way to gather information and it does not scale. It was also the single most useful thing we did that quarter.

### Why not a survey

Surveys tell you what people are willing to say about themselves in ninety seconds. They are very good at confirming what you already believe, because you wrote the questions.

An interview is harder to steer. You ask someone to open the app and show you what they normally do, and within a minute you are watching them skip past the thing you spent six weeks on. You cannot argue with that, and you cannot design a survey question that would have surfaced it.

### What came out of them

A few patterns showed up often enough that we stopped treating them as opinions:

- **Wallet setup was the wall.** Not the app, not the concept — the wallet. People who understood exactly what we were offering still gave up during setup. That finding has outlived every other part of the 2021 product and still drives how onboarding works today.
- **"Earning" needed to be legible.** Users did not want a yield they had to model. They wanted to know what an action was worth before they took it. Anything that required a spreadsheet was treated as a trick.
- **Nobody asked for more tokenomics.** Not one interview produced a request for a more complex token. Several produced requests for a simpler one.

### What we got wrong

The interviews also killed things. We went in confident about a set of social mechanics that tested badly enough that we cut them rather than ship them — people understood them and simply did not want them. That is a cheap lesson at fifty interviews and an expensive one at fifty thousand users.

We also learned that our own enthusiasm was not evidence. Several features survived internal debate purely because everyone on the team liked them, and the interviews were the first outside pressure they had ever faced.

### Why we still do it

The format has changed since — ambassador calls, creator sessions, direct messages that get read properly rather than triaged — but the principle has not. Talking to a small number of real users carefully beats talking to a large number of them shallowly, and it beats talking to none of them entirely, which is the default in this industry.

Product-market fit is not a milestone you clear once. It is a thing you keep checking, and the checking only works if you are willing to hear that you were wrong.

### Why the findings kept coming back

The uncomfortable postscript is that the biggest thing these interviews surfaced — wallet setup as the point where people give up — was still the most common complaint about DeHub three years later, when a [major app upgrade in 2024](/guides/leveling-up-major-app-upgrade-earns-95-positive-feedback---a-dehub-milestone-from-q3-2024) drew almost all of its criticism on that exact issue.

That is not a failure of the research. The research was right in Q1 2021 and right in Q3 2024. It is a reminder that identifying a problem and solving it are separated by a great deal of work, and that a finding you agree with is very easy to acknowledge and postpone.

We now treat any complaint that survives a full rebuild as structural rather than as a backlog item.`,
  },

  'diving-in-first-dehub-liquidity-pools-on-pancake-swap---a-dehub-milestone-from-q2-2021': {
    excerpt:
      'The community had already voted on the chain, the price, the supply and the market cap. PancakeSwap is where those decisions became real.',
    content: `Our first liquidity pools went live on PancakeSwap in Q2 2021. It was the first time DHB could be bought or sold by anyone, and the first time the decisions the community had made actually cost something.

### The vote came first

Before any of this, the token's fundamentals were put to a vote in our Telegram group. Not a signalling vote — the binding kind. The community chose the chain we would build on, the initial listing price, the starting market cap and the total supply.

That is an unusual amount of control to hand over, and it constrained us in ways we felt for years afterwards. It also meant that when the pool opened, nobody on the outside was being introduced to terms decided in a room they were not in.

### Why PancakeSwap

BNB Chain was the community's call, and PancakeSwap was where the liquidity on that chain actually was in mid-2021. There was no serious alternative if the goal was for an ordinary holder to be able to trade without a centralised account, a KYC queue, or a gas fee larger than their position.

That last point mattered more than anything technical. A large part of our early community could not have participated on Ethereum mainnet at the fees of the time. Choosing a chain is partly a choice about who is allowed in.

### What a first pool actually is

A liquidity pool is not a listing. Nobody approves it, nobody schedules it, and there is no announcement from an exchange. You provide both sides of a pair, the pool exists, and from that moment the price is whatever the market says it is.

The parts that are easy to underestimate:

- **Depth is the whole experience.** A thin pool means every trade moves the price against the person making it. Early depth is what stops a project's chart from being noise.
- **It is permanent and public.** Every add, every removal, every trade is on-chain and attributable. That is the point, and it is also the pressure.
- **There is no support desk.** If something goes wrong, it is yours to explain and yours to fix.

### The line from here

This pool is the direct ancestor of everything in our liquidity policy since: the [automated provision strategies](/guides/smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023) we moved to in late 2023, the [DEX transparency commitment](/guides/open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023) published alongside it, and eventually the decision to leave centralised exchanges by choice.

It also predates the two hardest things that happened to DHB — a v1 contract vulnerability and, a year and a half later, a tax-trigger malfunction that froze the token and the pool together. Both are covered honestly elsewhere in this archive. Neither changes the fact that this quarter is where DHB stopped being an idea with a vote attached and started being a traded asset with consequences.

### What we would tell a project doing this now

Depth first, announcement second. The instinct is to publicise the moment the pool exists, because that is the exciting part, and the result is a chart made almost entirely of slippage for everyone who arrives early.

And be clear with yourself about what a pool commits you to. Once there is a market, every decision the project makes has a visible price attached within minutes, including decisions that are correct and unpopular. We made several of those later — [leaving a centralised exchange voluntarily](/guides/prioritizing-principles-voluntary-delisting-from-gateio-for-decentralization---a-dehub-milestone-from-q4-2023), [dropping a chain we had listed on a year earlier](/guides/strategic-shift-discontinuing-ethereum-mainnet-support-for-dhb---a-dehub-milestone-from-q1-2025) — and each one cost something immediately and paid back slowly.`,
  },

  'a-new-era-the-rebranding-to-dehub---a-dehub-milestone-from-q3-2021': {
    excerpt:
      'A rename is usually cosmetic. This one was an argument about what we were building, settled in public.',
    content: `We rebranded to DeHub in Q3 2021.

Renames in this industry are usually a bad sign — a project changing its name after a failed launch, or chasing whichever narrative is paying that quarter. Ours was neither, but it is fair to be suspicious of the category, so it is worth being specific about what changed and why.

### The name was describing the wrong thing

Our original identity was built around the token and the moment it launched. That was accurate for about six months. By mid-2021 we had a beta app with a few thousand daily users, a community that had voted on the token's fundamentals, an arcade in planning, and streaming work already underway.

None of that fits under a name that points at a token. Every conversation started in the wrong place: people arrived expecting a coin with a chart and had to be walked backwards into the fact that there was a product. When your own name is costing you the first two minutes of every introduction, the name is the problem.

### What "hub" was meant to commit us to

The word was chosen as a constraint rather than a description. A hub is a place other things connect into. Picking it publicly meant committing to a platform that would carry streaming, an arcade, a marketplace, a feed and payments — rather than a single app that would spend the next three years adding features nobody asked for.

That commitment turned out to be expensive in the way we hoped. It ruled things out. Several profitable-looking detours over the following years were declined on the basis that they did not connect to anything, and the name is a large part of why that argument kept winning.

### What it cost

Rebrands are not free, and this one landed in a quarter that was already full:

- Every piece of published material, social handle and store listing had to be redone.
- Search history and prior coverage stayed attached to the old name for a long time afterwards.
- Some early community members had genuine attachment to the original identity, and a rename reads as a loss of history whatever the reasoning.

We did it anyway, and in the same quarter we started the [full app rebuild in React Native](/guides/building-for-all-app-rebuild-with-react-native---a-dehub-milestone-from-q3-2021). The two were the same decision made in two places — one about what to call the thing, one about what to build it on, both about stopping being a token with an app attached.

### Looking back

The rebrand is four years old now and DeHub has been through a v1 vulnerability, a v2 relaunch, a fraudulent listing agent and a real estate venture that did not survive contact with a regulator. The name has outlasted all of it, largely because it was chosen to describe an ambition rather than a market condition. That is the only kind of rebrand worth the disruption.

### The test we apply now

Any name, product or positioning decision at DeHub has to answer one question: would this still be the right choice if the market conditions that make it attractive today reversed entirely?

A name chosen because a narrative is paying fails that test immediately. So do most feature decisions made in a bull market, and a fair number of the partnerships offered to us over the years.

It is a slower way to decide things and it has cost us some opportunities that would have worked out. It has also meant that four years of extremely varied market conditions have not once made us want to be called something else, which for a project of this age in this industry is not the default outcome.`,
  },

  'building-for-all-app-rebuild-with-react-native---a-dehub-milestone-from-q3-2021': {
    excerpt:
      'The beta proved people wanted it. Rebuilding the whole app in React Native was the admission that the beta could not carry them.',
    content: `In Q3 2021 we started rebuilding the DeHub app from scratch in React Native.

Deciding to rewrite a working application is not a decision anybody enjoys. The beta was live, it had users, and every week spent on the rebuild was a week not spent on features those users were asking for. We did it anyway, and it is one of the few large calls from that period we have never revisited.

### What was wrong with the first app

The beta was built to answer a question — will people use this at all — and it answered it. What it could not do was grow. Shipping to two platforms meant maintaining two codebases, which in practice meant one platform quietly falling behind, and every feature costing roughly double what it should.

For a team our size that is not a technical inconvenience. It is a cap on how fast the product can ever move.

### Why React Native

The honest reason is team leverage. React Native let a small group ship to iOS and Android from one codebase without going fully native twice, and without the compromises of a wrapped web view — which for an app built around video and live content would have been fatal.

It also meant the mobile app and the web app could share a mental model, a component vocabulary and, in a lot of cases, actual logic. Four years later DeHub runs a React web app and a React Native mobile app maintained in parallel, and features cross between them at a pace that would not be possible if the answer in 2021 had been two native rewrites.

### The parts that were harder than expected

Nobody should read this as a frictionless choice:

- **Video is where the abstraction leaks.** Playback, background audio and live streaming are exactly the areas where you end up in native modules regardless of the framework's promises.
- **Wallet integration was the ongoing tax.** Mobile wallet connection has been re-solved more times than any other part of the app, and remains the single most common place new users stall.
- **Rewrites always take longer.** The list of things the old app did that nobody had written down is only discovered by removing them.

### Why it was still right

The rebuild is the reason the app survived everything that came next. When the [arcade launched](/guides/level-up-dehub-arcade-launches-with-5-games--predictions---a-dehub-milestone-from-q1-2022) in Q1 2022, when the [stream app arrived](/guides/crystal-clear-dehub-stream-app-with-4k-support--high-uptime---a-dehub-milestone-from-q2-2022) that summer, when the whole ecosystem was pulled into a single d'app in 2023 — none of those were a case of bolting onto the beta. They landed on a foundation deliberately built to take weight.

The lesson we took from it is not "rewrite early". It is that the moment you can name the specific ceiling your architecture puts on the team, you are already paying for the rewrite whether or not you have started it.

### How to survive one

Two things made this rewrite finish rather than stall, and both are worth stating because most rewrites do stall.

**The old app kept running.** We did not stop shipping to existing users while the replacement was built. That extends the timeline and it removes the pressure that produces a rushed cutover, which is where rewrites usually die.

**The scope was the architecture, not the product.** Every request to also improve a feature while rebuilding it was declined. A rewrite that is simultaneously a redesign has two ways to fail and no way to tell which one is happening. The interface work waited until 2024, when it shipped properly as a [full overhaul alongside a 200% backend improvement](/guides/faster-and-sleeker-ui-overhaul-and-200-backend-speed-boost---a-dehub-milestone-from-q3-2024).`,
  },

  'rewarding-loyalty-automatic-airdrop-for-all-holders---a-dehub-milestone-from-q3-2021': {
    excerpt:
      'Every v1 holder was made whole 1:1, automatically, with no claim page and no deadline. This is what the security fix looked like from the holder side.',
    content: `When a vulnerability was found in the v1 contract, we paused interactions with it, patched and redeployed. The part that mattered to holders was what happened next: a snapshot of every balance before the new contract went live, and an automatic 1:1 airdrop to every one of them.

Nobody had to claim. Nobody had to sign anything. Nobody missed a window.

![DeHub card reading "no claim page" — every v1 holder was airdropped automatically](/lovable-uploads/inbody-airdrop-1to1.jpg)

### Why automatic, and why it matters

The normal way to handle this is a claim page. It is much cheaper, and it is standard practice, and we did not do it — because a claim page quietly transfers the cost of your mistake onto the people it was made against.

Claim mechanisms fail for ordinary reasons. People are travelling. People miss the announcement. People have lost access to the wallet they held in, or do not understand what a claim is, or see a link asking them to connect a wallet after a security incident and correctly decide not to trust it. Every one of those produces a holder who did nothing wrong and ends up with nothing, and every unclaimed balance ends up back with the project.

The incident was ours. The remediation should not have had a participation requirement.

### What automatic actually involves

It is more work, and worth being clear about what the work is:

- **The snapshot has to be defensible.** One block, taken before deployment, published so anyone can check their own balance against it.
- **Distribution costs real money.** Thousands of individual transfers at network fees, paid by the project, with no offsetting unclaimed remainder.
- **Edge cases have to be decided in advance and in public.** Balances held in pools, in contracts, mid-transfer at the snapshot block — every one of those needs a stated rule, applied consistently, before anyone can accuse you of choosing winners after the fact.

### The precedent it set

This is the first time DeHub airdropped its holders, and it set the pattern for everything since. Airdrops have been part of the utility model since the first whitepaper in 2021, and the ones that followed — the [partner airdrop for the fan.site fork](/guides/expanding-horizons-partner-airdrop-for-fansite-bj-fork---a-dehub-milestone-from-q3-2023), and later the Last Chad Standing distributions — all inherited the same assumptions. Snapshot published, rules stated up front, holders not required to perform to be included.

It also set an internal standard we have been held to since: when we break something, the fix is not finished when the code is fixed. It is finished when the people affected are whole. That principle was tested much harder in [Q4 2022](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022), when a tax-trigger malfunction froze the token and the liquidity pool and forced a full v2 relaunch with more than 25,000 holders to migrate. The approach did not change. It just got considerably more expensive.

### The thing nobody accounts for

Doing it this way in 2021 is the reason the 2022 migration worked at all.

By late 2022 we were asking 25,000 people to take an unusual action with their wallets, immediately after a failure we had caused, in an environment full of people impersonating us and hoping someone would click the wrong link. The only real asset we had in that conversation was a prior example of how we behave when we break something.

Handling the first incident properly was not just the right thing at the time. It was the credit we spent a year later, when we needed it and could not have earned it retroactively.`,
  },

  'fortifying-our-walls-v1-security-hardened-with-certik-audit---a-dehub-milestone-from-q3-2021': {
    excerpt:
      'A full Certik audit after a v1 vulnerability. Worth being precise about what an audit does and does not buy you.',
    content: `Following the v1 smart contract vulnerability, we commissioned a full audit with Certik in Q3 2021 and addressed what it found.

Audits get used as marketing in this industry, so it is worth writing this one down accurately: what we had it done for, what it covered, and what it did not prevent.

### Why after, not before

The uncomfortable answer is that v1 shipped without one. The community had voted on the token's fundamentals, the launch was moving, and a full audit is weeks of calendar time and a meaningful cost for a project that had not yet listed.

That was the wrong trade and the vulnerability proved it. Every contract we have deployed since has been audited before it went live, not after. It is a policy that exists because of this quarter.

### What the audit actually is

An audit is a structured, adversarial read of the code by people who are paid to find things and have no stake in the outcome. A good one produces a list of findings by severity, a set of recommended changes, and a record of which ones you actually made.

That last part is where audits get misrepresented. "Audited by Certik" is not a finding — a report with unresolved criticals is still an audit. The useful claim is that findings were resolved and the resolutions were verified, which is what we did here, and it is the version we have published since.

![DeHub card reading "what an audit is not" — the limits of a smart contract security report](/lovable-uploads/inbody-certik.jpg)

### What an audit does not buy you

Being direct about the limits, because we later learned some of them the hard way:

- **It covers the code, not the design.** A contract can be free of exploitable bugs and still behave badly under conditions nobody modelled.
- **It is a snapshot.** It applies to the version audited. Any change after that is unaudited until it is not.
- **It cannot see the parts that are not code.** Our single most damaging incident that year was not technical at all — it was a [fraudulent listing agent](/guides/trials-and-tribulations-the-gateio-listing-agent-incident---a-dehub-milestone-from-q4-2021), and no contract audit in existence would have caught it.

The clearest illustration is [Q4 2022](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022). The v2 contract's tax triggers malfunctioned under real market conditions and froze both the token and our liquidity pool. That was a design problem, not an unpatched bug, and it is why we eventually moved to [plain standard ERC-20 tokenomics](/guides/stability-first-adopting-standard-erc20-tokenomics---a-dehub-milestone-from-q4-2022) with nothing clever in the transfer path at all.

### What we kept

The audit did its job. Holders were made whole through an [automatic 1:1 airdrop](/guides/rewarding-loyalty-automatic-airdrop-for-all-holders---a-dehub-milestone-from-q3-2021), the hardened contract carried DHB through the following year, and the process became standard.

The larger lesson was cheaper to learn here than it would have been later: the audit is not the safety. The safety is the habit of assuming your contract is wrong until someone with no reason to be kind has tried to prove it.

### How we talk about it

We do not use "audited" as a claim on its own, and we would encourage anyone assessing a project to treat the word as the beginning of a question rather than the end of one.

The useful questions are: audited by whom, against which version, what did they find, and what was actually changed as a result. A report with unresolved critical findings is still an audit. A report on a contract that has since been modified describes something no longer deployed.

Those questions are the reason the [transparency reports](/guides/full-disclosure-dehubs-comprehensive-transparency-reports---a-dehub-milestone-from-q4-2023) and eventually [dhbscan.com](/guides/transparency-hub-dhbscancom-launches-for-contract-activity-tracking---a-dehub-milestone-from-q2-2025) exist. They answer them without requiring anyone to ask.`,
  },

  'global-reach-dehub-team-grows-to-15-strong---a-dehub-milestone-from-q3-2021': {
    excerpt:
      'Fifteen people across three time zones. The distribution was the point, and it came with costs worth naming.',
    content: `By Q3 2021 the team had grown to 15 people working across three time zones.

Fifteen is a specific size. It is the point where you can no longer keep the whole project in one conversation, and where the things that were obvious to everyone start needing to be written down.

### Why three time zones

Partly deliberate, partly the consequence of hiring for the role instead of the postcode. We were competing for engineers against far better funded companies in 2021, and refusing to look outside one city would have meant losing every one of those competitions.

The coverage was a real benefit too. A platform with live streaming and an arcade does not stop having problems at 6pm in one country. Spread across three zones, most incidents have somebody awake and responsible without anyone being permanently on call.

### What it cost

Distributed teams are usually described in terms of their benefits, which is not honest. The costs at this size:

- **Everything is slower to decide.** A question that would take ninety seconds in a room takes a day when the person who can answer it is asleep.
- **Written communication stops being optional.** Anything not written down is effectively private to whoever was in the call.
- **Culture does not form on its own.** In one office it happens by accident. Distributed, it only exists to the extent you deliberately build it.

We got the third one wrong for a while. The fix was not more meetings — it was fewer, better-recorded ones, and being far more explicit about ownership. Fifteen people can all agree something is important and every one of them assume somebody else has it.

### The shape it gave the company

That structure is still recognisable in how DeHub works today. Distributed by default, written by default, small teams owning whole surfaces rather than a large team owning everything shallowly.

It is also why the co-founders were able to build a separate business alongside this one — the [TikTok partner agency](/guides/entrepreneurial-spirit-co-founders-launch-tiktok-agency---a-dehub-milestone-from-q2-2024) that later became the UK's largest — without the platform stalling. That only works if ownership is genuinely distributed rather than routed through two people.

### What we would tell ourselves

Hire for the specific gap, not the general shortage. Almost every hiring mistake in this period was a good person brought in without a clearly owned problem, and almost every one that worked was somebody handed a surface and left to own it.

Fifteen was also the point where we stopped being able to run on enthusiasm. The processes that felt like bureaucracy at ten were the only reason twenty was survivable.

### The real test came later

Whether ownership was genuinely distributed or merely described that way was not answered in 2021. It was answered in 2024, when the co-founders [opened a TikTok agency](/guides/entrepreneurial-spirit-co-founders-launch-tiktok-agency---a-dehub-milestone-from-q2-2024) that grew to [1,000 exclusively signed streamers and the UK's number one position](/guides/leading-the-way-dehub-agency-becomes-uk-1-with-1000-streamers---a-dehub-milestone-from-q4-2024) inside two quarters.

In that same period DeHub shipped a full interface overhaul, a 200% backend improvement, DePIN Phase 1 and on-chain tradable subscriptions. A company where the founders are the critical path does not do that while the founders are building something else.

The structure decided here is why. It looked like an administrative detail at the time.`,
  },

  'game-on-dehub-launches-prediction-and-raffle-games---a-dehub-milestone-from-q4-2021': {
    excerpt:
      'Predictions and raffles were the first things on DeHub where the outcome had to be provable, not promised.',
    content: `In Q4 2021 we released our first prediction and raffle games. They were the first DeHub products where the honesty of the result was the product.

### Two different problems

Predictions and raffles look similar from the outside and are not.

A prediction market needs a settlement source everyone agrees on in advance, and a rule for what happens when that source is ambiguous, late or wrong. Most disputes in prediction products are not about the outcome — they are about whether the question was well-formed.

A raffle needs randomness nobody can influence, including us. The entire value of a raffle collapses the moment the operator could plausibly have chosen the winner. Not "did choose" — could have.

### Why they came first

They were small enough to build properly and severe enough to force the standard. A raffle where the draw is not verifiable is worthless whatever else it does well, so there was no version of shipping this that let us defer the hard part.

They also fit the app we actually had. The [beta had proven daily habit](/guides/early-traction-dehubs-beta-app-hits-2000-daus---a-dehub-milestone-from-q1-2021), the community was past 8,000 members by the end of that quarter, and games are the shortest path from "I opened the app" to "something happened".

### How we handled the draw

The commitment we made was that mechanics would be [provably fair and verifiable on-chain](/guides/fair-play-provably-fair-randomization-in-dehub-games---a-dehub-milestone-from-q4-2021) rather than asserted. In practice that means the source of randomness and the rules of settlement are fixed and published before entries open, and the result can be checked afterwards by anyone, against data they did not get from us.

It is the same principle as the [snapshot published for the v1 airdrop](/guides/rewarding-loyalty-automatic-airdrop-for-all-holders---a-dehub-milestone-from-q3-2021) earlier that year: state the rule first, apply it mechanically, publish enough that being trusted is optional.

### Where it led

This work scaled up considerably. The [arcade launched in Q1 2022](/guides/level-up-dehub-arcade-launches-with-5-games--predictions---a-dehub-milestone-from-q1-2022) with five games and predictions alongside, [on-chain leaderboards and rewards](/guides/on-chain-glory-blockchain-leaderboards-and-rewards-in-dehub-arcade---a-dehub-milestone-from-q1-2022) followed in the same quarter, and by Q3 2022 the raffle mechanics were carrying a [$1,000,000 house](/guides/dream-big-the-1m-home-crypto-raffle-by-dehub---a-dehub-milestone-from-q3-2022) with more than 15,000 participants.

That escalation is only possible because of what was decided here. A raffle for a games prize and a raffle for a million-pound property are the same code and the same trust problem. Getting it right while the stakes were small is the reason the large one was possible at all.

### The unglamorous part

Prediction settlement gave us more trouble than the draws did, and it is the part nobody writes about.

A raffle has one moment of contention and a clean rule. A prediction market has a question, and questions are ambiguous in ways their authors never anticipate — an event that half-happens, a source that revises its own figure after publication, a resolution time that lands in a different timezone than someone assumed.

We learned to spend more time writing the question than building the market. Almost every dispute we have had in a prediction product traces back to wording, not to code, and no amount of on-chain verification rescues a badly specified question.`,
  },

  'to-the-moon-gateio-listing-and-10m-lp-milestone---a-dehub-milestone-from-q4-2021': {
    excerpt:
      'A near-1000x run, close to $10m in the pool, and a Gate.io listing. This is the high point — and it is inseparable from what happened during it.',
    content: `Q4 2021 was, by every market measure, the best quarter DeHub has had. DHB ran close to 1000x from its launch price, our liquidity pool held close to $10 million, and we listed on Gate.io.

It is also the quarter our fundraise was stolen. Those two facts are the same story and we have never published one without the other.

### What the numbers were

A near-1000x from a community-set launch price. Close to $10m of depth in the pool, which for a project barely two quarters past its first PancakeSwap listing is a genuinely unusual amount of liquidity. A tier-one centralised listing on top of that.

### What a listing was supposed to do

The reason a project chases a centralised listing is access. In 2021 a large share of retail could not or would not use a DEX — no self-custody wallet, no comfort with the process, in some countries no realistic route to the chain at all. A CEX listing is how those people reach you.

It also brings depth, market makers, and price discovery that does not depend entirely on your own pool. All of that was real and all of it arrived.

### What went wrong

The listing agent handling it was fraudulent. They took our fundraise and dumped into our chart instead of airdropping Gate users as agreed. Gate investigated, apologised, and could not identify the individual involved because the records were gone.

The full account is in its [own post](/guides/trials-and-tribulations-the-gateio-listing-agent-incident---a-dehub-milestone-from-q4-2021), and it belongs there rather than buried in a paragraph. The relevant point here is that the peak and the theft were the same weeks. Anybody reading this quarter as a straightforward success is reading half of it.

### What we actually learned

The lasting lesson was not about market cycles. It was about counterparties.

We had spent that year auditing our contracts, publishing our snapshot rules and building verifiable game mechanics — enormous effort spent making our code trustworthy. The loss came through a person with a contract and a plausible introduction, in a process that had no on-chain component to verify at all.

Everything that followed reflects that. The [voluntary delisting from Gate.io](/guides/prioritizing-principles-voluntary-delisting-from-gateio-for-decentralization---a-dehub-milestone-from-q4-2023) two years later, the [published DEX policy](/guides/open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023), the [transparency reports](/guides/full-disclosure-dehubs-comprehensive-transparency-reports---a-dehub-milestone-from-q4-2023) and eventually [dhbscan.com](/guides/transparency-hub-dhbscancom-launches-for-contract-activity-tracking---a-dehub-milestone-from-q2-2025) all point the same direction: fewer places where you have to take somebody's word for it.

The 1000x is the number people remember from this quarter. The lesson we kept is that the parts of your operation with no public record are the parts that will hurt you.

![DeHub card reading "depth not multiple" — pool depth mattered more than the price multiple](/lovable-uploads/inbody-lp-depth.jpg)

### On the number itself

A near-1000x is not an achievement and we have never presented it as one. It is a market condition, and the same conditions produced comparable charts for a great many projects that no longer exist.

What is worth reporting from Q4 2021 is the depth rather than the multiple. Close to $10 million in the pool meant ordinary holders could actually transact without the price moving against them, which is the part that affects real people and the part that does not appear in a screenshot of a chart.

We have been consistent about that framing since, including through periods when the multiple was a much less flattering number.`,
  },

  'trials-and-tribulations-the-gateio-listing-agent-incident---a-dehub-milestone-from-q4-2021': {
    excerpt:
      'Our listing agent took the fundraise and dumped our chart instead of airdropping Gate users. Gate investigated, apologised, and said the records were lost.',
    content: `This is the worst thing that happened to DeHub in 2021, and it happened in the same quarter as our best numbers.

We list it here in full because a roadmap that only records the wins is not a record of anything.

### What happened

We engaged an agent to handle our Gate.io listing. Part of the arrangement was a fundraise, and part was an airdrop to Gate users.

The agent took the fundraise. The airdrop to Gate users never happened. Instead, the allocation was dumped into our chart.

We raised it with Gate. Gate investigated and apologised. They were unable to identify the individual responsible, because the records covering the period had been lost.

That is the entire outcome. No recovery, no named party, no resolution beyond an apology.

### Why we keep publishing it

Three reasons.

Our community lived through it in real time. The chart did what the chart did, and people who had been with us since the Telegram votes watched it happen. Quietly dropping it from the official history would insult everyone who was there.

Second, we ask people to trust an on-chain platform on the basis that things are checkable. A project that curates its own history is asking for exactly the trust it says it is trying to make unnecessary.

Third, it is genuinely useful to somebody else. Projects preparing a first centralised listing are routinely introduced to intermediaries by people they have every reason to trust, and the failure mode is not obvious in advance.

![DeHub card reading "records lost" — the outcome of the Gate.io listing agent investigation](/lovable-uploads/inbody-gate-agent.jpg)

### What we would do differently

Concretely, with hindsight:

- **Never let an intermediary custody the raise.** The single decision that made everything else possible was funds moving through a party that was not the exchange and not us.
- **Insist on direct confirmation from the exchange.** Every material term should be confirmed by the venue itself, in writing, not relayed by the person being paid to arrange it.
- **Assume records are not permanent.** Our recourse ended at "the records were lost". Anything you would need in a dispute has to be held by you at the time, not requested afterwards.
- **Put distribution obligations on-chain.** An airdrop that must be performed by a counterparty is a promise. An airdrop written into a contract is not.

### What it changed

We did eventually [resume v2 trading on Gate.io](/guides/back-in-action-dehub-v2-trading-resumes-on-gateio---a-dehub-milestone-from-q1-2023) in Q1 2023, and then [left voluntarily](/guides/prioritizing-principles-voluntary-delisting-from-gateio-for-decentralization---a-dehub-milestone-from-q4-2023) at the end of that year. That second decision is usually read as ideological. It was partly practical: our experience of centralised intermediation was that it introduced parties we could not verify, into a process we could not audit, with no recourse when it failed.

The rest of this archive is full of transparency work — published DEX policy, transparency reports, dhbscan.com. It is fair to read all of it as downstream of this quarter.

### What we owe the people who were there

The community that watched this happen in real time had been with us since the [Telegram votes on the token's fundamentals](/guides/power-to-the-people-community-governed-listings---a-dehub-milestone-from-q2-2021). They had chosen the chain, the price and the supply. Then they watched an allocation they had no part in arranging get sold into the market they had built.

A meaningful number of them stayed. We do not fully understand why, and we have never treated it as owed.

What we can do is keep the account accurate. This post has said the same thing since it was written, it names what happened without softening it, and it will not quietly disappear from the archive when it becomes inconvenient to have a failure this size in the record.`,
  },

  'fair-play-provably-fair-randomization-in-dehub-games---a-dehub-milestone-from-q4-2021': {
    excerpt:
      'The test is not whether we picked the winner. It is whether we could have. Provable fairness is what makes that question answerable.',
    content: `Alongside the first prediction and raffle games in Q4 2021, we implemented provably fair randomisation.

The phrase gets used loosely, so here is what we mean by it and why it was worth building before the stakes justified it.

### The problem with "trust us"

Any operator running a draw can, in principle, influence it. The player has no way to distinguish an honest operator from a dishonest one, because from the outside both produce a winner and an announcement.

That is not a reputational problem you can solve with reputation. It is structural. As long as the mechanism is private, the correct level of trust for a rational player is low, no matter how straight you have been.

### What provable fairness means here

The standard we set was that the result must be verifiable by someone who assumes we are lying.

In practice:

- **The rules are fixed and published before entry opens.** Entry conditions, the draw method, and how ties or failures are handled. Nothing decided after the outcome is known.
- **The randomness comes from a source we cannot choose or re-roll.** If the operator can sample repeatedly and keep a result they prefer, the source does not matter.
- **The outcome is checkable on-chain after the fact.** Anyone can reconstruct the draw from public data and confirm the announced winner is the one the rules produce.

The key property is the third one combined with the first. Publishing the rule afterwards proves nothing — it is trivial to describe a rule that produces the result you already have.

### Why do this at small stakes

Because it stops being possible to add later. A game that has run one unverifiable draw has an unverifiable history, and no subsequent transparency retroactively fixes it.

It also forces the design honestly while nobody is watching. Every awkward question — what happens if the source is unavailable, if entries tie, if a transaction lands in the same block — is much easier to answer well before there is a large prize and an audience waiting.

### Where it ended up

Less than a year later the same approach was carrying [on-chain verified raffle mechanics](/guides/trust-and-transparency-on-chain-verified-raffle-mechanics---a-dehub-milestone-from-q3-2022) for a [$1,000,000 house](/guides/dream-big-the-1m-home-crypto-raffle-by-dehub---a-dehub-milestone-from-q3-2022) with more than 15,000 participants. At that size, "trust us" is not a policy anybody would have accepted, and there would have been no time to retrofit the machinery.

The [arcade's on-chain leaderboards](/guides/on-chain-glory-blockchain-leaderboards-and-rewards-in-dehub-arcade---a-dehub-milestone-from-q1-2022) inherited the same assumption a quarter later: if a score decides a reward, the score has to be checkable by the people it is deciding against.

That is the general rule this quarter produced. Anywhere DeHub decides an outcome that has value attached, the deciding should be inspectable by the person who lost.

### The trade-off we accepted

Verifiable systems are less flexible, and that cost is real rather than theoretical.

A published rule cannot be adjusted when it produces an outcome you dislike. We found that out properly the following year, when the [$1,000,000 house raffle failed to reach its published minimum](/guides/dream-big-the-1m-home-crypto-raffle-by-dehub---a-dehub-milestone-from-q3-2022) and the threshold was an on-chain condition rather than a line in the terms. There was no discretion available. Everyone was refunded.

That was expensive and it was the system working. A verification mechanism that only holds when the answer is convenient is not one, and the moment you carve out an exception you have retroactively removed the property from everything it ever covered.`,
  },

  'strength-in-numbers-dehub-community-exceeds-8000-active-members---a-dehub-milestone-from-q4-2021': {
    excerpt:
      'Past 8,000 active members — in the same quarter the chart was manipulated by our own listing agent. That is when a community is actually tested.',
    content: `Our community passed 8,000 active members in Q4 2021, up from around 2,000 early adopters two quarters earlier.

Growth numbers are the easiest thing in this industry to inflate and the least interesting to report, so the useful detail is the timing: this happened in the same quarter that our [listing agent stole the fundraise and dumped our chart](/guides/trials-and-tribulations-the-gateio-listing-agent-incident---a-dehub-milestone-from-q4-2021).

### Growth during a good quarter is not a signal

A large part of that growth arrived with the run. DHB was up close to 1000x from launch and there was close to $10m in the pool. People arrive for that. Nothing about a community that forms during a run tells you anything, because the same conditions would have grown any community.

What was informative was the second half of the quarter, when the agent situation became public and the chart reflected it. That is the point at which a room that formed around a price usually empties, and a meaningful part of ours did not.

### What we think held it

Not luck, and not loyalty in the abstract. A few specific things:

- **The community had made real decisions.** Chain, price, market cap and supply were [voted on in Telegram](/guides/power-to-the-people-community-governed-listings---a-dehub-milestone-from-q2-2021) before launch. People who chose the terms behave differently from people who bought into them.
- **There was a product.** The [beta had been live since Q1](/guides/early-traction-dehubs-beta-app-hits-2000-daus---a-dehub-milestone-from-q1-2021) with a few thousand daily users, and prediction and raffle games shipped that quarter. Something existed to be part of that was not the chart.
- **We had already handled one incident straight.** When the v1 vulnerability appeared, holders were made whole [1:1 with no claim required](/guides/rewarding-loyalty-automatic-airdrop-for-all-holders---a-dehub-milestone-from-q3-2021). By Q4, we were not asking for the benefit of the doubt on a blank record.

### What we got wrong

We over-indexed on total member count for a long time after this. Eight thousand is a good headline and a poor management metric — it does not distinguish somebody running a stream from somebody who joined a Telegram group in 2021 and never spoke.

The numbers we care about now are things like whether creators upload again, whether stakers stay staked through an airdrop cycle, and whether people come back to the app on a day with no announcement. Those are harder to grow and much harder to fake.

### The through line

The community that came out of Q4 2021 is recognisably the one that later absorbed a [contract malfunction and a full v2 relaunch](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022), a [migration of 25,000+ holders](/guides/moving-forward-successful-migration-of-25000-holders-to-v2---a-dehub-milestone-from-q4-2022), and a real estate venture that did not survive its regulator. None of those were survivable on a community assembled purely by a price chart.

### What eight thousand people are actually for

The most useful thing a community of that size did for us was disagree.

Several decisions in this archive were made worse by internal consensus and corrected by people outside the team saying so loudly — pacing around releases, the framing of certain announcements, and more than one feature we were attached to. A community that only celebrates is a marketing asset. One that argues is a functioning check.

That is also why the [fork by a group of large holders in 2023](/guides/decentralization-in-practice-the-fansite-fork-story---a-dehub-milestone-from-q3-2023) was not treated as a betrayal. People with real standing in a project are supposed to be able to act on their own judgement. If that is only acceptable when they agree with us, none of this means anything.`,
  },
};
