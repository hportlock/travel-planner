import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { tools, toolsByName } from './tools.js';
import type { RestClientLike } from './client.js';

/**
 * Builds an MCP `Server` with the travel-plan tools wired to a REST client.
 * Transport-agnostic: the caller supplies both the transport (stdio or HTTP)
 * and a `clientFactory` that yields the `RestClientLike` a tool call runs
 * against. For stdio this is a process-wide PAT client; for the remote HTTP
 * transport it is a per-request client scoped to the authenticated user.
 */
export function createMcpServer(clientFactory: () => RestClientLike): Server {
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
    const client = clientFactory();
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

  return server;
}
