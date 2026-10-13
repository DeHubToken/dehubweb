import React, { type HTMLAttributes } from 'react';

/** Separate scroll and nav transforms so each layer remains compositable. */
export function FeedSwallowMotion({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-feed-swallow-cut data-kit-flat-skip>
      <div data-feed-swallow-motion>
        <div data-feed-swallow-content {...props}>{children}</div>
      </div>
    </div>
  );
}
