import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';

export default function CreatorsPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    x_username: '',
    youtube_username: '',
    twitch_username: '',
    instagram_username: '',
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
      toast.error('Please fill in all required fields');
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

      toast.success('Application submitted successfully!');
      setFormData({
        x_username: '',
        youtube_username: '',
        twitch_username: '',
        instagram_username: '',
        total_follower_reach: '',
        other_socials: '',
        email: '',
        expected_compensation: '',
      });
    } catch (error) {
      console.error('Error submitting application:', error);
      toast.error('Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="rounded-full hover:bg-zinc-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Creator Application</h1>
            <p className="text-zinc-400 text-sm">Join the DeHub creator network</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
            {/* X Username */}
            <div className="space-y-2">
              <Label htmlFor="x_username" className="text-zinc-300">X (Twitter) Username</Label>
              <Input
                id="x_username"
                name="x_username"
                placeholder="@username"
                value={formData.x_username}
                onChange={handleChange}
                className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500"
              />
            </div>

            {/* YouTube Username */}
            <div className="space-y-2">
              <Label htmlFor="youtube_username" className="text-zinc-300">YouTube Username</Label>
              <Input
                id="youtube_username"
                name="youtube_username"
                placeholder="@channel"
                value={formData.youtube_username}
                onChange={handleChange}
                className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500"
              />
            </div>

            {/* Twitch Username */}
            <div className="space-y-2">
              <Label htmlFor="twitch_username" className="text-zinc-300">Twitch Username</Label>
              <Input
                id="twitch_username"
                name="twitch_username"
                placeholder="username"
                value={formData.twitch_username}
                onChange={handleChange}
                className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500"
              />
            </div>

            {/* Instagram Username */}
            <div className="space-y-2">
              <Label htmlFor="instagram_username" className="text-zinc-300">Instagram Username</Label>
              <Input
                id="instagram_username"
                name="instagram_username"
                placeholder="@username"
                value={formData.instagram_username}
                onChange={handleChange}
                className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500"
              />
            </div>

            {/* Total Follower Reach */}
            <div className="space-y-2">
              <Label htmlFor="total_follower_reach" className="text-zinc-300">
                Total Follower Reach <span className="text-red-400">*</span>
              </Label>
              <Input
                id="total_follower_reach"
                name="total_follower_reach"
                placeholder="e.g., 500K across all platforms"
                value={formData.total_follower_reach}
                onChange={handleChange}
                required
                className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500"
              />
            </div>

            {/* Other Socials */}
            <div className="space-y-2">
              <Label htmlFor="other_socials" className="text-zinc-300">Other Usernames/Socials</Label>
              <Textarea
                id="other_socials"
                name="other_socials"
                placeholder="TikTok, Discord, etc."
                value={formData.other_socials}
                onChange={handleChange}
                className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500 min-h-[80px]"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">
                Email to Contact <span className="text-red-400">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                required
                className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500"
              />
            </div>

            {/* Expected Compensation */}
            <div className="space-y-2">
              <Label htmlFor="expected_compensation" className="text-zinc-300">
                Expected Compensation <span className="text-red-400">*</span>
              </Label>
              <Input
                id="expected_compensation"
                name="expected_compensation"
                placeholder="e.g., $500/month or revenue share"
                value={formData.expected_compensation}
                onChange={handleChange}
                required
                className="bg-zinc-800/50 border-zinc-700 focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-white text-black hover:bg-zinc-200 font-semibold rounded-xl"
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
      </div>
    </div>
  );
}
