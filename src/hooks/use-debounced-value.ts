/**
 * Debounced Value Hook
 * =====================
 * Returns a debounced version of a value that updates after a delay.
 * Useful for search inputs to prevent excessive API calls.
 * 
 * @module hooks/use-debounced-value
 * @example
 * ```tsx
 * const debouncedQuery = useDebouncedValue(searchQuery, 300);
 * // debouncedQuery updates 300ms after searchQuery stops changing
 * ```
 */

import { useState, useEffect } from 'react';

/**
 * Hook that returns a debounced value
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns The debounced value
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
