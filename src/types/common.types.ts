/**
 * Common Utility Types
 * =====================
 * Shared type utilities used across the application.
 * 
 * @module types/common
 */

import type { ReactNode } from 'react';

/**
 * Adds children prop to component props
 * @example
 * ```tsx
 * interface CardProps extends WithChildren {
 *   title: string;
 * }
 * ```
 */
export type WithChildren<T = object> = T & {
  children?: ReactNode;
};

/**
 * Adds className prop to component props
 * @example
 * ```tsx
 * interface ButtonProps extends WithClassName {
 *   onClick: () => void;
 * }
 * ```
 */
export type WithClassName<T = object> = T & {
  className?: string;
};

/**
 * Adds id prop to component props
 * @example
 * ```tsx
 * interface ItemProps extends WithId {
 *   name: string;
 * }
 * ```
 */
export type WithId<T = object> = T & {
  id: string;
};

/**
 * Makes a type nullable
 * @example
 * ```tsx
 * type MaybeUser = Nullable<User>;
 * ```
 */
export type Nullable<T> = T | null;

/**
 * Makes specific properties optional
 * @example
 * ```tsx
 * type PartialUser = PartialBy<User, 'id' | 'createdAt'>;
 * ```
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes specific properties required
 * @example
 * ```tsx
 * type RequiredUser = RequiredBy<PartialUser, 'name'>;
 * ```
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Extracts the resolved type of a Promise
 * @example
 * ```tsx
 * type Data = Awaited<Promise<{ name: string }>>;
 * // Data = { name: string }
 * ```
 */
export type AsyncReturnType<T extends (...args: any) => Promise<any>> = 
  T extends (...args: any) => Promise<infer R> ? R : never;
