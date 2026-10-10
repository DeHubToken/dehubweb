/** Only transient failures can improve when the same profile request is repeated. */
export function shouldRetryProfile(failureCount: number, error: Error): boolean {
  const status = (error as Error & { httpStatus?: number }).httpStatus;
  if (error.name === 'AuthenticationError' || (status != null && status >= 400 && status < 500)) return false;
  if (error.message === 'Profile not found') return failureCount < 4;
  return failureCount < 3;
}
