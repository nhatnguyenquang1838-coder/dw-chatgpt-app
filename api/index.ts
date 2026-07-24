import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
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

const approvalSchema = z.object({
  gate: z.string(),
  token: z.string(),
  label: z.string(),
  expires_at_utc: z.string()
});

const repositorySchema = z.object({
  name: z.string(),
  branch: z.string(),
  sha: z.string(),
  status: z.string()
});

const riskSchema = z.object({
  level: z.string(),
  title: z.string(),
  detail: z.string()
});

const timelineSchema = z.object({
  time: z.string(),
  status: z.string(),
  event: z.string()
});

function createServer(): McpServer {
  const server = new McpServer({
    name: "DW SUPER Governance Cockpit",
    version: "1.1.0"
  });

  registerAppResource(
    server,
    "DW SUPER Governance Cockpit",
    TEMPLATE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Interactive DW SUPER governance cockpit for ChatGPT."
    },
    async () => ({
      contents: [
        {
          uri: TEMPLATE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              csp: {
                connectDomains: [],
                resourceDomains: []
              },
              prefersBorder: true
            }
          }
        }
      ]
    })
  );

  registerAppTool(
    server,
    "get_dw_super_state",
    {
      title: "Get DW SUPER state",
      description:
        "Returns the current DW SUPER governance state and renders the interactive cockpit.",
      inputSchema: {},
      outputSchema: {
        project: z.string(),
        task_id: z.string(),
        run_id: z.string(),
        current_gate: z.string(),
        status: z.string(),
        risk: z.string(),
        health: z.number(),
        scope_hash: z.string(),
        approval: approvalSchema,
        repositories: z.array(repositorySchema),
        risks: z.array(riskSchema),
        timeline: z.array(timelineSchema)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: {
          resourceUri: TEMPLATE_URI,
          visibility: ["model", "app"]
        }
      }
    },
    async () => ({
      structuredContent: sampleState,
      content: [
        {
          type: "text" as const,
          text:
            "DW SUPER governance cockpit loaded. The widget can send model-visible actions into this conversation."
        }
      ]
    })
  );

  registerAppTool(
    server,
    "record_dw_super_action",
    {
      title: "Prepare DW SUPER action intent",
      description:
        "Returns a model-visible DW SUPER action intent. This MVP does not mutate GitHub, GWC, Slack, or audit state.",
      inputSchema: {
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
      },
      outputSchema: {
        accepted: z.boolean(),
        action: z.string(),
        task_id: z.string(),
        gate: z.string(),
        message: z.string()
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: {
        ui: {
          resourceUri: TEMPLATE_URI,
          visibility: ["model", "app"]
        }
      }
    },
    async (input) => {
      const message =
        input.action === "approve_gate"
          ? `Approval intent received with token ${input.approval_token ?? "missing"}.`
          : `DW SUPER action intent received: ${input.action}.`;

      return {
        structuredContent: {
          accepted: true,
          action: input.action,
          task_id: input.task_id,
          gate: input.gate,
          message
        },
        content: [
          {
            type: "text" as const,
            text:
              input.action === "approve_gate"
                ? `🟢 Approval intent received for ${input.gate}. Token: ${input.approval_token ?? "missing"}.`
                : `🔵 DW SUPER action received: ${input.action}.`
          }
        ]
      };
    }
  );

  return server;
}

function setCorsHeaders(res: any): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, MCP-Session-Id"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "MCP-Protocol-Version, MCP-Session-Id"
  );
}

export default async function handler(req: any, res: any): Promise<void> {
  setCorsHeaders(res);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!req.method || !["POST", "GET", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);

    if (req.method === "POST") {
      await transport.handleRequest(req, res, req.body);
      return;
    }

    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("MCP request failed", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal MCP server error" });
    }
  }
}
