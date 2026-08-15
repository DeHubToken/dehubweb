import { MilestoneContentMap } from './types';

export const milestones2023: MilestoneContentMap = {
  'creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023': {
    excerpt:
      'Creators keep 90% of ad revenue, settled on-chain. The number is the easy part — making it structural rather than promotional is not.',
    content: `In Q1 2023 we released tokenised uploads with on-chain ad revenue sharing, with creators earning 90%.

### Why 90, and why it is not the point

Ninety percent is a marketing number in most hands. Platforms announce generous splits during growth phases and revise them once creators have built audiences they cannot easily move.

That is the actual problem, and the split is not what solves it. What matters is whether the terms are a property of the upload or a policy of the platform.

On DeHub the revenue share is attached to the tokenised upload and settled on-chain. It is not a rate we publish and honour. It is how the payment executes.

The distinction is exactly the one we had already made for [NFT royalties](/guides/empowering-creators-dehub-nft-marketplace-with-royalties---a-dehub-milestone-from-q2-2022) the previous year — and by 2023, that argument had been settled publicly in the NFT market, where marketplace-honoured royalties had quietly become optional and then default-off. Creators who had relied on a convention discovered it was a courtesy.

We would rather not run the same experiment on people's income.

### What "tokenised upload" means here

Not that the video is an NFT in the collectible sense. It means the upload has an on-chain representation carrying its ownership and its economics — who made it, who is owed what, and under what terms.

Consequences that follow from that:

- **Payment does not depend on us processing it.** Settlement is a property of the transaction.
- **The terms are inspectable** by the creator, before they upload, without a support ticket.
- **They cannot be revised retroactively.** A change applies to new uploads. It cannot reach back into the ones already published.

That third point is the one traditional platforms cannot offer, structurally, because their terms live in an agreement they control.

### What the 90% costs us

It means we operate on a tenth of ad revenue on those uploads, and we pay the full delivery cost of the video.

That is only survivable because of infrastructure work done specifically to make it survivable — the [video compression that cut bandwidth costs by around 60%](/guides/efficient-streaming-advanced-video-compression-reduces-costs---a-dehub-milestone-from-q2-2022) in mid-2022, and later the [custom CDN](/guides/speed-of-light-custom-cdn-achieves-sub-200ms-global-latency---a-dehub-milestone-from-q1-2025).

Those two facts are directly connected. A generous revenue share is not a values statement, it is an engineering outcome. Platforms that keep the majority of revenue are frequently doing so because their cost base gives them no choice.

### What we underestimated

Adoption is not driven by the split. It is driven by audience.

A creator with an established following on another platform is not choosing between 90% and 55%. They are choosing between a known audience and an unknown one, and the split is a rounding error against that. We learned this slowly and at some expense.

It is why so much of the work that followed — the [analytics dashboard](/guides/insights-for-creators-advanced-analytics-dashboard-development-begins---a-dehub-milestone-from-q1-2023) started the same quarter, the creator education curriculum, the [ambassador programme](/guides/community-champions-ugc-ambassadorship-program-launched---a-dehub-milestone-from-q2-2025) — is about helping creators build an audience rather than about paying them more of what they already earn.

### Where it stands

Three years on, the mechanism has not changed and has not needed to. Uploads carry their own economics, settlement happens on-chain, and no revision we could make would reach backwards into work already published.

What has changed is our honesty about what that buys. It does not make a creator successful. It removes one specific category of risk — the risk that the terms you accepted are quietly not the terms you end up with — and leaves every other difficulty in place. That is a narrower promise than most platforms make and it is one we can actually keep.`,
  },

  'insights-for-creators-advanced-analytics-dashboard-development-begins---a-dehub-milestone-from-q1-2023': {
    excerpt:
      'Work started on creator analytics in Q1 2023. On a platform paying out 90% on-chain, the numbers have to reconcile with the chain exactly.',
    content: `Development on an advanced analytics dashboard for creators began in Q1 2023, alongside the launch of [tokenised uploads with a 90% ad revenue share](/guides/creator-economy-reimagined-tokenized-uploads--90-ad-revenue-share---a-dehub-milestone-from-q1-2023).

The two are the same project viewed from different ends. Paying creators the overwhelming majority of revenue is meaningless if they cannot see how the figure was reached.

### The specific problem on-chain payment creates

On a conventional platform, analytics are an estimate the platform provides and the creator accepts. Views, watch time, revenue — all of it arrives as a number in a dashboard, and there is no independent way to check any of it.

When settlement happens on-chain, that arrangement breaks in an interesting way. The payment is publicly verifiable. If our dashboard says one thing and the chain says another, the creator can see the discrepancy directly.

That is a much harder engineering constraint than it sounds. It means analytics cannot be approximate in the places where they touch money, and it means every rounding decision, every attribution rule and every timing boundary has to reconcile exactly with what the contract did.

Most platform analytics would not survive that test. They are not designed to.

### What we set out to build

The brief was narrow on purpose:

- **Earnings that reconcile with the chain**, per upload, traceable to the transactions that produced them.
- **Audience data that is actually actionable** — where people stop watching, what they came from, what they did next — rather than a wall of vanity totals.
- **Honest attribution.** If we cannot determine where a view came from, the dashboard says so rather than assigning it somewhere plausible.

That last one costs engagement. "Unknown" is an unsatisfying category and every product instinct pushes you to guess. Guessing is how creator analytics across the industry became gently fictional.

### Why it took a long time

Because it started here and did not finish here, which is why the milestone says development began.

The honest reason is ordering. Analytics for a platform is not one feature — it is a pipeline that has to be correct at every stage, and it can only be as good as the event data underneath it. Rebuilding that foundation properly took considerably longer than putting charts on a screen, and we had a choice between shipping something fast that would quietly mislead people about their income, or taking the time.

We have been burned by the fast version elsewhere. Not here.

### What it connects to

The line runs from here to [dhbscan.com](/guides/transparency-hub-dhbscancom-launches-for-contract-activity-tracking---a-dehub-milestone-from-q2-2025) in 2025, which lets anyone track activity across all DHB contracts, and to the [transparency reports](/guides/full-disclosure-dehubs-comprehensive-transparency-reports---a-dehub-milestone-from-q4-2023) published at the end of 2023.

They are the same commitment aimed at different audiences. A creator should be able to verify their own earnings; a holder should be able to verify the protocol's. Neither should have to ask us.

### The number we refuse to invent

Attribution for views that arrive without a usable source.

Every analytics product has this problem and almost all of them solve it by distributing the unknowns across the known categories in proportion, which produces a tidy pie chart that is partly fiction. Creators then make real decisions — where to promote, what to make next — on the fictional part.

We show it as unknown. It is an unsatisfying category, it makes our dashboard look less capable than competitors', and it is the only honest option when the underlying data does not support a claim.

That principle is the one thing from this project we would defend hardest, because it is the one that costs us something every time it is applied.`,
  },

  'back-in-action-dehub-v2-trading-resumes-on-gateio---a-dehub-milestone-from-q1-2023': {
    excerpt:
      'Trading resumed on Gate.io after the v2 relaunch. Ten months later we left voluntarily — both decisions are in this archive.',
    content: `DeHub v2 trading resumed on Gate.io in Q1 2023.

### What it took to get here

The previous quarter had been the worst in our history. The [contract's tax triggers malfunctioned and froze the token and the liquidity pool](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022), forcing a full relaunch, and [more than 25,000 holders had to be migrated](/guides/moving-forward-successful-migration-of-25000-holders-to-v2---a-dehub-milestone-from-q4-2022) to a new contract.

Resuming trading on a major exchange after that is not automatic. A relaunched token is a new contract, and an exchange has to be satisfied that the thing they are listing is what you say it is, that holders have actually moved, and that whatever caused the first failure will not cause a second.

We had one advantage in that conversation: v2 ran on [plain standard ERC-20 tokenomics](/guides/stability-first-adopting-standard-erc20-tokenomics---a-dehub-milestone-from-q4-2022), with nothing in the transfer path. There is very little to explain about a token that does nothing unusual, and that simplicity was worth more in the relisting process than any amount of argument would have been.

### What resuming actually meant

Access, restored. Holders who had used Gate rather than a DEX could trade again. Price discovery was not confined to our own pool. The practical consequences of the freeze were over.

It also closed the loop for a community that had been asked for a lot in a short period — a migration, a relaunch, and a quarter with no functioning market.

### The complicated part

Gate.io is where our [listing agent stole the fundraise and dumped our chart](/guides/trials-and-tribulations-the-gateio-listing-agent-incident---a-dehub-milestone-from-q4-2021) in 2021. Gate investigated, apologised, and could not identify the individual because the records were lost.

Returning to that venue was not a comfortable decision and it is fair to ask why we did.

The answer is that at the beginning of 2023, a meaningful part of our holder base could not practically use a decentralised exchange, and refusing a listing on principle would have punished them rather than anyone responsible. The failure had been an intermediary, not the exchange's order book, and holders needed a market.

### And then we left

Ten months later we [delisted from Gate.io voluntarily](/guides/prioritizing-principles-voluntary-delisting-from-gateio-for-decentralization---a-dehub-milestone-from-q4-2023).

Those two decisions look contradictory and are not. In Q1 2023 our holders needed a functioning market and we did not have the standing to be selective about where. By Q4, the [DEX policy](/guides/open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023) was published, [automated liquidity provision](/guides/smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023) was running, and the on-chain route was good enough that leaving cost holders access rather than depriving them of it.

We kept both posts because the sequence is the point. The right decision in January was not the right decision in October, and pretending we always intended the second one would be a rewrite.

### What a relisting actually costs

More than the fees, and worth knowing if you are ever in this position.

An exchange assessing a relaunched token is doing diligence on the reason you relaunched, which means the failure gets examined in detail by people who are deciding whether to be exposed to you. That process is uncomfortable and it is entirely reasonable.

It also takes time you do not control, during which your community is asking daily when trading resumes and you cannot give a date.

The thing that shortened it for us was having an answer that did not require interpretation: the transfer path is empty, here is the audit, here is the migration record. Simplicity is not just a safety property. It is also considerably easier to explain to someone who has no reason to be generous.`,
  },

  'innovation-recognized-dehub-wins-corporate-livewire-award---a-dehub-milestone-from-q2-2023': {
    excerpt:
      'Most Innovative Company at Corporate Livewire, from a field of 900+ in a vote-based process backed by Sony, Samsung and others.',
    content: `In Q2 2023 DeHub won Most Innovative Company at the UK's Corporate Livewire awards, competing against more than 900 companies in a vote-based system backed by Sony, Samsung and other industry names.

We have written about this [in more detail elsewhere](/guides/award-winning-innovation-dehub-recognised). This entry is about what it meant in the context of that particular year.

### Why the timing mattered

Two quarters earlier, our [contract had malfunctioned and frozen the token](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022). One quarter earlier we had finished [migrating more than 25,000 holders](/guides/moving-forward-successful-migration-of-25000-holders-to-v2---a-dehub-milestone-from-q4-2022) to a new contract and [resumed trading](/guides/back-in-action-dehub-v2-trading-resumes-on-gateio---a-dehub-milestone-from-q1-2023).

Recognition arriving at that point was not vindication of the year we had just had. It was evidence that the thing we were building was still legible from outside a period that, from inside, had mostly consisted of damage control.

That is more useful than it sounds. Teams that have spent six months on recovery lose perspective on whether the underlying idea was ever good. An external judgement, made by people with no stake in our recovery, is a useful correction in both directions.

### What the format was and was not

Being accurate about awards is important, because the crypto industry is thick with paid ones.

This was a vote-based process across a field of more than 900 companies, in a programme whose backers include Sony, Samsung and other established names, and it was not confined to crypto. Being judged against companies from ordinary industries is a more meaningful test than winning a category where the competition is other token projects.

It is also, like all awards, a partial signal. It is not a technical assessment, a security audit or a measure of adoption. We have never presented it as one, and the [Certik audit](/guides/fortifying-our-walls-v1-security-hardened-with-certik-audit---a-dehub-milestone-from-q3-2021), the [transparency reports](/guides/full-disclosure-dehubs-comprehensive-transparency-reports---a-dehub-milestone-from-q4-2023) and [dhbscan.com](/guides/transparency-hub-dhbscancom-launches-for-contract-activity-tracking---a-dehub-milestone-from-q2-2025) exist because those are the things that actually answer those questions.

### What it changed

Practically, it opened conversations. An award from a recognised UK programme is something a partner's compliance team can look at, and it gave us a credential that did not require someone to first understand what a token is.

That helped in exactly the places you would expect — the [partnerships spanning 15 countries](/guides/worldwide-creators-partnerships-spanning-15-countries---a-dehub-milestone-from-q2-2024) established the following year, and the traditional-media and agency relationships the founders were building in parallel.

Internally it mattered for a simpler reason. It was the first genuinely good news the team had received in three quarters.

### On awards generally

The crypto industry has an award problem. A large number of them are paid placements with a trophy attached, and the industry knows it, which devalues the genuine ones by association.

Our position is to name the mechanism whenever we mention one. A vote-based process, a field of more than 900, backers including Sony and Samsung, and not a crypto-specific category — those details are what let a reader decide how much weight to give it, and a project that omits them is usually omitting them for a reason.

We would apply the same standard to anyone else's. If a project mentions an award without saying who ran it, how it was judged and against whom, the safest assumption is that answering those questions would not help them.`,
  },

  'in-the-spotlight-dehub-featured-in-techcrunch-and-venturebeat---a-dehub-milestone-from-q2-2023': {
    excerpt:
      'Coverage in major tech publications. Useful, and a much weaker signal than the industry treats it as.',
    content: `In Q2 2023 DeHub was featured in major technology publications including TechCrunch and VentureBeat.

### Why this is in the archive at all

Because it happened, and because this archive records what happened. It is not, on its own, an achievement in the way the other entries around it are.

Press coverage is an input. It is what you do with the attention that determines whether the coverage mattered, and in our case what we did with it was mostly ordinary: it fed the [partnership conversations](/guides/worldwide-creators-partnerships-spanning-15-countries---a-dehub-milestone-from-q2-2024) that ran through the following year and gave us a set of references that were not self-published.

### What coverage is actually worth

The honest breakdown:

**It is a credibility artefact, not a distribution channel.** Very few users arrive from a technology publication. What coverage does is answer the question a cautious counterparty asks before a call — has anyone outside this company written about them.

**It is durable in a way marketing is not.** A campaign stops working the day you stop paying for it. An article from 2023 is still there in 2026, still surfacing in searches, still doing the same small job.

**It does not survive contact with a bad product.** Coverage accelerates whatever is already true. Projects that were failing and got written up mostly failed faster.

### What we did not conclude

That we were now a serious company because a serious publication had said our name.

We had reason to be careful about this specifically. The most damaging thing that happened to us was a [fraudulent listing agent](/guides/trials-and-tribulations-the-gateio-listing-agent-incident---a-dehub-milestone-from-q4-2021), and the reason that arrangement was made at all was a plausible introduction with credible-looking associations. Reputation by proximity is exactly the mechanism that cost us the fundraise.

So the internal position on press has been consistent since: it is worth having, it is worth being accurate about, and it is not evidence of anything except that somebody wrote something.

### What the same quarter also contained

[The Corporate Livewire award](/guides/innovation-recognized-dehub-wins-corporate-livewire-award---a-dehub-milestone-from-q2-2023), from a field of more than 900 companies, and the start of [patent applications for our streaming and watch-to-earn technology](/guides/protecting-innovation-patent-applications-for-streaming--watch2earn-tech---a-dehub-milestone-from-q2-2023).

Q2 2023 was the quarter DeHub became externally legible after three quarters of recovery work. The coverage was part of that. The award and the patent filings were the parts with substance behind them.

### The trap we watched others fall into

Treating coverage as a growth strategy.

Projects that get a good article frequently respond by pursuing more articles — hiring for it, budgeting for it, structuring announcements around it. The problem is that press has a hard ceiling. There are only so many publications, they will not write about you repeatedly without something new, and the audience they reach is largely the same each time.

Meanwhile the things that actually compound — a product people return to, creators who stay, infrastructure that does not fail — get less attention because they do not produce announceable moments.

We were not immune to this and spent more of late 2023 on visibility than the results justified. The correction shows up in 2024, which is mostly infrastructure and creator work with very little to announce.`,
  },

  'protecting-innovation-patent-applications-for-streaming--watch2earn-tech---a-dehub-milestone-from-q2-2023': {
    excerpt:
      'Patent applications on the streaming and watch-to-earn mechanics — filed by a team that also open-sources, which needs explaining.',
    content: `In Q2 2023 we commenced patent applications covering our core streaming technology and watch-to-earn mechanics.

### The obvious objection

A project built on decentralisation, open protocols and verifiable-by-anyone infrastructure filing patents is a fair thing to raise an eyebrow at. We have raised it internally.

The position we settled on is narrow and worth stating precisely.

### What the applications cover

The specific mechanisms we built — how watch-to-earn is measured and settled, and particular pieces of our streaming implementation. Not the concept of streaming. Not the idea that viewers might earn. Implementations.

### Why file at all

**Defensive priority.** The realistic risk to a small company is not that someone copies you. It is that a much larger company independently patents something you already built, and then asserts it against you. Establishing priority is protection against being locked out of your own work.

**It is what an operating company does.** DeHub sits inside a real corporate structure — [DeLabs LTD was incorporated](/guides/official-standing-delabs-ltd-incorporated---a-dehub-milestone-from-q3-2022) in 2022 with proper compliance, and we hold real registrations. Intellectual property is part of that, and partners and investors ask about it.

**Watch-to-earn was novel enough to be worth it.** By 2023 there was a genuine body of implementation behind it, and it was being widely imitated with varying degrees of honesty. Establishing what we had actually built, and when, had value.

### The tension we accept

Patents are exclusionary by design, and decentralisation is not. That is a real contradiction and we are not going to argue it away.

What we can point to is behaviour. When a group of large holders [forked the DeHub app](/guides/decentralization-in-practice-the-fansite-fork-story---a-dehub-milestone-from-q3-2023) to target the adult market later that same year, we did not obstruct it. We [transferred knowledge and provided technical support to the fork team](/guides/supporting-growth-knowledge-transfer-to-fansite-team---a-dehub-milestone-from-q3-2023), and then wrote a [framework for future community-driven forks](/guides/paving-the-way-framework-for-community-driven-forks---a-dehub-milestone-from-q3-2023).

That was one quarter after these filings and it is the clearest available evidence of how we intend to use them. As it was put at the time: with open-source technology and blockchain industry culture, permissionless innovation matters more than our preferences, and we cannot stop someone forking our app and airdropping our holders — nor should we try.

There is also now an [open-source end-to-end encryption implementation](/guides/privacy-first-open-source-e2ee-dehub) in the platform, which is not the behaviour of a company using IP as a moat.

### The plain version

We filed to avoid being excluded from our own work, not to exclude anyone from theirs. If that ever stops being true, this paragraph should be held against us.

### What we will not do with them

Three commitments, stated so they can be checked against future conduct.

We will not assert them against a community fork of DeHub. That was tested within a quarter of filing and the answer was to help the fork rather than obstruct it.

We will not use them against a project on the basis that it competes with us. Competition is the mechanism by which this industry improves, and a patent used to prevent it is doing the opposite of what we filed for.

We will not acquire patents for the purpose of assertion. Defensive filing on work we actually did is a different activity from building a portfolio to license, and the second one is not a business we intend to be in.`,
  },

  'decentralization-in-practice-the-fansite-fork-story---a-dehub-milestone-from-q3-2023': {
    excerpt:
      'Large holders forked our app to target the adult market. We did not stop them, and could not have. Here is why we think that is correct.',
    content: `In Q3 2023 a group of large, long-term DeHub holders forked the DeHub app to target the adult market. The project was BJ, now fan.site.

This is the most direct test our decentralisation claims have faced, and it did not come from a hostile actor. It came from our own holders.

### What actually happened

Holders with significant positions decided the technology should serve a market DeHub was not going to serve, forked the application, and built a separate product. DeHub stakers were allocated a portion of the fork's token supply through a [partner airdrop](/guides/expanding-horizons-partner-airdrop-for-fansite-bj-fork---a-dehub-milestone-from-q3-2023).

We did not obstruct it. We [transferred knowledge and provided technical support](/guides/supporting-growth-knowledge-transfer-to-fansite-team---a-dehub-milestone-from-q3-2023) to the team building it.

### Why not resist

The honest answer has two halves, and the first is the less flattering one: we could not have. Permissionless technology means nobody needs our approval to fork it. Any resistance would have been theatre, and it would have demonstrated that "decentralised" was a word we used rather than a property we had.

The second half is that we think separation was the right structure independently. Adult content on the main DeHub app would have created genuinely difficult problems around protecting children and the vulnerable, and around users of all faiths and none who do not want that content adjacent to theirs. Separate markets and separate communities is a better arrangement for everyone in it.

That was set out in the whitepaper before any of this happened, and the fork implemented it more cleanly than we could have.

### How we handled the boundary

Deliberately, and with distance. Communications between the two communities were intentionally minimised. There is no cross-promotion. Anyone under 18, or uncomfortable with the adult market for any reason, was told plainly to close the page and wait for the next airdrop.

That is not squeamishness. It is the recognition that the two audiences overlap far less than the token structure implies, and that pretending otherwise serves neither.

### What it demonstrated

Decentralisation is usually discussed as a technical property. In practice it is a governance one, and you only find out whether you have it when someone does something you did not authorise.

Somebody took our work, pointed it at a market we had declined, and distributed value to our holders for doing it. We supported them. That is either what the word means or the word means nothing.

### What we built from it

Rather than treating it as a one-off, we wrote it down: a [framework for future community-driven forks](/guides/paving-the-way-framework-for-community-driven-forks---a-dehub-milestone-from-q3-2023), so the next group does not have to negotiate the same ground from scratch.

The fork went on to [raise $1,000,000 from VCs, launchpads and public sales](/guides/fueling-growth-1m-raised-for-fansite-bj-fork---a-dehub-milestone-from-q1-2024) in Q1 2024. It succeeded on its own terms, in a market we were never going to enter, using technology we built. We consider that a good outcome.

### The question we get asked

Whether DeHub benefits financially from fan.site. It does not. It is a separate company with separate investors, and the [$1,000,000 it raised in Q1 2024](/guides/fueling-growth-1m-raised-for-fansite-bj-fork---a-dehub-milestone-from-q1-2024) went to that company, not to us.

What DeHub holders received was the airdrop, which was the arrangement stated up front.

People find this unsatisfying, on the reasonable grounds that we did the engineering work and someone else raised the money. The response is that this is what permissionless means when it is inconvenient. A fork you get paid for is a licensing deal. A fork you support and receive nothing from, because you cannot prevent it and think preventing it would be wrong, is the actual thing.`,
  },

  'supporting-growth-knowledge-transfer-to-fansite-team---a-dehub-milestone-from-q3-2023': {
    excerpt:
      'We handed engineering knowledge to the team that forked us. The alternative was a worse product carrying our code and our holders.',
    content: `Alongside the [fan.site fork](/guides/decentralization-in-practice-the-fansite-fork-story---a-dehub-milestone-from-q3-2023) in Q3 2023, we ran a deliberate knowledge transfer and provided technical support to the team building it.

### Why help people who forked you

Because the alternative was worse in every direction.

The fork was going to happen with or without us — that is what permissionless means. The only variable was whether the resulting product was built well.

A badly built fork of your codebase is not a neutral outcome. It carries your architecture, your patterns and, in the eyes of anyone looking on, your reputation. If it fails through avoidable engineering mistakes, the failure attaches partly to the technology it came from. And in this case it also carried our holders, who had been [allocated a portion of the supply through a partner airdrop](/guides/expanding-horizons-partner-airdrop-for-fansite-bj-fork---a-dehub-milestone-from-q3-2023) and therefore had a direct stake in it working.

Withholding help would have been petty, ineffective and against the interests of our own community.

### What actually gets transferred

The code was already theirs — that is what a fork is. What was not in the repository was everything that made it usable:

- **Why things are the way they are.** Every codebase carries decisions that look arbitrary and are load-bearing. Reading the code tells you what, not why.
- **The operational knowledge.** Streaming infrastructure is largely a set of failure modes you have already met. Handing over that experience is worth more than any component.
- **The expensive mistakes.** Our [contract malfunction](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022), the [v1 vulnerability](/guides/fortifying-our-walls-v1-security-hardened-with-certik-audit---a-dehub-milestone-from-q3-2021), what we learned about [tax logic in the transfer path](/guides/stability-first-adopting-standard-erc20-tokenomics---a-dehub-milestone-from-q4-2022). Watching someone repeat a failure you have already paid for is a poor use of everyone's time.

### The boundary

Support was engineering, not endorsement. Communications between the two communities stayed intentionally minimal and there was no cross-promotion, for the reasons set out in the fork post. Adult content and the main DeHub platform are separate markets, and the separation only works if it is maintained on both sides.

Helping a team ship well and promoting their product to your audience are different acts. We did the first.

### What it produced

A better-built product in a market we were not going to enter, and a working template for how this goes — which we then wrote down as a [framework for future community-driven forks](/guides/paving-the-way-framework-for-community-driven-forks---a-dehub-milestone-from-q3-2023) in the same quarter.

The fork went on to [raise $1,000,000](/guides/fueling-growth-1m-raised-for-fansite-bj-fork---a-dehub-milestone-from-q1-2024) in Q1 2024. Some of that outcome is attributable to the fact that the team did not spend six months rediscovering things we already knew.

### What we got out of it

More than we expected, and not the thing we expected.

Explaining a system to people who did not build it is the fastest way to find out which parts of it are indefensible. Several decisions in our own codebase survived only because nobody had been made to justify them out loud, and a few did not survive the transfer.

It also produced documentation that did not previously exist. Writing down why the architecture is shaped the way it is, for an external audience, is work that never gets prioritised internally because everyone already knows — right up until the people who know have moved on.

The knowledge transfer improved our own engineering practice more than it cost us in time. That was not the intention and it was the main benefit.`,
  },

  'paving-the-way-framework-for-community-driven-forks---a-dehub-milestone-from-q3-2023': {
    excerpt:
      'After one fork went well, we wrote down how it should go — so the next group is not negotiating from scratch.',
    content: `In Q3 2023, having just been through it, we established a framework for future community-driven forks.

### Why formalise something that worked informally

Because it worked once, with a specific group, under conditions that will not repeat.

The [fan.site fork](/guides/decentralization-in-practice-the-fansite-fork-story---a-dehub-milestone-from-q3-2023) was led by large, long-term holders we knew. Everything was negotiated as it arose. That is fine once and a poor way to run a permissionless system, because the next group will be strangers with a different market and a different level of goodwill, and "it depends who you are" is precisely the property decentralisation is supposed to remove.

A framework written after a good outcome and before a difficult one is worth considerably more than one written during a dispute.

### What it covers

**What a fork can expect from us.** The code is already theirs. The framework sets out what else is available — the [engineering knowledge transfer](/guides/supporting-growth-knowledge-transfer-to-fansite-team---a-dehub-milestone-from-q3-2023) we ran for fan.site, and on what basis.

**Where the boundaries are.** Brand, communications and community are not forked. A fork gets the technology, not our name or our audience. Separation was handled deliberately for fan.site — minimal inter-community communication, no cross-promotion — and that is the default rather than a special case.

**How holders are treated.** Airdrops to DeHub stakers had been part of the model since the first whitepaper in 2021, and the fan.site partner airdrop followed that pattern. Stating the expectation up front is better than leaving each fork to invent its own arrangement.

**What we will not do.** We do not obstruct forks. We also do not endorse them, and we do not carry responsibility for what they become.

### The part that is genuinely difficult

A fork can do something we would not do. That is not a bug in the arrangement — it is the arrangement. Deciding in advance where support ends is much easier than deciding it once a specific project has done something specific that you dislike.

Writing it down before that happens is the only version that has any integrity, because a rule invented in response to a case you object to is not a rule.

### Where this sits

It follows the same pattern as everything else in this archive that worked: publish the rule first, apply it mechanically, and remove the need to trust our judgement in the moment. That is the reasoning behind [provably fair randomisation](/guides/fair-play-provably-fair-randomization-in-dehub-games---a-dehub-milestone-from-q4-2021), the [published DEX policy](/guides/open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023) and the snapshot rules attached to every airdrop we have run.

A framework for forks is the same idea applied to governance. As we put it at the time: we may not always agree with every industry, but we cannot stop someone forking our app and airdropping our holders. Given that, the only question is whether it happens under stated terms or improvised ones.

### What it does not do

It does not make a fork our responsibility, and it does not make one our endorsement.

That distinction is doing a lot of work and it will eventually be tested by a fork we would rather not be associated with. When that happens, the framework is what stops the response from being improvised — support is engineering, the boundary is brand and community, and neither expands or contracts based on how we feel about a particular project.

It also does not oblige us to airdrop anyone. Fork teams decide what they distribute and to whom. The pattern set by [fan.site](/guides/expanding-horizons-partner-airdrop-for-fansite-bj-fork---a-dehub-milestone-from-q3-2023) is an expectation the ecosystem has inherited, not a rule we can enforce on somebody else's token.`,
  },

  'prioritizing-principles-voluntary-delisting-from-gateio-for-decentralization---a-dehub-milestone-from-q4-2023': {
    excerpt:
      'We asked to be delisted. Projects do not usually do that, and the reasoning was practical as well as ideological.',
    content: `In Q4 2023 we voluntarily delisted DHB from Gate.io.

Projects work for years to get a centralised listing. Leaving one by choice is unusual enough that it deserves a proper explanation.

### The immediate trigger

Gate.io ended UK support.

That is the specific event, and it matters because a UK-registered project with a large UK community does not have a functioning relationship with an exchange its own users cannot access. Alongside it, our multi-million dollar liquidity pool had been drained by arbitrage bots and other questionable activity for years, which forced a broader decision about where DHB should trade at all.

### The practical reason first

Our history with centralised intermediation is not good.

In Q4 2021 our [listing agent took the fundraise and dumped into our chart](/guides/trials-and-tribulations-the-gateio-listing-agent-incident---a-dehub-milestone-from-q4-2021) instead of airdropping Gate users as agreed. Gate investigated, apologised, and could not identify the individual because the records were lost. Our recourse ended there.

That experience is not an argument against exchanges as such. It is an argument about verifiability. The entire failure occurred in a process with no public record, involving a party we could not audit, and it ended with "the records are gone".

Everything we had spent years building — [provably fair draws](/guides/fair-play-provably-fair-randomization-in-dehub-games---a-dehub-milestone-from-q4-2021), [on-chain leaderboards](/guides/on-chain-glory-blockchain-leaderboards-and-rewards-in-dehub-arcade---a-dehub-milestone-from-q1-2022), published snapshots — was aimed at removing exactly that class of problem from our own operations. Continuing to route a large part of our market through a process with the opposite property was inconsistent.

### The timing

We had [resumed trading on Gate.io in Q1 2023](/guides/back-in-action-dehub-v2-trading-resumes-on-gateio---a-dehub-milestone-from-q1-2023) after the v2 relaunch, because at that point a meaningful part of our holder base had no practical route to a decentralised exchange and needed a functioning market.

By Q4 that had changed. [Automated liquidity provision](/guides/smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023) was running, our [DEX policy was published](/guides/open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023), and on-chain depth was good enough that leaving was a choice about principle rather than a decision to strand people.

The order matters. We built the alternative first and left second. Doing it the other way round would have been a gesture at our holders' expense.

### What it cost

Real things, and we knew it:

- **Access** for users who prefer or require a centralised venue.
- **Visibility.** Exchange listings are a discovery surface, and leaving one removes you from it.
- **Perceived legitimacy.** A section of the market reads a delisting as a negative signal regardless of who initiated it, and no announcement fully corrects that.

### Why we did it anyway

Because we are asking people to use a platform whose central claim is that you do not have to trust the operator. That claim is weakened every time the most important parts of our own operation happen somewhere unverifiable.

It also simplified something. There is no ambiguity now about where DHB trades or under what conditions, and no counterparty in the middle whose conduct we cannot audit.

Two and a half years on, that is still the position. Whether it was the commercially optimal call is arguable. It is the one consistent with everything else in this archive.

### The objection worth taking seriously

That decentralised exchanges are not actually more trustworthy — they have their own failure modes, and a user losing funds to a malicious contract or a bad approval has no recourse at all.

That is true and we would not argue otherwise. The distinction is not that on-chain venues are safe. It is that they are inspectable: the code is readable, the transactions are public, and a failure produces evidence rather than an apology and a note about missing records.

Recourse and verifiability are different properties. Centralised venues offer more of the first and almost none of the second. Given our specific history, we weight the second more heavily — but a holder who weights recourse higher is making a defensible choice, and we would rather say so than pretend the trade-off does not exist.`,
  },

  'open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023': {
    excerpt:
      'A published, specific DEX policy — written so that the next person handling treasury cannot quietly do something different.',
    content: `In Q4 2023 we implemented and published a DEX policy alongside a broader transparency commitment.

### Why a written policy

Because the alternative is discretion, and discretion is unverifiable.

Every project makes decisions about liquidity, treasury movements and market operations. Most make them privately and describe them afterwards, which means the community's only options are to trust the description or not.

A published policy converts those decisions into something checkable. If the policy says what happens under given conditions, and the chain shows what actually happened, anyone can compare the two. That is a materially different relationship from "we act in the community's interest", which is unfalsifiable by construction.

### What it had to be to be worth anything

Specific. A transparency commitment that commits to being transparent is decoration.

The useful version states what will be done, under what conditions, and where the resulting activity can be observed. Vague policies survive contact with an awkward situation by being reinterpreted, which is the failure mode they are supposed to prevent.

### What it covers

Broadly: how liquidity is managed, what treasury operations are permitted and how they are disclosed, and what gets published as a matter of course rather than on request.

It sat directly alongside the [automated liquidity provision strategies](/guides/smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023) shipped in the same quarter. That pairing was deliberate — automation without a stated policy is just a different opaque process, and a policy without automation depends on somebody remembering to follow it.

### The context it came out of

The same quarter we [voluntarily delisted from Gate.io](/guides/prioritizing-principles-voluntary-delisting-from-gateio-for-decentralization---a-dehub-milestone-from-q4-2023), and the same year we published [comprehensive transparency reports](/guides/full-disclosure-dehubs-comprehensive-transparency-reports---a-dehub-milestone-from-q4-2023).

Those three are one decision expressed three ways: move the important parts of the operation onto surfaces where they can be checked. It traces back to a [listing agent whose conduct we could not audit and whose records were lost](/guides/trials-and-tribulations-the-gateio-listing-agent-incident---a-dehub-milestone-from-q4-2021), and to a [contract malfunction](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022) that holders had to absorb.

### What a policy does that a promise does not

It survives the people who wrote it.

Promises are personal. The person who made the commitment leaves, the context shifts, and the promise quietly stops binding anyone. A published policy is a standard the project can be held to by people who were not in the room, including people who join later and inherit the operation.

That was the actual point. Not to prove our current intentions, which nobody can verify anyway, but to constrain future conduct in a way that does not depend on who is doing it.

The line continues into [dhbscan.com](/guides/transparency-hub-dhbscancom-launches-for-contract-activity-tracking---a-dehub-milestone-from-q2-2025), which by 2025 made contract activity checkable by anyone without reading a policy at all.

### The weakness of policies

Almost nobody reads them.

That is not cynicism about our community, it is an accurate description of how people engage with documents. A published policy is read carefully by a handful of people, referenced during a controversy, and otherwise sits unvisited.

Which means a policy on its own protects the diligent minority and nobody else. Its real function is to exist so that the diligent minority can check and report, and so that a future version of this company cannot quietly do something different without a written standard to violate.

The stronger version is a tool that makes the check trivial rather than possible, which is what dhbscan eventually was. A policy is the commitment; the tool is what makes the commitment operational for people who will never read it.`,
  },

  'smarter-liquidity-automated-liquidity-provision-on-dexs---a-dehub-milestone-from-q4-2023': {
    excerpt:
      'Liquidity management moved out of the contract and into a rules-based process — the opposite of where it lived when it broke everything.',
    content: `In Q4 2023 we implemented automated liquidity provision strategies across decentralised exchanges.

### Where liquidity management used to live

Inside the token contract. That is what tax-based tokenomics were — a percentage of each transaction diverted automatically, including into liquidity, executed in the transfer path on every transaction.

Then [ours malfunctioned and froze the token and the pool together](/guides/the-unforeseen-navigating-a-contract-malfunction-and-v2-relaunch---a-dehub-milestone-from-q4-2022), and we [moved to plain standard ERC-20](/guides/stability-first-adopting-standard-erc20-tokenomics---a-dehub-milestone-from-q4-2022) with nothing in the transfer path at all.

That was the correct fix and it left a gap. Automatic liquidity growth was a genuine benefit of the old design, and removing the mechanism did not remove the need.

### What replaced it

Rules-based provision operating outside the contract.

The distinction is the whole point. Contract-level automation is immutable, runs on every transaction, and cannot be corrected when conditions change. External automation follows a defined strategy, can be adjusted as markets move, and — critically — cannot freeze anyone's tokens if it misbehaves. The failure mode of a bad liquidity strategy is a bad liquidity position. The failure mode of bad transfer-path logic was 25,000 holders locked out of their own assets.

Same objective. Radically different blast radius.

### Why automate rather than manage by hand

Discretionary liquidity management has two problems. It is slow, because it depends on someone being awake and paying attention. And it is unaccountable, because every decision can be explained after the fact.

A defined strategy fixes both. It responds at machine speed, and because it was [published as policy](/guides/open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023) in the same quarter, its behaviour can be checked against the chain by anyone who wants to.

That pairing was deliberate. Automation without a stated policy is just a faster opaque process.

### What it enabled

It is the reason [leaving Gate.io voluntarily](/guides/prioritizing-principles-voluntary-delisting-from-gateio-for-decentralization---a-dehub-milestone-from-q4-2023) was possible in the same quarter without stranding holders.

Delisting only works if the on-chain market is genuinely usable — sufficient depth, tolerable slippage, reliable pricing. Those are the properties liquidity provision produces. Announcing the delisting first and hoping depth appeared would have been the reverse of responsible.

### Where it went next

The same infrastructure carried DHB's expansion across chains: [Ethereum mainnet in Q1 2024](/guides/expanding-reach-dhb-lists-on-ethereum-mainnet---a-dehub-milestone-from-q1-2024), [sDHB on Base](/guides/layer-2-expansion-sdhb-lists-on-base---a-dehub-milestone-from-q2-2024) that summer, and eventually the [decision to discontinue Ethereum mainnet support](/guides/strategic-shift-discontinuing-ethereum-mainnet-support-for-dhb---a-dehub-milestone-from-q1-2025) and concentrate where users actually were.

Each of those is a liquidity decision as much as a technical one, and each was possible because provision had become a process rather than a property of the token.

### What automation does not fix

Depth still has to be funded, and no strategy creates liquidity that is not there.

Automation decides how capital is deployed, rebalanced and defended. It does not decide how much capital exists, and a sophisticated strategy running on insufficient depth produces an efficiently managed thin pool.

That is worth saying because "automated liquidity" is frequently presented as though the mechanism were the substance. It is not. The substance is treasury allocation, which is a deliberate decision made by people, disclosed under the [DEX policy](/guides/open-and-clear-dex-policy-implementation-and-transparency-commitment---a-dehub-milestone-from-q4-2023), and visible on-chain.

The automation's contribution is that the decision stops being re-made informally every week by whoever happens to be watching the market.`,
  },
};
