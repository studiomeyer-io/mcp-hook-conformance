import { z } from "zod";

export const SuiteNameSchema = z.enum([
  "idempotency",
  "latency",
  "determinism",
  "side-effects",
  "dsgvo"
]);
export type SuiteName = z.infer<typeof SuiteNameSchema>;

export const ALL_SUITES: SuiteName[] = [
  "idempotency",
  "latency",
  "determinism",
  "side-effects",
  "dsgvo"
];

export const StdioServerSchema = z.object({
  name: z.string().min(1),
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  cwd: z.string().optional()
});

export const HttpServerSchema = z.object({
  name: z.string().min(1),
  transport: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).default({})
});

export const ServerSchema = z.discriminatedUnion("transport", [
  StdioServerSchema,
  HttpServerSchema
]);
export type ServerConfig = z.infer<typeof ServerSchema>;

export const ThresholdsSchema = z
  .object({
    latencyP50Ms: z.number().int().positive().default(30000),
    latencyP95Ms: z.number().int().positive().default(60000)
  })
  .default({ latencyP50Ms: 30000, latencyP95Ms: 60000 });

export const ToolProbeSchema = z.object({
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
  stateProbe: z
    .object({
      tool: z.string().min(1),
      args: z.record(z.string(), z.unknown()).default({})
    })
    .optional()
});
export type ToolProbe = z.infer<typeof ToolProbeSchema>;

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  server: ServerSchema,
  suites: z.array(SuiteNameSchema).default(ALL_SUITES),
  tries: z.number().int().min(2).max(20).default(3),
  thresholds: ThresholdsSchema,
  probes: z.array(ToolProbeSchema).default([]),
  toolFilter: z.array(z.string()).optional()
});
export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(raw: unknown): Config {
  return ConfigSchema.parse(raw);
}
