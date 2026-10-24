/** Read-only readiness probe. Old/missing schema and connection failures keep
 * the new UI off; they never turn a failed write into a legacy retry. */
export async function workspaceCapabilities(db: any): Promise<{ workspace: boolean; version: number }> {
  try {
    const result = await db.rpc('agent_workspace_ready');
    return { workspace: !result.error && result.data === true, version: 1 };
  } catch {
    return { workspace: false, version: 1 };
  }
}
