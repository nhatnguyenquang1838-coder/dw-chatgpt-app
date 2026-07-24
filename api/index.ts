import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod/v3";
import fs from "node:fs";
import path from "node:path";

const TEMPLATE_URI = "ui://dw-super/cockpit.html";

const widgetHtml = fs.readFileSync(
  path.join(process.cwd(), "widget", "dw-super-cockpit.html"),
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
    {
      name: "DW-SuperApps",
      branch: "main",
      sha: "6332c8f62614d581c45403cb5e3e0c4f528cbd70",
      status: "verified"
    },
    {
      name: "rental_home",
      branch: "main",
      sha: "88fb343c0f354661f9c2e309afe920de70b6a9a9",
      status: "warning"
    },
    {
      name: "gwc",
      branch: "main",
      sha: "b3edbb102fb5b0e7e1532e221d89c16896f17755",
      status: "verified"
    },
    {
      name: "Understand-Anything",
      branch: "main",
      sha: "6ae71878beb50226a1e4b7e2f52ac6468c86f74b",
      status: "warning"
    }
  ],
  risks: [
    {
      level: "high",
      title: "Stale governance package",
      detail: "Generated governance packages need regeneration before execution."
    },
    {
      level: "high",
      title: "Old .gwc/gwc assumption",
      detail: "Some instructions still point to nested GWC path."
    },
    {
      level: "medium",
      title: "UA metadata drift",
      detail: "Existing UA graph metadata is stale against current target main."
    }
  ],
  timeline: [
    {
      time: "2026-07-23T17:00:00Z",
      status: "done",
      event: "Repository state loaded"
    },
    {
      time: "2026-07-23T17:08:00Z",
      status: "done",
      event: "G0 inspection completed"
    },
    {
      time: "2026-07-23T17:17:30Z",
      status: "pending",
      event: "G1 approval requested"
    }
  ]
};

function createServer(): McpServer {
  const server = new McpServer(
    { name: "DW SUPER Governance Cockpit", version: "1.0.1" },
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
            "openai/widgetDescription":
              "DW SUPER governance cockpit with gate status, evidence, risks, and tokenized approval actions.",
            "openai/widgetPrefersBorder": true,
            "openai/widgetCSP": {
              connect_domains: [],
              resource_domains: []
            }
          }
        }
      ]
    })
  );

  server.registerTool(
    "get_dw_super_state",
    {
      title: "Get DW SUPER state",
      description:
        "Returns the current DW SUPER governance state and renders the cockpit widget.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        project: z.string(),
        task_id: z.string(),
        run_id: z.string(),
        current_gate: z.string(),
        status: z.string(),
        risk: z.string(),
        health: z.number(),
        scope_hash: z.string(),
        approval: z.object({}).passthrough(),
        repositories: z.array(z.object({}).passthrough()),
        risks: z.array(z.object({}).passthrough()),
        timeline: z.array(z.object({}).passthrough())
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: { resourceUri: TEMPLATE_URI },
        "openai/outputTemplate": TEMPLATE_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Loading DW SUPER…",
        "openai/toolInvocation/invoked": "DW SUPER loaded"
      }
    },
    async () => ({
      structuredContent: sampleState,
      content: [
        {
          type: "text",
          text:
            "DW SUPER governance cockpit loaded. Use the widget buttons to send model-visible actions into this conversation."
        }
      ]
    })
  );

  server.registerTool(
    "record_dw_super_action",
    {
      title: "Prepare DW SUPER action intent",
      description:
        "Returns a model-visible DW SUPER action intent. This MVP does not mutate GitHub, GWC, Slack, or audit state.",
      inputSchema: z.object({
        action: z.enum([
          "continue_gate",
          "approve_gate",
          "show_evidence",
          "explain_risk",
          "prepare_slack_update",
          "reject_gate"
        ]),
        task_id: z.string(),
        gate: z.string(),
        run_id: z.string().optional(),
        risk: z.string().optional(),
        scope_hash: z.string().optional(),
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
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Preparing DW SUPER action…",
        "openai/toolInvocation/invoked": "DW SUPER action prepared"
      }
    },
    async (input) => ({
      structuredContent: {
        accepted: true,
        action: input.action,
        task_id: input.task_id,
        gate: input.gate,
        message:
          input.action === "approve_gate"
            ? `Approval intent received with token ${input.approval_token ?? "missing"}.`
            : `DW SUPER action intent received: ${input.action}.`
      },
      content: [
        {
          type: "text",
          text:
            input.action === "approve_gate"
              ? `🟢 Approval intent received for ${input.gate}. Token: ${input.approval_token ?? "missing"}.`
              : `🔵 DW SUPER action received: ${input.action}.`
        }
      ]
    })
  );

  return server;
}

function setCorsHeaders(res: any): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, MCP-Session-Id"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "MCP-Protocol-Version, MCP-Session-Id"
  );
}

function sendJsonRpcError(
  res: any,
  status: number,
  code: number,
  message: string
): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null
  });
}

export default async function handler(req: any, res: any): Promise<void> {
  setCorsHeaders(res);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Stateless Streamable HTTP does not expose a server-initiated SSE stream.
  // MCP requires GET to return 405 when that stream is unsupported.
  if (req.method === "GET" || req.method === "HEAD") {
    res.setHeader("Allow", "POST, OPTIONS");
    sendJsonRpcError(res, 405, -32000, "SSE stream not supported");
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    sendJsonRpcError(res, 405, -32600, "Method not allowed");
    return;
  }

  const contentType = String(req.headers?.["content-type"] ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    sendJsonRpcError(
      res,
      415,
      -32600,
      "Content-Type must be application/json"
    );
    return;
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error("MCP request failed", error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, "Internal MCP server error");
    }
  }
}
