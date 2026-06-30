import { Link } from 'react-router-dom';
import { Check, Crown, Sparkles, Users, Zap, Shield, PlayCircle, ImageIcon, Video, MessageSquare, Palette, Eye, Lock, Rocket, Infinity as InfinityIcon } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const EXTRA_PERKS = [
  { icon: Shield, label: 'Ad-free feed', detail: 'No promoted posts, no upgrade banners' },
  { icon: PlayCircle, label: 'Background playback', detail: 'Audio & video keep going with screen off' },
  { icon: Crown, label: 'Animated Extra badge', detail: 'Plus gradient username + 3 profile themes' },
  { icon: Palette, label: 'Custom themes', detail: 'Pick from curated themes — soon, build your own with a simple text-based theme builder' },
  { icon: Eye, label: 'Profile insights', detail: 'See who visits your profile and when' },
  { icon: Lock, label: '10 exclusive sneak peeks / mo', detail: 'Peek into gated content feeds you don\'t hold' },
  { icon: Rocket, label: 'Timeline boost', detail: 'Your posts get seen by more of the right people' },
  { icon: MessageSquare, label: '500 Assistant messages / mo', detail: '10× the free tier' },
  { icon: ImageIcon, label: '150 AI images / mo', detail: 'All models, all styles' },
  { icon: Video, label: '20 seconds of AI video / mo', detail: 'Generate clips for posts & shorts' },
];

const FAMILY_PERKS = [
  { icon: Users, label: 'Up to 5 @usernames', detail: 'Invite anyone on DeHub' },
  { icon: Zap, label: 'Full Extra perks per seat', detail: 'Each member gets their own quotas' },
  { icon: Shield, label: 'One bill, one plan', detail: 'Owner manages seats from Settings' },
];

const XL_PERKS = [
  { icon: Users, label: 'Up to 20 @usernames', detail: 'Bring the whole crew, studio or DAO' },
  { icon: Rocket, label: 'Maximum timeline boosts', detail: 'Everything on acid — top placement priority' },
  { icon: InfinityIcon, label: 'Sky-high AI limits', detail: '5,000 Assistant msgs, 1,500 images, 5 min of AI video / mo' },
  { icon: Lock, label: 'Unlimited sneak peeks', detail: 'Peek into every gated feed, no monthly cap' },
  { icon: Palette, label: 'All themes + early access', detail: 'Every custom theme, first dibs on the theme builder' },
  { icon: Eye, label: 'Pro profile insights', detail: 'Full visitor history, sources and trends' },
];


const FAQS = [
  {
    q: 'What counts as an ad on DeHub?',
    a: 'Promoted posts in your feed, upgrade banners, and sponsored placements in Explore. Premium removes all of them.',
  },
  {
    q: 'Can I switch between Extra and Family?',
    a: 'Yes. Upgrade or downgrade any time — billing pro-rates automatically.',
  },
  {
    q: 'How do family seats work?',
    a: 'The owner invites up to 5 DeHub usernames. Each member keeps their own account, badges, and quotas — nothing is pooled or shared.',
  },
  {
    q: "I'm a top-tier staker. Do I still pay?",
    a: 'No. Top 7 staking tiers get DeHub Extra free. Top 4 tiers get DeHub Family free. Unstake and the perks lift — restake and they come back.',
  },
  {
    q: 'Can I pay in DHB?',
    a: 'Card payments at launch. DHB payment is coming soon and will include a discount.',
  },
];

function GlassCard({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <div
      className={[
        'relative rounded-2xl bg-black/60 backdrop-blur-[24px] border p-6 sm:p-8',
        highlight ? 'border-white/30 shadow-[0_0_60px_-20px_rgba(255,255,255,0.25)]' : 'border-white/10',
      ].join(' ')}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white text-black text-[11px] font-semibold tracking-wide uppercase">
          Best value
        </div>
      )}
      {children}
    </div>
  );
}

