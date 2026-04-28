/**
 * Standalone mock MCP server used by integration tests.
 * Behavior is controlled via env vars so the same binary can simulate
 * idempotent / non-idempotent / slow / persisting tools.
 *
 * MOCK_BEHAVIOR:
 *   "idempotent"          - get_count always returns { count: 0 }, no side effects
 *   "nonidempotent"       - get_count returns incremented count each call
 *   "slow"                - get_count sleeps 200ms then returns { count: 0 }
 *   "uuid-leak"           - returns { id: "<random-uuid>", count: 0 }
 *   "persisting"          - call() bumps internal counter; get_count returns it
 *   "destructive-no-doc"  - exposes a destructive tool with no doc keywords
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";

const behavior = process.env.MOCK_BEHAVIOR ?? "idempotent";
let counter = 0;

const server = new Server(
  { name: "mock-server", version: "0.0.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [
    {
      name: "get_count",
      description:
        "Return the current counter. Read-only. Documents data flow: in-memory only, no retention, no GDPR personal data.",
      inputSchema: { type: "object", properties: {} },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false
      }
    },
    {
      name: "bump",
      description:
        "Increment the counter. Destructive write to in-memory state. Data is purged on server shutdown (no retention, no storage on disk, no personal data, GDPR n/a).",
      inputSchema: { type: "object", properties: {} },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true
      }
    }
  ];
  if (behavior === "destructive-no-doc") {
    tools.push({
      name: "delete_user",
      description: "Removes a user.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: false, destructiveHint: true }
    });
  }
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  if (name === "get_count") {
    if (behavior === "slow") {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (behavior === "nonidempotent") {
      counter++;
      return { content: [{ type: "text", text: JSON.stringify({ count: counter }) }] };
    }
    if (behavior === "uuid-leak") {
      return {
        content: [
          { type: "text", text: JSON.stringify({ id: randomUUID(), count: counter }) }
        ]
      };
    }
    if (behavior === "persisting") {
      return { content: [{ type: "text", text: JSON.stringify({ count: counter }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify({ count: 0 }) }] };
  }
  if (name === "bump") {
    counter++;
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, count: counter }) }] };
  }
  if (name === "delete_user") {
    return { content: [{ type: "text", text: "{}" }] };
  }
  throw new Error(`Unknown tool: ${name}`);
});

// "persisting" mock: every get_count silently bumps state, simulating a tool
// that claims to be readOnly but actually writes.
if (behavior === "persisting") {
  const original = server.setRequestHandler.bind(server);
  // Re-register get_count so it bumps on every call.
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === "get_count") {
      counter++;
      return { content: [{ type: "text", text: JSON.stringify({ count: counter }) }] };
    }
    if (req.params.name === "bump") {
      counter++;
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, count: counter }) }] };
    }
    throw new Error(`Unknown tool: ${req.params.name}`);
  });
  void original;
}

const transport = new StdioServerTransport();
await server.connect(transport);
