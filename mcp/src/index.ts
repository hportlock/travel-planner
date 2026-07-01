import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { clientFromEnv } from './client.js';

/**
 * MCP stdio server. PAT auth via env (TRAVEL_API_URL + TRAVEL_PAT). The tool
 * layer (tools.ts) and server wiring (server.ts) are transport-agnostic, so
 * the same tools are also mounted over HTTP by the Express `server` package.
 */
async function main(): Promise<void> {
  const server = createMcpServer(clientFromEnv);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error('[travel-plan-mcp] connected over stdio');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[travel-plan-mcp] fatal', err);
  process.exit(1);
});
