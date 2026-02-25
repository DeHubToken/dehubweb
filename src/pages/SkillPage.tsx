import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Bot, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function SkillPage() {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/skill.md')
      .then(res => res.text())
      .then(text => {
        setContent(text);
        setIsLoading(false);
      })
      .catch(() => {
        setContent('# Error\nFailed to load skill documentation.');
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black border-b border-white/10 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate(-1)}
              className="text-white/60 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" />
              <h1 className="text-lg font-semibold">DeHub MCP API</h1>
            </div>
          </div>
          <a 
            href="/skill.md" 
            target="_blank"
            className="flex items-center gap-1 text-sm text-white/60 hover:text-white"
          >
            <ExternalLink className="w-4 h-4" />
            Raw
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-8 w-48 bg-white/10 rounded animate-pulse" />
            <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-white/5 rounded animate-pulse" />
          </div>
        ) : (
          <article className="prose prose-invert prose-lg max-w-none
            prose-headings:text-white prose-headings:font-bold
            prose-h1:text-3xl prose-h1:mb-6 prose-h1:mt-8
            prose-h2:text-2xl prose-h2:mb-4 prose-h2:mt-8 prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-2
            prose-h3:text-xl prose-h3:mb-3 prose-h3:mt-6
            prose-p:text-white/80 prose-p:leading-relaxed
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-code:text-primary prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl
            prose-table:border-collapse
            prose-th:border prose-th:border-white/20 prose-th:bg-white/5 prose-th:px-4 prose-th:py-2 prose-th:text-left
            prose-td:border prose-td:border-white/10 prose-td:px-4 prose-td:py-2
            prose-li:text-white/80
            prose-strong:text-white
            prose-hr:border-white/10
          ">
            <ReactMarkdown>{content}</ReactMarkdown>
          </article>
        )}
      </main>
    </div>
  );
}
