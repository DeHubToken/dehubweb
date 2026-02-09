import { Check, Clock, Loader2, Star, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { type SubscriptionPlan } from '@/lib/api/dehub';
import { useBuyPlan } from '@/hooks/use-subscriptions';
import dehubCoin from '@/assets/dehub-coin.png';

interface PlanCardProps {
  plan: SubscriptionPlan;
  isOwner?: boolean;
  isSubscribed?: boolean;
  onEdit?: () => void;
}

function formatDuration(days: number): string {
  if (days === 7) return '1 week';
  if (days === 30) return '1 month';
  if (days === 90) return '3 months';
  if (days === 365) return '1 year';
  return `${days} days`;
}

export function PlanCard({ plan, isOwner, isSubscribed, onEdit }: PlanCardProps) {
  const buyPlanMutation = useBuyPlan();
  const planId = plan._id || plan.id || '';

  const handleSubscribe = async () => {
    if (!planId) return;
    await buyPlanMutation.mutateAsync(planId);
  };

  return (
    <div className="relative rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5 hover:border-white/20 transition-all">
      {/* Plan header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            {plan.name}
          </h3>
          {plan.description && (
            <p className="text-sm text-zinc-400 mt-1">{plan.description}</p>
          )}
        </div>
        {isSubscribed && (
          <span className="px-2 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium">
            Subscribed
          </span>
        )}
      </div>

      {/* Price & Duration */}
      <div className="flex items-baseline gap-2 mb-4">
        <div className="flex items-center gap-1.5">
          <img src={dehubCoin} alt="DHB" className="w-5 h-5" />
          <span className="text-2xl font-bold text-white">{plan.price}</span>
          <span className="text-zinc-400">DHB</span>
        </div>
        <span className="text-zinc-500">/</span>
        <div className="flex items-center gap-1 text-zinc-400">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-sm">{formatDuration(plan.duration)}</span>
        </div>
      </div>

      {/* Benefits */}
      {plan.benefits && plan.benefits.length > 0 && (
        <ul className="space-y-2 mb-4">
          {plan.benefits.map((benefit, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm text-zinc-300">
              <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Subscriber count */}
      {typeof plan.subscriberCount === 'number' && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-4">
          <Users className="w-3.5 h-3.5" />
          <span>{plan.subscriberCount} subscriber{plan.subscriberCount !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Actions */}
      {isOwner ? (
        <Button
          onClick={onEdit}
          variant="outline"
          className="w-full rounded-xl border-white/20 text-white hover:bg-white/10"
        >
          Edit Plan
        </Button>
      ) : isSubscribed ? (
        <Button
          disabled
          className="w-full rounded-xl bg-white/10 text-zinc-400 cursor-not-allowed"
        >
          <Check className="w-4 h-4 mr-2" />
          Subscribed
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={buyPlanMutation.isPending}
              className="w-full rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-semibold"
            >
              {buyPlanMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Subscribing...
                </>
              ) : (
                <>
                  <Star className="w-4 h-4 mr-2" />
                  Subscribe
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-zinc-900 border-zinc-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Confirm Subscription</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">
                Subscribe to <span className="text-white font-medium">{plan.name}</span> for{' '}
                <span className="text-yellow-400 font-medium">{plan.price} DHB</span> / {formatDuration(plan.duration)}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSubscribe}
                disabled={buyPlanMutation.isPending}
                className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black font-semibold"
              >
                {buyPlanMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Star className="w-4 h-4 mr-2" />
                )}
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}