function PerkRow({ icon: Icon, label, detail }: { icon: React.ElementType; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs text-zinc-400">{detail}</div>
      </div>
    </li>
  );
}

export default function Premium() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <SEOHead
        title="DeHub Premium — Extra & Family plans"
        description="Go ad-free, unlock background playback, get a Premium badge and more AI. DeHub Extra $4.99/mo, Family $11.99/mo. Free for top-tier stakers."
        url="https://dehub.io/premium"
      />

      {/* Ambient backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[1200px] h-[1200px] rounded-full bg-white/[0.04] blur-3xl" />
        <div className="absolute bottom-[-30%] right-[-10%] w-[800px] h-[800px] rounded-full bg-white/[0.03] blur-3xl" />
      </div>

      {/* Top nav */}
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-black/40 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="text-sm font-semibold tracking-tight text-white">DeHub</Link>
          <Link
            to="/app"
            className="text-xs text-zinc-300 hover:text-white transition-colors"
          >
            Open app →
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300 mb-6">
          <Sparkles className="w-3.5 h-3.5" /> Introducing DeHub Premium
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
          Less noise.<br />
          <span className="bg-gradient-to-r from-white via-white/80 to-white/40 bg-clip-text text-transparent">
            More you.
          </span>
        </h1>
        <p className="mt-5 text-zinc-400 max-w-xl mx-auto text-base sm:text-lg">
          Ad-free DeHub, background playback, a Premium badge, and more AI — for a couple of bucks a month.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <a
            href="#tiers"
            className="px-6 py-3 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            Get DeHub Extra
          </a>
          <a
            href="#tiers"
            className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            Compare Family
          </a>
        </div>
        <p className="mt-5 text-xs text-zinc-500">
          Already a top-tier staker? <Link to="/app/stake" className="underline underline-offset-2 hover:text-white">It's on us.</Link>
        </p>
      </section>

      {/* Tiers */}
      <section id="tiers" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid md:grid-cols-3 gap-5">
        {/* Extra */}
        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-4 h-4 text-white" />
            <h2 className="text-lg font-semibold">DeHub Extra</h2>
          </div>
          <p className="text-sm text-zinc-400">For single users who want the full DeHub, cleaner.</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-bold">$4.99</span>
            <span className="text-zinc-400 text-sm">/ month</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Free for Top 7 staking tiers</p>
          <ul className="mt-6 space-y-3">
            {EXTRA_PERKS.map((p) => <PerkRow key={p.label} {...p} />)}
          </ul>
          <a
            href="/app/settings#premium"
            className="mt-7 block text-center px-5 py-3 rounded-2xl bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15 transition-colors"
          >
            Get Extra
          </a>
        </GlassCard>

        {/* Family */}
        <GlassCard highlight>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-white" />
            <h2 className="text-lg font-semibold">DeHub Family</h2>
          </div>
          <p className="text-sm text-zinc-400">Premium for you and up to 5 people you choose.</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-bold">$11.99</span>
            <span className="text-zinc-400 text-sm">/ month</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Free for Top 4 staking tiers</p>

          <div className="mt-6 rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-zinc-300">
            Everything in <span className="text-white font-medium">Extra</span>, for up to 5 @usernames. Each seat gets their own quotas.
          </div>

          <ul className="mt-5 space-y-3">
            {FAMILY_PERKS.map((p) => <PerkRow key={p.label} {...p} />)}
          </ul>
          <a
            href="/app/settings#premium"
            className="mt-7 block text-center px-5 py-3 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            Get Family
          </a>
        </GlassCard>

        {/* Extra Large */}
        <GlassCard>
          <div className="flex items-center gap-2 mb-2">
            <Rocket className="w-4 h-4 text-white" />
            <h2 className="text-lg font-semibold">DeHub Extra Large</h2>
          </div>
          <p className="text-sm text-zinc-400">All perks on acid. For studios, DAOs and power users.</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-bold">$50.00</span>
            <span className="text-zinc-400 text-sm">/ month</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Free for Top 2 staking tiers</p>

          <div className="mt-4 rounded-xl bg-white/10 border border-white/25 p-3 text-xs text-white">
            <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-[10px] text-white/80 mb-1">
              <Sparkles className="w-3 h-3" /> First 50 subscribers only
            </div>
            100% token cashback — get <span className="font-semibold">$50 in DHB tokens</span> back every month you're subscribed.
          </div>


          <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-zinc-300">
            Everything in <span className="text-white font-medium">Family</span>, expanded to up to 20 @usernames with maxed-out AI and boosts.
          </div>


          <ul className="mt-5 space-y-3">
            {XL_PERKS.map((p) => <PerkRow key={p.label} {...p} />)}
          </ul>
          <a
            href="/app/settings#premium"
            className="mt-7 block text-center px-5 py-3 rounded-2xl bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15 transition-colors"
          >
            Get Extra Large
          </a>
        </GlassCard>
      </section>


      {/* Deep-dive perks */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 space-y-12">
        {[
          {
            icon: Shield,
            title: 'Ad-free, distraction-free',
            body: 'Strip out every promoted post, every upgrade banner, every sponsored slot in Explore. Just the people and creators you actually came for.',
          },
          {
            icon: PlayCircle,
            title: 'Background play, finally',
            body: 'Lock your phone, switch apps, jump tabs — your video and music keep playing. Treat DeHub like the media app it is.',
          },
          {
            icon: Sparkles,
            title: 'AI you can actually rely on',
            body: '500 Assistant messages, 150 AI images, and 20 seconds of generated video every month. Enough to build, ship and post — not a teaser.',
          },
        ].map((b, i) => (
          <div
            key={b.title}
            className={[
              'grid md:grid-cols-[80px_1fr] gap-5 items-start',
              i % 2 === 1 ? 'md:[direction:rtl]' : '',
            ].join(' ')}
          >
            <div className="md:[direction:ltr] w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <b.icon className="w-7 h-7 text-white" />
            </div>
            <div className="md:[direction:ltr]">
              <h3 className="text-2xl font-semibold tracking-tight">{b.title}</h3>
              <p className="mt-2 text-zinc-400 leading-relaxed max-w-xl">{b.body}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Staker reward */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 p-6 sm:p-10 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-zinc-400 mb-3">
            <Crown className="w-3.5 h-3.5" /> A thank-you to our stakers
          </div>
          <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Stake DHB. Get Premium.
          </h3>
          <p className="mt-3 text-zinc-400 max-w-lg mx-auto text-sm sm:text-base">
            Top 7 staking tiers unlock <span className="text-white">DeHub Extra</span> automatically.
            Top 4 tiers unlock <span className="text-white">DeHub Family</span>. No card needed.
          </p>
          <Link
            to="/app/stake"
            className="inline-block mt-6 px-5 py-3 rounded-2xl bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15 transition-colors"
          >
            View staking tiers
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h3 className="text-2xl font-semibold tracking-tight text-center mb-8">Questions</h3>
        <Accordion type="single" collapsible className="space-y-2">
          {FAQS.map((f, i) => (
            <AccordionItem
              key={f.q}
              value={`faq-${i}`}
              className="rounded-xl bg-white/[0.03] border border-white/10 px-4"
            >
              <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-zinc-400 leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Footer CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 p-8 sm:p-12 text-center">
          <h3 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Ready when you are.
          </h3>
          <p className="mt-3 text-zinc-400 text-sm sm:text-base">
            $4.99 to clean it up. $11.99 to bring the family. Cancel any time.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            <a
              href="/app/settings#premium"
              className="px-6 py-3 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
            >
              Try DeHub Extra
            </a>
            <a
              href="#tiers"
              className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold hover:bg-white/10 transition-colors"
            >
              Compare Family
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-500">
        © DeHub. Premium pricing and limits may change.
      </footer>
    </div>
  );
}
