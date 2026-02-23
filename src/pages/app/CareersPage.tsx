/**
 * Careers Page (In-App)
 * =====================
 * Native-feeling careers page rendered inside the app layout
 * with persistent sidebars. Reuses job listing content from
 * the standalone JobsPage but adapted for the middle panel.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Briefcase, Users, MapPin, Clock, DollarSign,
  Send, Loader2, ExternalLink, ChevronUp, Target, Handshake,
  Globe, TrendingUp, Megaphone, Heart, Sparkles, CheckCircle2,
} from 'lucide-react';
import careersIcon from '@/assets/dehub-logo-white.png';

/* ─── Reusable sub-components ─── */

function Tag({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300">
      {icon}
      {label}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-white font-semibold text-sm mb-2.5">{title}</h3>
      <div className="text-zinc-400 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function BulletItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-zinc-400 text-sm leading-relaxed">
      <span className="text-zinc-500 mt-0.5 shrink-0">{icon}</span>
      {text}
    </li>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-zinc-300 text-sm">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

interface BDMFormData {
  name: string;
  email: string;
  telegram: string;
  twitter: string;
  instagram: string;
  linkedin: string;
  other_socials: string;
  past_experience: string;
  why_hire_you: string;
}

const initialBDMForm: BDMFormData = {
  name: '', email: '', telegram: '', twitter: '',
  instagram: '', linkedin: '', other_socials: '',
  past_experience: '', why_hire_you: '',
};

export default function CareersPage() {
  const navigate = useNavigate();
  const [bdmFormOpen, setBdmFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<BDMFormData>(initialBDMForm);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBDMSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('job_applications').insert({
        role: 'Business Development Manager',
        name: formData.name.trim(),
        email: formData.email.trim(),
        telegram: formData.telegram.trim() || null,
        twitter: formData.twitter.trim() || null,
        instagram: formData.instagram.trim() || null,
        linkedin: formData.linkedin.trim() || null,
        other_socials: formData.other_socials.trim() || null,
        past_experience: formData.past_experience.trim() || null,
        why_hire_you: formData.why_hire_you.trim() || null,
      });
      if (error) throw error;
      toast.success("Application submitted successfully! We'll be in touch.");
      setFormData(initialBDMForm);
      setBdmFormOpen(false);
    } catch (error) {
      console.error('Error submitting application:', error);
      toast.error('Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header bento */}
      <div className="rounded-2xl p-4 sm:p-6 mb-4 bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent backdrop-blur-xl border border-white/[0.08]">
        <div className="flex items-center gap-3 mb-3">
          <img src={careersIcon} alt="Careers" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-xl font-bold text-white">Careers at DeHub</h1>
            <p className="text-zinc-500 text-sm">Join the team building the future of decentralised social media</p>
          </div>
        </div>

        <p className="text-zinc-300 text-sm leading-relaxed">
          We're looking for passionate individuals who want to be part of the next wave of social media —
          one that puts creators and communities first. All roles are <span className="text-white font-medium">fully remote</span> with
          <span className="text-white font-medium"> flexible hours</span>.
        </p>
      </div>

      {/* Job Listings */}
      <div className="space-y-4">

        {/* ─── BDM Role ─── */}
        <div className="rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-[24px] p-3 overflow-hidden">
          <div className="p-3">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h2 className="text-lg font-bold text-white">Business Development Managers</h2>
                <p className="text-zinc-400 text-xs mt-0.5">Partnerships & Growth</p>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap bg-gradient-to-br from-white/15 via-white/8 to-white/3 backdrop-blur-xl border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.3)] text-emerald-400">
                Open
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              <Tag icon={<DollarSign className="w-3.5 h-3.5" />} label="Negotiable Salary + OTE Commission" />
              <Tag icon={<Clock className="w-3.5 h-3.5" />} label="Flexible Hours" />
              <Tag icon={<MapPin className="w-3.5 h-3.5" />} label="Fully Remote" />
            </div>

            <Section title="About the Role">
              <p>
                As one of our Business Development Managers at DeHub, you will be part of the driving force behind our partnership
                strategy. Your mission is to identify, engage, and close deals with companies across both Web2
                and Web3 — from gaming studios and content platforms to blockchain projects and DeFi protocols.
                This is an OTE (On-Target Earnings) commission-based position: the harder you hustle, the more you earn.
                The role is simple, bring on companies, projects, communities or any large profile accounts on to DeHub, and get paid.
              </p>
            </Section>

            <Section title="Key Responsibilities">
              <ul className="space-y-2.5">
                <BulletItem icon={<Handshake className="w-4 h-4" />} text="Identify and secure strategic partnerships with Web2 and Web3 companies that align with DeHub's mission" />
                <BulletItem icon={<Target className="w-4 h-4" />} text="Build and manage a pipeline of prospective partners, sponsors, and integration opportunities" />
                <BulletItem icon={<Globe className="w-4 h-4" />} text="Represent DeHub at industry events, conferences, and virtual summits" />
                <BulletItem icon={<TrendingUp className="w-4 h-4" />} text="Negotiate partnership terms, revenue-sharing models, and co-marketing agreements" />
                <BulletItem icon={<Sparkles className="w-4 h-4" />} text="Collaborate with the product and marketing teams to develop joint campaigns and integrations" />
              </ul>
            </Section>

            <Section title="What We're Looking For">
              <ul className="space-y-2.5">
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Proven experience in business development, partnerships, or sales within tech, gaming, or Web3" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Strong existing network in the crypto/Web3 or creator economy space is a huge plus" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Excellent communication and negotiation skills — you can close deals and build lasting relationships" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Self-motivated and comfortable working autonomously in a remote-first environment" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Genuine interest in decentralised social media, NFTs, or blockchain technology" />
              </ul>
            </Section>

            <Section title="Compensation">
              <p>
                This role offers a <span className="text-white font-medium">negotiable base salary</span> plus
                an <span className="text-white font-medium">uncapped OTE commission structure</span> tied directly
                to the partnerships you bring in. Top performers have unlimited earning potential.
              </p>
            </Section>

            <Button
              onClick={() => setBdmFormOpen(!bdmFormOpen)}
              variant="glass"
              className="w-full rounded-xl font-semibold h-11 mt-2"
            >
              {bdmFormOpen ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  Close Application
                </>
              ) : (
                <>
                  <Briefcase className="w-4 h-4 mr-2" />
                  Apply as BDM
                </>
              )}
            </Button>
          </div>

          {/* BDM Application Form */}
          {bdmFormOpen && (
            <form onSubmit={handleBDMSubmit} className="border-t border-white/[0.08] p-4 space-y-5">
              <h3 className="text-white font-semibold text-sm mb-1">Your Application</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Full Name" required>
                  <Input name="name" placeholder="Jane Smith" value={formData.name} onChange={handleChange} required maxLength={100} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
                <FormField label="Email" required>
                  <Input name="email" type="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} required maxLength={255} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Telegram">
                  <Input name="telegram" placeholder="@username" value={formData.telegram} onChange={handleChange} maxLength={100} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
                <FormField label="X (Twitter)">
                  <Input name="twitter" placeholder="@username" value={formData.twitter} onChange={handleChange} maxLength={100} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Instagram">
                  <Input name="instagram" placeholder="@username" value={formData.instagram} onChange={handleChange} maxLength={100} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
                <FormField label="LinkedIn">
                  <Input name="linkedin" placeholder="linkedin.com/in/you" value={formData.linkedin} onChange={handleChange} maxLength={255} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
              </div>
              <FormField label="Other Socials">
                <Input name="other_socials" placeholder="TikTok, YouTube, Discord, etc." value={formData.other_socials} onChange={handleChange} maxLength={500} className="bg-white/5 border-white/10 text-white rounded-xl" />
              </FormField>
              <FormField label="Past Experience">
                <Textarea name="past_experience" placeholder="Tell us about your relevant BD, partnerships, or sales experience..." value={formData.past_experience} onChange={handleChange} maxLength={2000} className="bg-white/5 border-white/10 text-white min-h-[120px] rounded-xl" />
              </FormField>
              <FormField label="Why should we hire you?">
                <Textarea name="why_hire_you" placeholder="What makes you the right person for this role?" value={formData.why_hire_you} onChange={handleChange} maxLength={2000} className="bg-white/5 border-white/10 text-white min-h-[120px] rounded-xl" />
              </FormField>
              <Button type="submit" disabled={isSubmitting} variant="glass" className="w-full h-12 rounded-xl font-semibold">
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" />Submit Application</>
                )}
              </Button>
            </form>
          )}
        </div>

        {/* ─── Brand Ambassador Role ─── */}
        <div className="rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-[24px] p-3">
          <div className="p-3">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h2 className="text-lg font-bold text-white">Brand Ambassador</h2>
                <p className="text-zinc-400 text-xs mt-0.5">Community & Evangelism</p>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap bg-gradient-to-br from-white/15 via-white/8 to-white/3 backdrop-blur-xl border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.3)] text-emerald-400">
                Open
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              <Tag icon={<DollarSign className="w-3.5 h-3.5" />} label="Negotiable Monthly Salary" />
              <Tag icon={<Clock className="w-3.5 h-3.5" />} label="Flexible Hours" />
              <Tag icon={<MapPin className="w-3.5 h-3.5" />} label="Fully Remote" />
            </div>

            <Section title="About the Role">
              <p>
                As a DeHub Brand Ambassador you are the face and voice of the platform in your community.
                Your job is to spread the word about DeHub across every channel you touch — social media,
                IRL meetups, gaming events, university campuses, and beyond. This is a paid monthly salary role,
                not commission-based; you'll earn a consistent income while growing alongside the platform.
              </p>
            </Section>

            <Section title="Key Responsibilities">
              <ul className="space-y-2.5">
                <BulletItem icon={<Megaphone className="w-4 h-4" />} text="Create and share authentic content about DeHub across your personal social channels" />
                <BulletItem icon={<Heart className="w-4 h-4" />} text="Actively engage with the DeHub community on the app — post, comment, and interact with other users" />
                <BulletItem icon={<Globe className="w-4 h-4" />} text="Attend and represent DeHub at real-life events, meetups, and conferences in your area" />
                <BulletItem icon={<Users className="w-4 h-4" />} text="Onboard new users and creators to the platform through your personal network" />
                <BulletItem icon={<Sparkles className="w-4 h-4" />} text="Provide feedback and ideas from the community to help shape the product roadmap" />
              </ul>
            </Section>

            <Section title="What We're Looking For">
              <ul className="space-y-2.5">
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Active social media presence with genuine engagement (follower count matters less than authenticity)" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Passion for Web3, crypto, gaming, or creator culture" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Strong communication skills and ability to explain complex concepts simply" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Self-starter who can plan and execute campaigns independently" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Previous ambassador, influencer, or community management experience is a bonus" />
              </ul>
            </Section>

            <Section title="Compensation">
              <p>
                Brand Ambassadors receive a <span className="text-white font-medium">negotiable monthly salary</span> paid
                consistently. Additional bonuses may be awarded based on campaign performance, user sign-ups,
                and community growth milestones.
              </p>
            </Section>

            <Button
              onClick={() => navigate('/creators')}
              variant="glass"
              className="w-full rounded-xl font-semibold h-11 mt-2"
            >
              <Users className="w-4 h-4 mr-2" />
              Apply as Brand Ambassador
              <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-50" />
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-zinc-500 text-xs">
          Don't see a role that fits? Reach out to us on{' '}
          <a href="mailto:dev@dehub.io" className="text-zinc-300 underline underline-offset-2 hover:text-white transition-colors">
            dev@dehub.io
          </a>
        </p>
      </div>
    </div>
  );
}
