/** @maldoteth's wallet, plus his erased account's wallet. */
const AGENT_MANAGERS = ['0xec4e2c7417f781b35d830671f013b3b91f29ba64', '0x9324840523a5d17dd12a2f11a9472e5a199c1937'];

export const canManageAgents = (wallet?: string | null) =>
  !!wallet && AGENT_MANAGERS.includes(wallet.toLowerCase());
