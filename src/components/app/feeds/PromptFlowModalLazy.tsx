import { Suspense, lazy, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import type { PromptFlowModal as PromptFlowModalComponent } from './PromptFlowModal';

const PromptFlowModal = lazy(() =>
  import('./PromptFlowModal').then((module) => ({ default: module.PromptFlowModal })),
);

export function PromptFlowModalLazy(props: ComponentProps<typeof PromptFlowModalComponent>) {
  const [everOpened, setEverOpened] = useState(props.open);
  useEffect(() => {
    if (props.open) setEverOpened(true);
  }, [props.open]);

  // Load on first use, then preserve the modal state and closing animation.
  if (!everOpened) return null;

  return (
    <Suspense fallback={null}>
      <PromptFlowModal {...props} />
    </Suspense>
  );
}
