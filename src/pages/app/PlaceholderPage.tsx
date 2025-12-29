export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
        <p className="text-zinc-500">Coming soon</p>
      </div>
    </div>
  );
}
