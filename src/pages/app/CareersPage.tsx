/**
 * Careers Page (In-App)
 * =====================
 * Native-feeling careers page rendered inside the app layout
 * with persistent sidebars. Reuses job listing content from
 * the standalone JobsPage but adapted for the middle panel.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import careersBriefcase from '@/assets/careers-briefcase.png';

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
  const { t } = useTranslation();
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
      toast.error(t('careers.nameEmailRequired'));
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
      toast.success(t('careers.applicationSuccess'));
      setFormData(initialBDMForm);
      setBdmFormOpen(false);
    } catch (error) {
      console.error('Error submitting application:', error);
      toast.error(t('careers.applicationFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header bento */}
      <div className="rounded-2xl p-4 sm:p-6 mb-4 bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent backdrop-blur-xl border border-white/[0.08]">
        <div className="flex items-center gap-3 mb-3">
          <img src={careersBriefcase} alt={t('careers.title')} className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-xl font-bold text-white">{t('careers.title')}</h1>
            <p className="text-zinc-500 text-sm">{t('careers.subtitle')}</p>
          </div>
        </div>

        <p className="text-zinc-300 text-sm leading-relaxed">
          {t('careers.intro')}
        </p>
      </div>

      {/* Job Listings */}
      <div className="space-y-4">

        {/* ─── BDM Role ─── */}
        <div className="rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-[24px] p-3 overflow-hidden">
          <div className="p-3">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h2 className="text-lg font-bold text-white">{t('careers.bdmTitle')}</h2>
                <p className="text-zinc-400 text-xs mt-0.5">{t('careers.bdmCategory')}</p>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap bg-gradient-to-br from-white/15 via-white/8 to-white/3 backdrop-blur-xl border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.3)] text-emerald-400">
                {t('careers.open')}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              <Tag icon={<DollarSign className="w-3.5 h-3.5" />} label={t('careers.negotiableSalaryOTE')} />
              <Tag icon={<Clock className="w-3.5 h-3.5" />} label={t('careers.flexibleHoursTag')} />
              <Tag icon={<MapPin className="w-3.5 h-3.5" />} label={t('careers.fullyRemoteTag')} />
            </div>

            <Section title={t('careers.aboutTheRole')}>
              <p>{t('careers.bdmAbout')}</p>
            </Section>

            <Section title={t('careers.keyResponsibilities')}>
              <ul className="space-y-2.5">
                <BulletItem icon={<Handshake className="w-4 h-4" />} text={t('careers.bdmResp1')} />
                <BulletItem icon={<Target className="w-4 h-4" />} text={t('careers.bdmResp2')} />
                <BulletItem icon={<Globe className="w-4 h-4" />} text={t('careers.bdmResp3')} />
                <BulletItem icon={<TrendingUp className="w-4 h-4" />} text={t('careers.bdmResp4')} />
                <BulletItem icon={<Sparkles className="w-4 h-4" />} text={t('careers.bdmResp5')} />
              </ul>
            </Section>

            <Section title={t('careers.whatWereLooking')}>
              <ul className="space-y-2.5">
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text={t('careers.bdmReq1')} />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text={t('careers.bdmReq2')} />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text={t('careers.bdmReq3')} />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text={t('careers.bdmReq4')} />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text={t('careers.bdmReq5')} />
              </ul>
            </Section>

            <Section title={t('careers.compensation')}>
              <p>{t('careers.bdmComp')}</p>
            </Section>

            <Button
              onClick={() => setBdmFormOpen(!bdmFormOpen)}
              variant="glass"
              className="w-full rounded-xl font-semibold h-11 mt-2"
            >
              {bdmFormOpen ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  {t('careers.closeApplication')}
                </>
              ) : (
                <>
                  <Briefcase className="w-4 h-4 mr-2" />
                  {t('careers.applyBDM')}
                </>
              )}
            </Button>
          </div>

          {/* BDM Application Form */}
          {bdmFormOpen && (
            <form onSubmit={handleBDMSubmit} className="border-t border-white/[0.08] p-4 space-y-5">
              <h3 className="text-white font-semibold text-sm mb-1">{t('careers.yourApplication')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label={t('careers.fullName')} required>
                  <Input name="name" placeholder="Jane Smith" value={formData.name} onChange={handleChange} required maxLength={100} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
                <FormField label={t('careers.email')} required>
                  <Input name="email" type="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} required maxLength={255} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label={t('careers.telegram')}>
                  <Input name="telegram" placeholder="@username" value={formData.telegram} onChange={handleChange} maxLength={100} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
                <FormField label={t('careers.xTwitter')}>
                  <Input name="twitter" placeholder="@username" value={formData.twitter} onChange={handleChange} maxLength={100} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label={t('careers.instagram')}>
                  <Input name="instagram" placeholder="@username" value={formData.instagram} onChange={handleChange} maxLength={100} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
                <FormField label={t('careers.linkedin')}>
                  <Input name="linkedin" placeholder="linkedin.com/in/you" value={formData.linkedin} onChange={handleChange} maxLength={255} className="bg-white/5 border-white/10 text-white rounded-xl" />
                </FormField>
              </div>
              <FormField label={t('careers.otherSocials')}>
                <Input name="other_socials" placeholder={t('careers.otherSocialsPlaceholder')} value={formData.other_socials} onChange={handleChange} maxLength={500} className="bg-white/5 border-white/10 text-white rounded-xl" />
              </FormField>
              <FormField label={t('careers.pastExperience')}>
                <Textarea name="past_experience" placeholder={t('careers.pastExperiencePlaceholder')} value={formData.past_experience} onChange={handleChange} maxLength={2000} className="bg-white/5 border-white/10 text-white min-h-[120px] rounded-xl" />
              </FormField>
              <FormField label={t('careers.whyHireYou')}>
                <Textarea name="why_hire_you" placeholder={t('careers.whyHireYouPlaceholder')} value={formData.why_hire_you} onChange={handleChange} maxLength={2000} className="bg-white/5 border-white/10 text-white min-h-[120px] rounded-xl" />
              </FormField>
              <Button type="submit" disabled={isSubmitting} variant="glass" className="w-full h-12 rounded-xl font-semibold">
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('careers.submitting')}</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" />{t('careers.submitApplication')}</>
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
                <h2 className="text-lg font-bold text-white">{t('careers.ambassadorTitle')}</h2>
                <p className="text-zinc-400 text-xs mt-0.5">{t('careers.ambassadorCategory')}</p>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap bg-gradient-to-br from-white/15 via-white/8 to-white/3 backdrop-blur-xl border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.3)] text-emerald-400">
                {t('careers.open')}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              <Tag icon={<DollarSign className="w-3.5 h-3.5" />} label={t('careers.negotiableMonthly')} />
              <Tag icon={<Clock className="w-3.5 h-3.5" />} label={t('careers.flexibleHoursTag')} />
              <Tag icon={<MapPin className="w-3.5 h-3.5" />} label={t('careers.fullyRemoteTag')} />
            </div>

            <Section title={t('careers.aboutTheRole')}>
              <p>{t('careers.ambassadorAbout')}</p>
            </Section>

            <Section title={t('careers.keyResponsibilities')}>
              <ul className="space-y-2.5">
                <BulletItem icon={<Megaphone className="w-4 h-4" />} text={t('careers.ambassadorResp1')} />
                <BulletItem icon={<Heart className="w-4 h-4" />} text={t('careers.ambassadorResp2')} />
                <BulletItem icon={<Globe className="w-4 h-4" />} text={t('careers.ambassadorResp3')} />
                <BulletItem icon={<Users className="w-4 h-4" />} text={t('careers.ambassadorResp4')} />
                <BulletItem icon={<Sparkles className="w-4 h-4" />} text={t('careers.ambassadorResp5')} />
              </ul>
            </Section>

            <Section title={t('careers.whatWereLooking')}>
              <ul className="space-y-2.5">
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text={t('careers.ambassadorReq1')} />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text={t('careers.ambassadorReq2')} />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text={t('careers.ambassadorReq3')} />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text={t('careers.ambassadorReq4')} />
                <BulletItem icon={<CheckCircle2 className="w-4 h-4" />} text={t('careers.ambassadorReq5')} />
              </ul>
            </Section>

            <Section title={t('careers.compensation')}>
              <p>{t('careers.ambassadorComp')}</p>
            </Section>

            <Button
              onClick={() => navigate('/creators')}
              variant="glass"
              className="w-full rounded-xl font-semibold h-11 mt-2"
            >
              <Users className="w-4 h-4 mr-2" />
              {t('careers.applyAmbassador')}
              <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-50" />
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-zinc-500 text-xs">
          {t('careers.footerText')}{' '}
          <a href="mailto:dev@dehub.io" className="text-zinc-300 underline underline-offset-2 hover:text-white transition-colors">
            dev@dehub.io
          </a>
        </p>
      </div>
    </div>
  );
}