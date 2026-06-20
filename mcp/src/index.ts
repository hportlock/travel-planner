import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { tools, toolsByName } from './tools.js';
import { clientFromEnv } from './client.js';

/**
 * MCP stdio server. PAT auth via env (TRAVEL_API_URL + TRAVEL_PAT). The tool
 * layer (tools.ts) is transport-agnostic, so an HTTP/OAuth transport can wrap
 * the same tools later without changes here.
 */
async function main(): Promise<void> {
  const server = new Server(
    { name: 'travel-plan', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.schema as any, { target: 'jsonSchema7' }) as any,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = toolsByName[req.params.name];
    if (!def) throw new Error(`Unknown tool: ${req.params.name}`);
    const input = def.schema.parse(req.params.arguments ?? {});
    const client = clientFromEnv();
    try {
      const result = await def.handler(client, input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
      };
    }
  });

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
