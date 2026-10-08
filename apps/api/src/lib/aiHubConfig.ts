// Server-side AI Hub kill switch (AI-1F1). AI_HUB_ENABLED is the global
// emergency off switch; later MCP/ingestion entry points must call this before
// doing any work. Default-safe: only the literal 'true' enables.
export function isAiHubServerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return typeof env.AI_HUB_ENABLED === 'string' && env.AI_HUB_ENABLED.trim().toLowerCase() === 'true';
}
