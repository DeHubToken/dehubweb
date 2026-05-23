import { X, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PollData, PollOption } from '../types';

interface PollEditorProps {
  poll: PollData;
  onChange: (poll: PollData) => void;
  onRemove: () => void;
}

const DURATION_OPTIONS = [
  { label: '1 day', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
];

export function PollEditor({ poll, onChange, onRemove }: PollEditorProps) {
  const updateOption = (id: string, text: string) => {
    onChange({
      ...poll,
      options: poll.options.map(o => o.id === id ? { ...o, text } : o),
    });
  };

  const removeOption = (id: string) => {
    onChange({ ...poll, options: poll.options.filter(o => o.id !== id) });
  };

  const addOption = () => {
    if (poll.options.length >= 4) return;
    onChange({
      ...poll,
      options: [...poll.options, { id: Date.now().toString(), text: '' }],
    });
  };

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">Poll</span>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-white/50" />
        </button>
      </div>

      {/* Question */}
      <div className="px-3 pt-3">
        <input
          type="text"
          value={poll.question}
          onChange={e => onChange({ ...poll, question: e.target.value })}
          placeholder="Ask a question..."
          maxLength={200}
          className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none mb-2"
        />
      </div>

      {/* Options */}
      <div className="p-3 flex flex-col gap-2">
        {poll.options.map((option, idx) => (
          <div key={option.id} className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2">
              <span className="text-xs text-white/30 font-medium w-4 shrink-0">{idx + 1}</span>
              <input
                type="text"
                value={option.text}
                onChange={e => updateOption(option.id, e.target.value)}
                placeholder={`Option ${idx + 1}`}
                maxLength={60}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
              />
            </div>
            {poll.options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(option.id)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5 text-white/40" />
              </button>
            )}
          </div>
        ))}

        {poll.options.length < 4 && (
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-white/15 text-xs text-white/40 hover:text-white/60 hover:border-white/25 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add option
          </button>
        )}
      </div>

      {/* Multiple choice */}
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => onChange({ ...poll, isMultipleChoice: !poll.isMultipleChoice })}
          className="flex items-center gap-2 text-xs text-white/50 hover:text-white/70 transition-colors"
        >
          <span className={cn(
            'w-4 h-4 rounded flex items-center justify-center border transition-colors',
            poll.isMultipleChoice ? 'bg-blue-500 border-blue-500' : 'border-white/30'
          )}>
            {poll.isMultipleChoice && <Check className="w-2.5 h-2.5 text-white" />}
          </span>
          Allow multiple answers
        </button>
      </div>

      {/* Duration */}
      <div className="px-3 pb-3 flex items-center gap-2">
        <span className="text-xs text-white/40 shrink-0">Duration:</span>
        <div className="flex gap-1.5">
          {DURATION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...poll, duration: opt.value })}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                poll.duration === opt.value
                  ? 'bg-white text-black'
                  : 'bg-white/[0.06] text-white/50 hover:bg-white/10 hover:text-white/70'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
