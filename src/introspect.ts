import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  nondeterministic?: boolean;
  cacheable?: boolean;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
}

export async function listTools(client: Client): Promise<ToolDescriptor[]> {
  const response = await client.listTools();
  const tools = (response.tools ?? []).map((t) => {
    const ann: ToolAnnotations = (t.annotations ?? {}) as ToolAnnotations;
    return {
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      annotations: ann
    };
  });
  return tools;
}

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  return result;
}
