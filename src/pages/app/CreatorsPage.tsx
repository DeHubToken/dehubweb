import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';

export default function CreatorsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    x_username: '',
    youtube_username: '',
    twitch_username: '',
    instagram_username: '',
    tiktok_username: '',
    total_follower_reach: '',
    other_socials: '',
    email: '',
    expected_compensation: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.total_follower_reach || !formData.expected_compensation) {
      toast.error(t('creators.fillRequired', 'Please fill in all required fields'));
      return;
    }

    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('creator_applications')
        .insert({
          x_username: formData.x_username || null,
          youtube_username: formData.youtube_username || null,
          twitch_username: formData.twitch_username || null,
          instagram_username: formData.instagram_username || null,
          total_follower_reach: formData.total_follower_reach,
          other_socials: formData.other_socials || null,
          email: formData.email,
          expected_compensation: formData.expected_compensation,
        });

      if (error) throw error;

      toast.success(t('creators.submitted', 'Application submitted successfully!'));
      setFormData({
        x_username: '',
        youtube_username: '',
        twitch_username: '',
        instagram_username: '',
        tiktok_username: '',
        total_follower_reach: '',
        other_socials: '',
        email: '',
        expected_compensation: '',
      });
    } catch (error) {
      console.error('Error submitting application:', error);
      toast.error(t('creators.failedSubmit', 'Failed to submit application. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Subtle pixelated gradient overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 80 }).map((_, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${Math.random() * 4 + 1}px`,
              height: `${Math.random() * 4 + 1}px`,
              backgroundColor: `rgb(${30 + Math.random() * 20}, ${30 + Math.random() * 20}, ${30 + Math.random() * 20})`,
              opacity: 0.3 + Math.random() * 0.2,
            }}
          />
        ))}
        <div 
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(20,20,20,0.1) 0%, rgba(15,15,15,0.2) 70%, rgba(10,10,10,0.3) 100%)',
          }}
        />
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="rounded-xl hover:bg-zinc-800 absolute left-4 top-8 text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-center">{t('creators.title', 'Creator Application')}</h1>
          <p className="text-zinc-400 text-sm text-center">{t('creators.subtitle', 'Join the DeHub creator network')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="x_username" className="text-zinc-300">{t('creators.xUsername', 'X (Twitter) Username')}</Label>
              <Input id="x_username" name="x_username" placeholder="@username" value={formData.x_username} onChange={handleChange} className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="youtube_username" className="text-zinc-300">{t('creators.youtubeUsername', 'YouTube Username')}</Label>
              <Input id="youtube_username" name="youtube_username" placeholder="@channel" value={formData.youtube_username} onChange={handleChange} className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitch_username" className="text-zinc-300">{t('creators.twitchUsername', 'Twitch Username')}</Label>
              <Input id="twitch_username" name="twitch_username" placeholder="@username" value={formData.twitch_username} onChange={handleChange} className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram_username" className="text-zinc-300">{t('creators.instagramUsername', 'Instagram Username')}</Label>
              <Input id="instagram_username" name="instagram_username" placeholder="@username" value={formData.instagram_username} onChange={handleChange} className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiktok_username" className="text-zinc-300">{t('creators.tiktokUsername', 'TikTok Username')}</Label>
              <Input id="tiktok_username" name="tiktok_username" placeholder="@username" value={formData.tiktok_username} onChange={handleChange} className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="other_socials" className="text-zinc-300">{t('creators.otherSocials', 'Other Usernames/Socials')}</Label>
              <Textarea id="other_socials" name="other_socials" placeholder="" value={formData.other_socials} onChange={handleChange} className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 min-h-[80px]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_follower_reach" className="text-zinc-300">
                {t('creators.totalFollowerReach', 'Total Follower Reach')} <span className="text-red-400">*</span>
              </Label>
              <Input id="total_follower_reach" name="total_follower_reach" placeholder={t('creators.followerReachPlaceholder', 'e.g., 500K across all platforms')} value={formData.total_follower_reach} onChange={handleChange} required className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">
                {t('creators.emailOrTelegram', 'Email or Telegram ID to Contact')} <span className="text-red-400">*</span>
              </Label>
              <Input id="email" name="email" placeholder={t('creators.emailPlaceholder', 'you@example.com or @username')} value={formData.email} onChange={handleChange} required className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected_compensation" className="text-zinc-300">
                {t('creators.expectedCompensation', 'Expected Compensation')} <span className="text-red-400">*</span>
              </Label>
              <Input id="expected_compensation" name="expected_compensation" placeholder={t('creators.compensationPlaceholder', 'e.g., $100/month')} value={formData.expected_compensation} onChange={handleChange} required className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500" />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 text-white hover:bg-black/60 font-semibold rounded-xl"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('creators.submitting', 'Submitting...')}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {t('creators.submitApplication', 'Submit Application')}
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
