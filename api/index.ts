import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod/v3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_URI = "ui://dw-super/cockpit.html";

const widgetHtml = fs.readFileSync(
  path.join(__dirname, "..", "widget", "dw-super-cockpit.html"),
  "utf-8"
);

const sampleState = {
  project: "DW SUPER",
  task_id: "RH-UA-GWC-01",
  run_id: "g1-20260724-0017-rental-home-ua-refresh",
  source_instruction: "REPO",
  execution_mode: "chat_connector_only",
  repository: "nhatnguyenquang1838-coder/DW-SuperApps",
  target_system: "nhatnguyenquang1838-coder/rental_home",
  current_gate: "G1_ALIGNMENT",
  status: "WAITING_APPROVAL",
  risk: "R2",
  health: 82,
  scope_hash: "8c6dc26b45491407",
  approval: {
    gate: "G1_ALIGNMENT",
    token: "APPROVE_G1_RHUA04_20260724",
    label: "Approve G1 APPROVE_G1_RHUA04_20260724",
    expires_at_utc: "2026-07-24T17:17:30Z"
  },
  repositories: [
    { name: "DW-SuperApps", branch: "main", sha: "6332c8f62614d581c45403cb5e3e0c4f528cbd70", status: "verified" },
    { name: "rental_home", branch: "main", sha: "88fb343c0f354661f9c2e309afe920de70b6a9a9", status: "warning" },
    { name: "gwc", branch: "main", sha: "b3edbb102fb5b0e7e1532e221d89c16896f17755", status: "verified" },
    { name: "Understand-Anything", branch: "main", sha: "6ae71878beb50226a1e4b7e2f52ac6468c86f74b", status: "warning" }
  ],
  risks: [
    { level: "high", title: "Stale governance package", detail: "Generated governance packages need regeneration before execution." },
    { level: "high", title: "Old .gwc/gwc assumption", detail: "Some instructions still point to nested GWC path." },
    { level: "medium", title: "UA metadata drift", detail: "Existing UA graph metadata is stale against current target main." }
  ],
  timeline: [
    { time: "2026-07-23T17:00:00Z", status: "done", event: "Repository state loaded" },
    { time: "2026-07-23T17:08:00Z", status: "done", event: "G0 inspection completed" },
    { time: "2026-07-23T17:17:30Z", status: "pending", event: "G1 approval requested" }
  ]
};

const server = new McpServer(
  { name: "DW SUPER Governance Cockpit", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

server.registerResource(
  "dw_super_cockpit_widget",
  TEMPLATE_URI,
  {},
  async () => ({
    contents: [
      {
        uri: TEMPLATE_URI,
        mimeType: "text/html+skybridge",
        text: widgetHtml,
        _meta: {
          "openai/widgetDescription": "DW SUPER governance cockpit with gate status, evidence, risks, and tokenized approval actions.",
          "openai/widgetPrefersBorder": true,
          "openai/widgetCSP": { connect_domains: [], resource_domains: [] }
        }
      }
    ]
  })
);

server.registerTool(
  "get_dw_super_state",
  {
    title: "Get DW SUPER state",
    description: "Returns the current DW SUPER governance state and renders the cockpit widget.",
    outputSchema: z.object({
      project: z.string(),
      task_id: z.string(),
      run_id: z.string(),
      current_gate: z.string(),
      status: z.string(),
      risk: z.string(),
      health: z.number(),
      scope_hash: z.string(),
      approval: z.object({}),
      repositories: z.array(z.object({})),
      risks: z.array(z.object({})),
      timeline: z.array(z.object({}))
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false
    },
    _meta: {
      ui: { resourceUri: TEMPLATE_URI },
      "openai/outputTemplate": TEMPLATE_URI,
      "openai/toolInvocation/invoking": "Loading DW SUPER…",
      "openai/toolInvocation/invoked": "DW SUPER loaded"
    }
  },
  async () => ({
    structuredContent: sampleState,
    content: [
      {
        type: "text",
        text: "DW SUPER governance cockpit loaded. Use the widget buttons to send model-visible actions into this conversation."
      }
    ]
  })
);

server.registerTool(
  "record_dw_super_action",
  {
    title: "Record DW SUPER action intent",
    description: "Records a user action intent from the DW SUPER cockpit. This MVP records intent only.",
    inputSchema: z.object({
      action: z.string(),
      approval_token: z.string().optional()
    }),
    outputSchema: z.object({
      accepted: z.boolean(),
      action: z.string(),
      task_id: z.string(),
      gate: z.string(),
      message: z.string()
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false
    }
  },
  async (input: any) => ({
    structuredContent: {
      accepted: true,
      action: input.action,
      task_id: input.task_id,
      gate: input.gate,
      message:
        input.action === "approve_gate"
          ? `Approval intent received with token ${input.approval_token}.`
          : `DW SUPER action intent received: ${input.action}.`
    },
    content: [
      {
        type: "text",
        text:
          input.action === "approve_gate"
            ? `🟢 Approval intent received for ${input.gate}. Token: ${input.approval_token}.`
            : `🔵 DW SUPER action received: ${input.action}.`
      }
    ]
  })
);

let transport: StreamableHTTPServerTransport | null = null;

export const config = { runtime: "nodejs20.x" };

export default async function handler(req: any, res: any) {
  const rawBody = req.body;
  const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;

  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID()
    });
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, body);
}
