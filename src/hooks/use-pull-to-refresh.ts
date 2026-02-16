/**
 * Pull-to-Refresh Hook (DISABLED)
 * ================================
 * Pull-to-refresh functionality has been disabled.
 * This hook returns no-op handlers to maintain API compatibility.
 * 
 * @module hooks/use-pull-to-refresh
 */

import { RefObject } from 'react';

interface UsePullToRefreshOptions {
  pullThreshold?: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  containerRef?: RefObject<HTMLElement>;
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  isPulling: boolean;
  isHoldingAtThreshold: boolean;
  holdProgress: number;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
  };
}

const noop = () => {};

export function usePullToRefresh(_options: UsePullToRefreshOptions): UsePullToRefreshReturn {
  return {
    pullDistance: 0,
    isPulling: false,
    isHoldingAtThreshold: false,
    holdProgress: 0,
    handlers: {
      onTouchStart: noop,
      onTouchMove: noop,
      onTouchEnd: noop,
      onMouseDown: noop,
      onMouseMove: noop,
      onMouseUp: noop,
      onMouseLeave: noop,
    },
  };
}
