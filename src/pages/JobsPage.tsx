import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ArrowLeft, Briefcase, Users, MapPin, Clock, DollarSign,
  Send, Loader2, ExternalLink, ChevronUp, Target, Handshake,
  Globe, TrendingUp, Megaphone, Heart, Sparkles, CheckCircle2,
} from 'lucide-react';
import dehubLogo from '@/assets/dehub-logo-white.png';

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
  name: '',
  email: '',
  telegram: '',
  twitter: '',
  instagram: '',
  linkedin: '',
  other_socials: '',
  past_experience: '',
  why_hire_you: '',
};

export default function JobsPage() {
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
      const { error } = await supabase
        .from('job_applications')
        .insert({
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

      toast.success('Application submitted successfully! We\'ll be in touch.');
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
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background particles */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              backgroundColor: `rgba(255, 255, 255, ${0.03 + Math.random() * 0.05})`,
            }}
          />
        ))}
      </div>

      <div className="max-w-[59rem] mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="rounded-xl hover:bg-white/10 text-white shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="text-center sm:text-left flex-1">
            <h1 className="text-2xl font-bold">Careers at DeHub</h1>
            <p className="text-zinc-500 text-sm">Join the team building the future of decentralised social media</p>
          </div>
        </div>

        {/* Intro section */}
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6 mb-8">
          <p className="text-zinc-300 text-sm leading-relaxed">
            We're looking for passionate individuals who want to be part of the next wave of social media — 
            one that puts creators and communities first. All roles are <span className="text-white font-medium">fully remote</span> with 
            <span className="text-white font-medium"> flexible hours</span>, giving you the freedom to work from anywhere in the world.
          </p>
        </div>

        {/* Job Listings */}
        <div className="space-y-8">

          {/* ─── BDM Role ─── */}
          <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-6">
              {/* Title row */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <h2 className="text-xl font-bold text-white">Business Development Managers</h2>
                  <p className="text-zinc-400 text-sm mt-1">Partnerships &amp; Growth</p>
                </div>
                <div className="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-xs font-medium text-white shrink-0">
                  Open
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-5">
                <Tag icon={<DollarSign className="w-3.5 h-3.5" />} label="Negotiable Salary + OTE Commission" />
                <Tag icon={<Clock className="w-3.5 h-3.5" />} label="Flexible Hours" />
                <Tag icon={<MapPin className="w-3.5 h-3.5" />} label="Fully Remote" />
              </div>

              {/* About the role */}
              <Section title="About the Role">
                <p>
                  As one of our Business Development Managers at DeHub, you will be part of the driving force behind our partnership 
                  strategy. Your mission is to identify, engage, and close deals with companies across both Web2 
                  and Web3 — from gaming studios and content platforms to blockchain projects and DeFi protocols. 
                  This is an OTE (On-Target Earnings) commission-based position: the harder you hustle, the more you earn. 
                  The role is simple, bring on companies, projects, communities or any large profile accounts on to DeHub, and get paid. 
                  The idea is, more awareness drives more growth to our ecosystem, which pays you more bonuses for successful campaigns. 
                  It's a infinite loop of growth with uncapped earning potential. Even those without experience are invited to apply, if the attitude is right for the role.
                </p>
              </Section>

              {/* Responsibilities */}
              <Section title="Key Responsibilities">
                <ul className="space-y-2.5">
                  <BulletItem icon={<Handshake className="w-4 h-4" />} text="Identify and secure strategic partnerships with Web2 and Web3 companies that align with DeHub's mission" />
                  <BulletItem icon={<Target className="w-4 h-4" />} text="Build and manage a pipeline of prospective partners, sponsors, and integration opportunities" />
                  <BulletItem icon={<Globe className="w-4 h-4" />} text="Represent DeHub at industry events, conferences, and virtual summits" />
                  <BulletItem icon={<TrendingUp className="w-4 h-4" />} text="Negotiate partnership terms, revenue-sharing models, and co-marketing agreements" />
                  <BulletItem icon={<Sparkles className="w-4 h-4" />} text="Collaborate with the product and marketing teams to develop joint campaigns and integrations" />
                </ul>
              </Section>

              {/* What we're looking for */}
              <Section title="What We're Looking For">
                <ul className="space-y-2.5">
                  <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Proven experience in business development, partnerships, or sales within tech, gaming, or Web3" />
                  <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Strong existing network in the crypto/Web3 or creator economy space is a huge plus" />
                  <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Excellent communication and negotiation skills — you can close deals and build lasting relationships" />
                  <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Self-motivated and comfortable working autonomously in a remote-first environment" />
                  <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Genuine interest in decentralised social media, NFTs, or blockchain technology" />
                </ul>
              </Section>

              {/* Compensation */}
              <Section title="Compensation">
                <p>
                  This role offers a <span className="text-white font-medium">negotiable base salary</span> plus 
                  an <span className="text-white font-medium">uncapped OTE commission structure</span> tied directly 
                  to the partnerships you bring in. Top performers have unlimited earning potential.
                </p>
              </Section>

              {/* Apply button */}
              <Button
                onClick={() => setBdmFormOpen(!bdmFormOpen)}
                className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white font-semibold rounded-xl h-11 transition-all mt-2"
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

            {/* ─── BDM Application Form ─── */}
            {bdmFormOpen && (
              <form onSubmit={handleBDMSubmit} className="border-t border-white/10 p-6 space-y-5">
                <h3 className="text-white font-semibold text-sm mb-1">Your Application</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Full Name" required>
                    <Input
                      name="name"
                      placeholder="Jane Smith"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      maxLength={100}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </FormField>
                  <FormField label="Email" required>
                    <Input
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      maxLength={255}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Telegram">
                    <Input
                      name="telegram"
                      placeholder="@username"
                      value={formData.telegram}
                      onChange={handleChange}
                      maxLength={100}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </FormField>
                  <FormField label="X (Twitter)">
                    <Input
                      name="twitter"
                      placeholder="@username"
                      value={formData.twitter}
                      onChange={handleChange}
                      maxLength={100}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Instagram">
                    <Input
                      name="instagram"
                      placeholder="@username"
                      value={formData.instagram}
                      onChange={handleChange}
                      maxLength={100}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </FormField>
                  <FormField label="LinkedIn">
                    <Input
                      name="linkedin"
                      placeholder="linkedin.com/in/you"
                      value={formData.linkedin}
                      onChange={handleChange}
                      maxLength={255}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </FormField>
                </div>

                <FormField label="Other Socials">
                  <Input
                    name="other_socials"
                    placeholder="TikTok, YouTube, Discord, etc."
                    value={formData.other_socials}
                    onChange={handleChange}
                    maxLength={500}
                    className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                  />
                </FormField>

                <FormField label="Past Experience">
                  <Textarea
                    name="past_experience"
                    placeholder="Tell us about your relevant BD, partnerships, or sales experience. Include companies, industries, and notable deals if applicable..."
                    value={formData.past_experience}
                    onChange={handleChange}
                    maxLength={2000}
                    className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white min-h-[120px]"
                  />
                </FormField>

                <FormField label="Why should we hire you?">
                  <Textarea
                    name="why_hire_you"
                    placeholder="What makes you the right person for this role? What unique value do you bring to DeHub?"
                    value={formData.why_hire_you}
                    onChange={handleChange}
                    maxLength={2000}
                    className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white min-h-[120px]"
                  />
                </FormField>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white font-semibold rounded-xl transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Application
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>

          {/* ─── Brand Ambassador Role ─── */}
          <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            {/* Title row */}
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h2 className="text-xl font-bold text-white">Brand Ambassador</h2>
                <p className="text-zinc-400 text-sm mt-1">Community &amp; Evangelism</p>
              </div>
              <div className="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-xs font-medium text-white shrink-0">
                Open
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-5">
              <Tag icon={<DollarSign className="w-3.5 h-3.5" />} label="Negotiable Monthly Salary" />
              <Tag icon={<Clock className="w-3.5 h-3.5" />} label="Flexible Hours" />
              <Tag icon={<MapPin className="w-3.5 h-3.5" />} label="Fully Remote" />
            </div>

            {/* About the role */}
            <Section title="About the Role">
              <p>
                As a DeHub Brand Ambassador you are the face and voice of the platform in your community. 
                Your job is to spread the word about DeHub across every channel you touch — social media, 
                IRL meetups, gaming events, university campuses, and beyond. This is a paid monthly salary role, 
                not commission-based; you'll earn a consistent income while growing alongside the platform.
              </p>
            </Section>

            {/* Responsibilities */}
            <Section title="Key Responsibilities">
              <ul className="space-y-2.5">
                <BulletItem icon={<Megaphone className="w-4 h-4" />} text="Create and share authentic content about DeHub across your personal social channels (X, TikTok, Instagram, YouTube, etc.)" />
                <BulletItem icon={<Heart className="w-4 h-4" />} text="Actively engage with the DeHub community on the app — post, comment, and interact with other users" />
                <BulletItem icon={<Globe className="w-4 h-4" />} text="Attend and represent DeHub at real-life events, meetups, and conferences in your area" />
                <BulletItem icon={<Users className="w-4 h-4" />} text="Onboard new users and creators to the platform through your personal network" />
                <BulletItem icon={<Sparkles className="w-4 h-4" />} text="Provide feedback and ideas from the community to help shape the product roadmap" />
              </ul>
            </Section>

            {/* What we're looking for */}
            <Section title="What We're Looking For">
              <ul className="space-y-2.5">
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Active social media presence with genuine engagement (follower count matters less than authenticity)" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Passion for Web3, crypto, gaming, or creator culture" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Strong communication skills and ability to explain complex concepts simply" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Self-starter who can plan and execute campaigns independently" />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text="Previous ambassador, influencer, or community management experience is a bonus" />
              </ul>
            </Section>

            {/* Compensation */}
            <Section title="Compensation">
              <p>
                Brand Ambassadors receive a <span className="text-white font-medium">negotiable monthly salary</span> paid 
                consistently. Additional bonuses may be awarded based on campaign performance, user sign-ups, 
                and community growth milestones. You'll also receive exclusive DeHub merch, early feature access, 
                and token allocations as the ecosystem grows.
              </p>
            </Section>

            <Button
              onClick={() => navigate('/creators')}
              className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white font-semibold rounded-xl h-11 transition-all mt-2"
            >
              <Users className="w-4 h-4 mr-2" />
              Apply as Brand Ambassador
              <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-50" />
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center space-y-2">
          <p className="text-zinc-500 text-xs">
            Don't see a role that fits? Reach out to us on{' '}
            <a href="mailto:dev@dehub.io" className="text-zinc-300 underline underline-offset-2 hover:text-white transition-colors">
              dev@dehub.io
            </a>{' '}
            — we're always looking for talented people.
          </p>
        </div>
      </div>
    </div>
  );
}

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
