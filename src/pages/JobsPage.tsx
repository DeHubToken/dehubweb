import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
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

/** Bullet lists are key stems so a translator gets one flat list per section. */
const BDM_RESPONSIBILITIES = [
  { icon: <Handshake className="w-4 h-4" />, key: 'bdmResp1' },
  { icon: <Target className="w-4 h-4" />, key: 'bdmResp2' },
  { icon: <Globe className="w-4 h-4" />, key: 'bdmResp3' },
  { icon: <TrendingUp className="w-4 h-4" />, key: 'bdmResp4' },
  { icon: <Sparkles className="w-4 h-4" />, key: 'bdmResp5' },
];

const BDM_LOOKING_FOR = ['bdmWant1', 'bdmWant2', 'bdmWant3', 'bdmWant4', 'bdmWant5'];

const AMBASSADOR_RESPONSIBILITIES = [
  { icon: <Megaphone className="w-4 h-4" />, key: 'ambResp1' },
  { icon: <Heart className="w-4 h-4" />, key: 'ambResp2' },
  { icon: <Globe className="w-4 h-4" />, key: 'ambResp3' },
  { icon: <Users className="w-4 h-4" />, key: 'ambResp4' },
  { icon: <Sparkles className="w-4 h-4" />, key: 'ambResp5' },
];

const AMBASSADOR_LOOKING_FOR = ['ambWant1', 'ambWant2', 'ambWant3', 'ambWant4', 'ambWant5'];

