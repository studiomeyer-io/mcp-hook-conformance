import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ServerConfig } from "./config.js";

export interface ConnectedClient {
  client: Client;
  close: () => Promise<void>;
}

export async function connectToServer(
  server: ServerConfig,
  clientName = "mcp-hook-conformance",
  clientVersion = "0.1.0"
): Promise<ConnectedClient> {
  const client = new Client(
    { name: clientName, version: clientVersion },
    { capabilities: {} }
  );

  if (server.transport === "stdio") {
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: { ...process.env, ...server.env } as Record<string, string>,
      cwd: server.cwd
    });
    await client.connect(transport);
    return {
      client,
      close: async () => {
        await client.close();
      }
    };
  }

  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: {
      headers: server.headers
    }
  });
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close();
    }
  };
}
