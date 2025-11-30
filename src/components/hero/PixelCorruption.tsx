interface PixelCorruptionProps {
  visible: boolean;
}

const CORRUPTION_COLORS = ['#00ffff', '#ff00ff', '#ffffff', '#ff0000'];

export const PixelCorruption = ({ visible }: PixelCorruptionProps) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 pixel-corruption">
      {Array.from({ length: 50 }).map((_, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            width: `${Math.random() * 10 + 2}px`,
            height: `${Math.random() * 10 + 2}px`,
            backgroundColor: CORRUPTION_COLORS[Math.floor(Math.random() * CORRUPTION_COLORS.length)],
            opacity: 0.6
          }}
        />
      ))}
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={`line-${i}`}
          className="absolute w-full"
          style={{
            top: `${Math.random() * 100}%`,
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #00ffff 50%, transparent)',
            opacity: 0.5
          }}
        />
      ))}
    </div>
  );
};
