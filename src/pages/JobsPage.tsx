import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Briefcase, Users, MapPin, Clock, DollarSign, Send, Loader2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
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

      <div className="max-w-3xl mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="rounded-xl hover:bg-white/10 text-white shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <img src={dehubLogo} alt="DeHub" className="h-6" />
            <div>
              <h1 className="text-2xl font-bold">Careers</h1>
              <p className="text-zinc-500 text-sm">Join the team building the future of decentralised social media</p>
            </div>
          </div>
        </div>

        {/* Job Listings */}
        <div className="space-y-6">
          {/* BDM Role */}
          <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Business Development Manager</h2>
                  <p className="text-zinc-400 text-sm mt-1">Partnerships &amp; Growth</p>
                </div>
                <div className="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-xs font-medium text-white shrink-0">
                  Open
                </div>
              </div>

              <p className="text-zinc-300 text-sm leading-relaxed mb-5">
                Focused on securing partnerships with other Web2 and Web3 companies to accelerate DeHub's growth. 
                This is an OTE commission-based role — the harder you work, the more you earn.
              </p>

              <div className="flex flex-wrap gap-3 mb-5">
                <Tag icon={<DollarSign className="w-3.5 h-3.5" />} label="Negotiable Salary + Commission" />
                <Tag icon={<Clock className="w-3.5 h-3.5" />} label="Flexible Hours" />
                <Tag icon={<MapPin className="w-3.5 h-3.5" />} label="Fully Remote" />
              </div>

              <Button
                onClick={() => setBdmFormOpen(!bdmFormOpen)}
                className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white font-semibold rounded-xl h-11 transition-all"
              >
                {bdmFormOpen ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-2" />
                    Close Application
                  </>
                ) : (
                  <>
                    <Briefcase className="w-4 h-4 mr-2" />
                    Apply Now
                  </>
                )}
              </Button>
            </div>

            {/* BDM Application Form */}
            {bdmFormOpen && (
              <form onSubmit={handleBDMSubmit} className="border-t border-white/10 p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-300 text-sm">
                      Name <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      name="name"
                      placeholder="Your full name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      maxLength={100}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-300 text-sm">
                      Email <span className="text-red-400">*</span>
                    </Label>
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
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-300 text-sm">Telegram</Label>
                    <Input
                      name="telegram"
                      placeholder="@username"
                      value={formData.telegram}
                      onChange={handleChange}
                      maxLength={100}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-300 text-sm">X (Twitter)</Label>
                    <Input
                      name="twitter"
                      placeholder="@username"
                      value={formData.twitter}
                      onChange={handleChange}
                      maxLength={100}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-300 text-sm">Instagram</Label>
                    <Input
                      name="instagram"
                      placeholder="@username"
                      value={formData.instagram}
                      onChange={handleChange}
                      maxLength={100}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-300 text-sm">LinkedIn</Label>
                    <Input
                      name="linkedin"
                      placeholder="linkedin.com/in/you"
                      value={formData.linkedin}
                      onChange={handleChange}
                      maxLength={255}
                      className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300 text-sm">Other Socials</Label>
                  <Input
                    name="other_socials"
                    placeholder="Any other social links or usernames"
                    value={formData.other_socials}
                    onChange={handleChange}
                    maxLength={500}
                    className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300 text-sm">Past Experience</Label>
                  <Textarea
                    name="past_experience"
                    placeholder="Briefly describe your relevant BD/partnerships experience..."
                    value={formData.past_experience}
                    onChange={handleChange}
                    maxLength={2000}
                    className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300 text-sm">Why should we hire you?</Label>
                  <Textarea
                    name="why_hire_you"
                    placeholder="What makes you the right fit for this role?"
                    value={formData.why_hire_you}
                    onChange={handleChange}
                    maxLength={2000}
                    className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 text-white min-h-[100px]"
                  />
                </div>

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

          {/* Brand Ambassador Role */}
          <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold text-white">Brand Ambassador</h2>
                <p className="text-zinc-400 text-sm mt-1">Community &amp; Growth</p>
              </div>
              <div className="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-xs font-medium text-white shrink-0">
                Open
              </div>
            </div>

            <p className="text-zinc-300 text-sm leading-relaxed mb-5">
              Focused on spreading the gospel of DeHub across all your socials and at real-life events, 
              as well as engaging the community within our app. This is a monthly salary paid role.
            </p>

            <div className="flex flex-wrap gap-3 mb-5">
              <Tag icon={<DollarSign className="w-3.5 h-3.5" />} label="Negotiable Monthly Salary" />
              <Tag icon={<Clock className="w-3.5 h-3.5" />} label="Flexible Hours" />
              <Tag icon={<MapPin className="w-3.5 h-3.5" />} label="Fully Remote" />
            </div>

            <Button
              onClick={() => navigate('/creators')}
              className="w-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 hover:border-white/40 text-white font-semibold rounded-xl h-11 transition-all"
            >
              <Users className="w-4 h-4 mr-2" />
              Apply as Brand Ambassador
              <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-50" />
            </Button>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-zinc-600 text-xs text-center mt-8">
          DeHub is an equal opportunity employer. We value diversity and are committed to creating an inclusive environment.
        </p>
      </div>
    </div>
  );
}

function Tag({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300">
      {icon}
      {label}
    </div>
  );
}
