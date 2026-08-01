import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

const TEMPLATE_URI = "ui://dw-super/gg-bridge.html";

const server = new McpServer(
  { name: "GG UI Bridge", version: "2.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

type RenderInput = { payload: unknown };

type UiAction = {
  view_id: string;
  task_id: string;
  gate: string;
  action: string;
};

const actionSchema = z.object({
  view_id: z.string(),
  task_id: z.string(),
  gate: z.string(),
  action: z.string()
});

const widgetHtml = `
<div class="gg-root" data-app="gg-ui-bridge">
  <style>
    :root { color-scheme: light dark; }
    .gg-root {
      --surface: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --border: #e5e7eb;
      --primary: #2563eb;
      --primary-soft: #dbeafe;
      --danger: #dc2626;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      width: 100%;
      max-width: 920px;
      margin: 0 auto;
    }
    @media (prefers-color-scheme: dark) {
      .gg-root {
        --surface: #0f172a;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --border: #334155;
        --primary-soft: rgba(37, 99, 235, .22);
      }
    }
    .gg-shell { display: grid; gap: 12px; }
    .gg-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px;
    }
    .gg-header { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .gg-title { margin: 0; font-size: 16px; font-weight: 750; }
    .gg-status { color: var(--muted); font-size: 12px; }
    .gg-payload {
      margin: 0;
      max-height: 560px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .gg-actions { display: grid; gap: 8px; }
    .gg-actions:empty { display: none; }
    .gg-button {
      width: 100%;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      border-radius: 12px;
      padding: 11px 13px;
      font: inherit;
      font-weight: 700;
      text-align: left;
      cursor: pointer;
    }
    .gg-button:hover { border-color: var(--primary); background: var(--primary-soft); }
    .gg-button.primary { background: var(--primary); border-color: var(--primary); color: #ffffff; }
    .gg-button.danger { color: var(--danger); }
    .gg-button:disabled { cursor: not-allowed; opacity: .6; }
    .gg-error { color: var(--danger); font-size: 12px; white-space: pre-wrap; }
    .gg-error:empty { display: none; }
  </style>

  <main class="gg-shell" aria-label="GG UI bridge">
    <section class="gg-card">
      <div class="gg-header">
        <h2 class="gg-title">GG UI Bridge</h2>
        <span class="gg-status" id="bridgeStatus">Waiting for GPT payload</span>
      </div>
    </section>

    <section class="gg-card">
      <pre class="gg-payload" id="payloadView" aria-live="polite">null</pre>
    </section>

    <section class="gg-card gg-actions" id="actionList" aria-label="Available actions"></section>
    <div class="gg-error" id="bridgeError" role="alert"></div>
  </main>

  <script>
    let currentPayload = null;

    function isRecord(value) {
      return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function displayPayload(payload) {
      currentPayload = payload;
      const view = document.getElementById("payloadView");
      view.textContent = JSON.stringify(payload, null, 2);
      document.getElementById("bridgeStatus").textContent = "Payload rendered unchanged";
      renderActions(payload);
    }

    function normalizeActions(payload) {
      if (!isRecord(payload) || !Array.isArray(payload.actions)) return [];
      return payload.actions.flatMap((item) => {
        if (typeof item === "string") {
          return [{ action: item, label: item, kind: "default", disabled: false }];
        }
        if (!isRecord(item) || typeof item.action !== "string") return [];
        return [{
          action: item.action,
          label: typeof item.label === "string" ? tem.label : item.action,
          kind: item.kind === "primary" || item.kind === "danger" ? item.kind : "default",
          disabled: item.disabled === true
        }];
      });
    }

    function actionContext(payload, action) {
      const record = isRecord(payload) ? payload : {};
      return {
        view_id: typeof record.view_id === "string" ? record.view_id : "",
        task_id: typeof record.task_id === "string" ? record.task_id : "",
        gate: typeof record.gate === "string"
          ? record.gate
          : (typeof record.current_gate === "string" ? record.current_gate : ""),
        action
      };
    }

    async function sendAction(args) {
      const openai = typeof window !== "undefined" ? window.openai : undefined;

      if (openai?.callTool) {
        const result = await openai.callTool("emit_action", args);
        if (openai.sendFollowUpMessage) {
          await openai.sendFollowUpMessage({
            prompt: "GG_UI_ACTION " + JSON.stringify(args),
            scrollToBottom: true
          });
        }
        return result;
      }

      if (openai?.sendFollowUpMessage) {
        await openai.sendFollowUpMessage({
          prompt: "GG_UI_ACTION " + JSON.stringify(args),
          scrollToBottom: true
        });
        return args;
      }

      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          jsonrpc: "2.0",
          method: "ui/message",
          params: {
            role: "user",
            content: [{ type: "text", text: "GG_UI_ACTION " + JSON.stringify(args) }]
          }
        }, "*");
        return args;
      }

      throw new Error("ChatGPT bridge is unavailable in this preview context.");
    }

    function renderActions(payload) {
      const container = document.getElementById("actionList");
      container.replaceChildren();

      for (const item of normalizeActions(payload)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gg-button" + (item.kind === "default" ? "" : " " + item.kind);
        button.textContent = item.label;
        button.disabled = item.disabled;
        button.addEventListener("click", async () => {
          const error = document.getElementById("bridgeError");
          error.textContent = "";
          button.disabled = true;
          try {
            const args = actionContext(currentPayload, item.action);
            await sendAction(args);
            document.getElementById("bridgeStatus").textContent = "Action returned to GPT";
          } catch (cause) {
            error.textContent = cause instanceof Error ? cause.message : String(cause);
          } finally {
            button.disabled = item.disabled;
          }
        });
        container.appendChild(button);
      }
    }

    function extractPayload(message) {
      if (!message || message.jsonrpc !== "2.0") return undefined;
      if (message.method !== "ui/notifications/tool-result") return undefined;
      const structured = message.params?.structuredContent;
      if (!isRecord(structured) || !("payload" in structured)) return undefined;
      return structured.payload;
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const payload = extractPayload(event.data);
      if (payload !== undefined) displayPayload(payload);
    }, { passive: true });

    if (typeof window !== "undefined" && window.openai?.toolOutput) {
      const output = window.openai.toolOutput;
      if (isRecord(output) && "payload" in output) displayPayload(output.payload);
    }
  </script>
</div>
`;

server.registerResource(
  "gg_ui_bridge",
  TEMPLATE_URI,
  {},
  async () => ({
    contents: [
      {
        uri: TEMPLATE_URI,
        mimeType: "text/html;profile=mcp-app",
        text: widgetHtml,
        _meta: {
          "openai/widgetDescription": "A stateless UI bridge that displays the GPT payload and returns button actions to GPT.",
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
  "render",
  {
    title: "Render GPT payload",
    description: "Displays the supplied GPT payload without adding governance state or hydrating it from another source.",
    inputSchema: z.object({ payload: z.unknown() }),
    outputSchema: z.object({ payload: z.unknown() }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false
    },
    _meta: {
      ui: { resourceUri: TEMPLATE_URG },
      "openai/outputTemplate": TEMPLATE_URI,
      "openai/toolInvocation/invoking": "Rendering payload...",
      "openai/toolInvocation/invoked": "Payload rendered"
    }
  },
  async ({ payload }: RenderInput) => ({
    structuredContent: { payload },
    content: [{ type: "text", text: "GG rendered the GPT payload unchanged." }]
  })
);

server.registerTool(
  "emit_action",
  {
    title: "Emit UI action",
    description: "Returns a user button click to GPT. It does not approve, mutate, hydrate, or persist governance state.",
    inputSchema: actionSchema,
    outputSchema: actionSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false
    }
  },
  async (input: UiAction) => ({
    structuredContent: input,
    content: [{ type: "text", text: `GG_UI_ACTION ${JSON.stringify(input)}` }]
  })
);

export default server;