export default function JobsPage() {
  const { t } = useTranslation();
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
      toast.error(t('jobs.nameEmailRequired'));
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('job_applications')
        .insert({
          // Stored, then read back by the admin panel — stays English.
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

      toast.success(t('jobs.applicationSubmitted'));
      setFormData(initialBDMForm);
      setBdmFormOpen(false);
    } catch (error) {
      console.error('Error submitting application:', error);
      toast.error(t('jobs.submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Stable particle positions — inline Math.random() re-randomized all 60
  // particles on every re-render (e.g. each keystroke in the form below).
  const particles = useMemo(
    () =>
      Array.from({ length: 60 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        width: `${Math.random() * 3 + 1}px`,
        height: `${Math.random() * 3 + 1}px`,
        backgroundColor: `rgba(255, 255, 255, ${0.03 + Math.random() * 0.05})`,
      })),
    [],
  );

  return (
    <div data-glass-page className="min-h-screen bg-black text-white relative overflow-hidden">
      <SEOHead
        title={t('jobs.seoTitle')}
        description={t('jobs.seoDescription')}
        url="https://dehub.io/jobs"
        jsonLd={{
          // Structured data describes the postings to crawlers, which are
          // served English — it deliberately stays untranslated.
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'JobPosting',
              title: 'Business Development Manager',
              description:
                'As a Business Development Manager at DeHub, you drive partnerships, onboard creators and communities, and grow the DeHub ecosystem across Web3 and mainstream markets.',
              datePosted: '2026-01-01',
              employmentType: ['FULL_TIME', 'CONTRACTOR'],
              hiringOrganization: {
                '@type': 'Organization',
                name: 'DeHub',
                sameAs: 'https://dehub.io',
                logo: 'https://dehub.io/media/a8b1baf2-99f3-4ff3-b2b5-4575f4ba8ace.png',
              },
              jobLocationType: 'TELECOMMUTE',
              applicantLocationRequirements: { '@type': 'Country', name: 'Worldwide' },
              directApply: true,
              url: 'https://dehub.io/jobs',
            },
            {
              '@type': 'JobPosting',
              title: 'Brand Ambassador',
              description:
                'DeHub Brand Ambassadors are the face and voice of the platform in their community — hosting events, growing local reach and championing DeHub across social channels.',
              datePosted: '2026-01-01',
              employmentType: ['PART_TIME', 'CONTRACTOR'],
              hiringOrganization: {
                '@type': 'Organization',
                name: 'DeHub',
                sameAs: 'https://dehub.io',
                logo: 'https://dehub.io/media/a8b1baf2-99f3-4ff3-b2b5-4575f4ba8ace.png',
              },
              jobLocationType: 'TELECOMMUTE',
              applicantLocationRequirements: { '@type': 'Country', name: 'Worldwide' },
              directApply: true,
              url: 'https://dehub.io/jobs',
            },
          ],
        }}
      />
      {/* Background particles */}
      <div className="absolute inset-0 pointer-events-none">
        {particles.map((p, i) => (
          <div key={i} className="absolute rounded-full" style={p} />
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
            <h1 className="text-2xl font-bold">{t('jobs.heading')}</h1>
            <p className="text-zinc-500 text-sm">{t('jobs.subheading')}</p>
          </div>
        </div>

        {/* Intro section */}
        <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6 mb-8">
          <p className="text-zinc-300 text-sm leading-relaxed">
            <Trans
              i18nKey="jobs.intro"
              components={{ b: <span className="text-white font-medium" /> }}
            />
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
                  <h2 className="text-xl font-bold text-white">{t('jobs.bdmTitle')}</h2>
                  <p className="text-zinc-400 text-sm mt-1">{t('jobs.bdmSubtitle')}</p>
                </div>
                <div className="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-xs font-medium text-white shrink-0">
                  {t('jobs.open')}
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-5">
                <Tag icon={<DollarSign className="w-3.5 h-3.5" />} label={t('jobs.tagBdmPay')} />
                <Tag icon={<Clock className="w-3.5 h-3.5" />} label={t('jobs.tagFlexibleHours')} />
                <Tag icon={<MapPin className="w-3.5 h-3.5" />} label={t('jobs.tagFullyRemote')} />
              </div>

              {/* About the role */}
              <Section title={t('jobs.aboutTheRole')}>
                <p>{t('jobs.bdmAbout')}</p>
              </Section>

              {/* Responsibilities */}
              <Section title={t('jobs.keyResponsibilities')}>
                <ul className="space-y-2.5">
                  {BDM_RESPONSIBILITIES.map((r) => (
                    <BulletItem key={r.key} icon={r.icon} text={t(`jobs.${r.key}`)} />
                  ))}
                </ul>
              </Section>

              {/* What we're looking for */}
              <Section title={t('jobs.whatWereLookingFor')}>
                <ul className="space-y-2.5">
                  {BDM_LOOKING_FOR.map((k) => (
                    <BulletItem key={k} icon={<CheckCircle2 className="w-4 h-4" />} text={t(`jobs.${k}`)} />
                  ))}
                </ul>
              </Section>

              {/* Compensation */}
              <Section title={t('jobs.compensation')}>
                <p>
                  <Trans
                    i18nKey="jobs.bdmCompensation"
                    components={{ b: <span className="text-white font-medium" /> }}
                  />
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
                    {t('jobs.closeApplication')}
                  </>
                ) : (
                  <>
                    <Briefcase className="w-4 h-4 mr-2" />
                    {t('jobs.applyAsBdm')}
                  </>
                )}
              </Button>
            </div>

            {/* ─── BDM Application Form ─── */}
            {bdmFormOpen && (
              <form onSubmit={handleBDMSubmit} className="border-t border-white/10 p-6 space-y-5">
                <h3 className="text-white font-semibold text-sm mb-1">{t('jobs.yourApplication')}</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label={t('jobs.fullName')} required>
                    <Input
                      name="name"
                      placeholder={t('jobs.fullNamePlaceholder')}
                      value={formData.name}
                      onChange={handleChange}
                      required
                      maxLength={100}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </FormField>
                  <FormField label={t('jobs.email')} required>
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

                <FormField label={t('jobs.otherSocials')}>
                  <Input
                    name="other_socials"
                    placeholder={t('jobs.otherSocialsPlaceholder')}
                    value={formData.other_socials}
                    onChange={handleChange}
                    maxLength={500}
                    className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                  />
                </FormField>

                <FormField label={t('jobs.pastExperience')}>
                  <Textarea
                    name="past_experience"
                    placeholder={t('jobs.pastExperiencePlaceholder')}
                    value={formData.past_experience}
                    onChange={handleChange}
                    maxLength={2000}
                    className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white min-h-[120px]"
                  />
                </FormField>

                <FormField label={t('jobs.whyHireYou')}>
                  <Textarea
                    name="why_hire_you"
                    placeholder={t('jobs.whyHireYouPlaceholder')}
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
                      {t('jobs.submitting')}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      {t('jobs.submitApplication')}
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
                <h2 className="text-xl font-bold text-white">{t('jobs.ambassadorTitle')}</h2>
                <p className="text-zinc-400 text-sm mt-1">{t('jobs.ambassadorSubtitle')}</p>
              </div>
              <div className="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-xs font-medium text-white shrink-0">
                {t('jobs.open')}
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-5">
              <Tag icon={<DollarSign className="w-3.5 h-3.5" />} label={t('jobs.tagAmbassadorPay')} />
              <Tag icon={<Clock className="w-3.5 h-3.5" />} label={t('jobs.tagFlexibleHours')} />
              <Tag icon={<MapPin className="w-3.5 h-3.5" />} label={t('jobs.tagFullyRemote')} />
            </div>

            {/* About the role */}
            <Section title={t('jobs.aboutTheRole')}>
              <p>{t('jobs.ambassadorAbout')}</p>
            </Section>

            {/* Responsibilities */}
            <Section title={t('jobs.keyResponsibilities')}>
              <ul className="space-y-2.5">
                {AMBASSADOR_RESPONSIBILITIES.map((r) => (
                  <BulletItem key={r.key} icon={r.icon} text={t(`jobs.${r.key}`)} />
                ))}
              </ul>
            </Section>

            {/* What we're looking for */}
            <Section title={t('jobs.whatWereLookingFor')}>
              <ul className="space-y-2.5">
                {AMBASSADOR_LOOKING_FOR.map((k) => (
                  <BulletItem key={k} icon={<CheckCircle2 className="w-4 h-4" />} text={t(`jobs.${k}`)} />
                ))}
              </ul>
            </Section>

            {/* Compensation */}
            <Section title={t('jobs.compensation')}>
              <p>
                <Trans
                  i18nKey="jobs.ambassadorCompensation"
                  components={{ b: <span className="text-white font-medium" /> }}
                />
              </p>
            </Section>

            <Button
              onClick={() => navigate('/creators')}
              className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white font-semibold rounded-xl h-11 transition-all mt-2"
            >
              <Users className="w-4 h-4 mr-2" />
              {t('jobs.applyAsAmbassador')}
              <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-50" />
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center space-y-2">
          <p className="text-zinc-500 text-xs">
            <Trans
              i18nKey="jobs.noRoleFits"
              components={{
                mail: (
                  <a
                    href="mailto:dev@dehub.io"
                    className="text-zinc-300 underline underline-offset-2 hover:text-white transition-colors"
                  />
                ),
              }}
            />
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
