/** A slow optional chain must settle into a retry state, not hide the wallet indefinitely. */
export async function readWalletBalance<T>(read: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Wallet balance lookup timed out')), 15_000);
    })]);
  } finally { clearTimeout(timer); }
}
