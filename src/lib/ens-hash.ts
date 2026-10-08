/** Loaded only when an ENS profile is shared. */
export async function ensNamehash(name: string): Promise<string> {
  const { namehash } = await import('ethers');
  return namehash(name);
}
