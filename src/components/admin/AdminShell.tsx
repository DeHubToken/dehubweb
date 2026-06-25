import { Link } from 'react-router-dom';
import { LogOut, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminAuth } from '@/hooks/use-admin-auth';

interface AdminShellProps {
  title: string;
  children: React.ReactNode;
}

export function AdminShell({ title, children }: AdminShellProps) {
  const { logout } = useAdminAuth();

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/admin/users" className="font-semibold text-white shrink-0">
              DeHub Admin
            </Link>
            <span className="text-white/30 hidden sm:inline">/</span>
            <span className="text-sm text-white/70 truncate">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/users"
              className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/5"
            >
              <Users className="w-3.5 h-3.5" />
              Users
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/60 hover:text-white"
              onClick={() => logout().then(() => { window.location.href = '/admin/login'; })}
            >
              <LogOut className="w-4 h-4 mr-1" />
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
