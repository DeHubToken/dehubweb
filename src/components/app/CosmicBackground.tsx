import { useAppTheme } from '@/contexts/ThemeContext';
import { NebulaBackground } from '@/components/ui/NebulaBackground';

/**
 * Globally rendered cosmic nebula background — only active when the
 * appearance theme is set to "cosmic". Sits behind all app content.
 */
export function CosmicBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'cosmic') return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <NebulaBackground />
    </div>
  );
}
