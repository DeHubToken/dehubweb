import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAdminAuth } from '@/hooks/use-admin-auth';
import { getAdminToken } from '@/lib/api/dehub/admin';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { login } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (getAdminToken()) {
    return <Navigate to="/admin/users" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success('Signed in');
      navigate('/admin/users', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-6 h-6 text-white" />
          <h1 className="text-xl font-bold text-white">DeHub Admin</h1>
        </div>
        <p className="text-sm text-white/60 mb-6">
          Sign in with your admin email to manage users and scaling metrics.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-white/60 mb-1.5 block">Email</label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
              required
            />
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1.5 block">Password</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
