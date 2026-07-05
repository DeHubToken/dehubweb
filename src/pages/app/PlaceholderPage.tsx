export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-2 sm:p-3">
      <div data-page-bento className="bg-zinc-900 rounded-2xl flex items-center justify-center min-h-[calc(100vh-6rem)] lg:min-h-[calc(100vh-2rem)]">
        <div className="text-center p-8">
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">{title}</h1>
          <p className="text-zinc-500">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
