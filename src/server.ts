import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

const TEMPLATE_URI = "ui://dw-super/gg-bridge.html";

const server = new McpServer(
  { name: "GG UI Bridge", version: "2.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

type RenderInput = { payload: unknown };
type UiAction = { view_id: string; task_id: string; gate: string; action: string };

const actionSchema = z.object({
  view_id: z.string(),
  task_id: z.string(),
  gate: z.string(),
  action: z.string()
});

const widgetHtml = `
<div class="gg-root">
  <style>
    :root { color-scheme: light dark; }
    .gg-root {
      --surface: #fff; --text: #111827; --muted: #6b7280; --border: #e5e7eb;
      --primary: #2563eb; --primary-soft: #dbeafe; --danger: #dc2626;
      color: var(--text); font-family: Inter, system-ui, sans-serif; max-width: 920px; margin: auto;
    }
    @media (prefers-color-scheme: dark) {
      .gg-root { --surface: #0f172a; --text: #e5e7eb; --muted: #94a3b8; --border: #334155; --primary-soft: #172554; }
    }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 14px; margin-bottom: 12px; }
    .head { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    h2 { margin: 0; font-size: 16px; } .status { color: var(--muted); font-size: 12px; }
    pre { margin: 0; max-height: 560px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 ui-monospace, monospace; }
    .actions { display: grid; gap: 8px; } .actions:empty { display: none; }
    button { width: 100%; border: 1px solid var(--border); border-radius: 12px; padding: 11px 13px; background: var(--surface); color: var(--text); font: inherit; font-weight: 700; text-align: left; cursor: pointer; }
    button:hover { border-color: var(--primary); background: var(--primary-soft); }
    button.primary { background: var(--primary); border-color: var(--primary); color: white; }
    button.danger { color: var(--danger); } button:disabled { opacity: .6; cursor: not-allowed; }
    .error { color: var(--danger); font-size: 12px; white-space: pre-wrap; } .error:empty { display: none; }
  </style>

  <section class="card head">
    <h2>GG UI Bridge</h2><span class="status" id="status">Waiting for GPT payload</span>
  </section>
  <section class="card"><pre id="payload" aria-live="polite">null</pre></section>
  <section class="card actions" id="actions" aria-label="Available actions"></section>
  <div class="error" id="error" role="alert"></div>

  <script>
    let currentPayload = null;
    const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

    function renderPayload(payload) {
      currentPayload = payload;
      document.getElementById("payload").textContent = JSON.stringify(payload, null, 2);
      document.getElementById("status").textContent = "Payload rendered unchanged";
      renderButtons(payload);
    }

    function normalizeActions(payload) {
      if (!isRecord(payload) || !Array.isArray(payload.actions)) return [];
      return payload.actions.flatMap(item => {
        if (typeof item === "string") return [{ action: item, label: item, kind: "default", disabled: false }];
        if (!isRecord(item) || typeof item.action !== "string") return [];
        return [{
          action: item.action,
          label: typeof item.label === "string" ? item.label : item.action,
          kind: item.kind === "primary" || item.kind === "danger" ? item.kind : "default",
          disabled: item.disabled === true
        }];
      });
    }

    function actionArgs(action) {
      const payload = isRecord(currentPayload) ? currentPayload : {};
      return {
        view_id: typeof payload.view_id === "string" ? payload.view_id : "",
        task_id: typeof payload.task_id === "string" ? payload.task_id : "",
        gate: typeof payload.gate === "string" ? payload.gate : (typeof payload.current_gate === "string" ? payload.current_gate : ""),
        action
      };
    }

    async function emit(args) {
      const bridge = window.openai;
      if (bridge?.callTool) {
        const result = await bridge.callTool("emit_action", args);
        if (bridge.sendFollowUpMessage) {
          await bridge.sendFollowUpMessage({ prompt: "GG_UI_ACTION " + JSON.stringify(args), scrollToBottom: true });
        }
        return result;
      }
      if (bridge?.sendFollowUpMessage) {
        await bridge.sendFollowUpMessage({ prompt: "GG_UI_ACTION " + JSON.stringify(args), scrollToBottom: true });
        return args;
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ jsonrpc: "2.0", method: "ui/message", params: { role: "user", content: [{ type: "text", text: "GG_UI_ACTION " + JSON.stringify(args) }] } }, "*");
        return args;
      }
      throw new Error("ChatGPT bridge unavailable in preview context.");
    }

    function renderButtons(payload) {
      const container = document.getElementById("actions");
      container.replaceChildren();
      for (const item of normalizeActions(payload)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = item.kind === "default" ? "" : item.kind;
        button.textContent = item.label;
        button.disabled = item.disabled;
        button.addEventListener("click", async () => {
          const error = document.getElementById("error");
          error.textContent = ""; button.disabled = true;
          try { await emit(actionArgs(item.action)); document.getElementById("status").textContent = "Action returned to GPT"; }
          catch (cause) { error.textContent = cause instanceof Error ? cause.message : String(cause); }
          finally { button.disabled = item.disabled; }
        });
        container.appendChild(button);
      }
    }

    function toolPayload(message) {
      if (!message || message.jsonrpc !== "2.0" || message.method !== "ui/notifications/tool-result") return undefined;
      const structured = message.params?.structuredContent;
      return isRecord(structured) && "payload" in structured ? structured.payload : undefined;
    }

    window.addEventListener("message", event => {
      if (event.source !== window.parent) return;
      const payload = toolPayload(event.data);
      if (payload !== undefined) renderPayload(payload);
    }, { passive: true });

    const initial = window.openai?.toolOutput;
    if (isRecord(initial) && "payload" in initial) renderPayload(initial.payload);
  </script>
</div>`;

server.registerResource("gg_ui_bridge", TEMPLATE_URI, {}, async () => ({
  contents: [{
    uri: TEMPLATE_URI,
    mimeType: "text/html;profile=mcp-app",
    text: widgetHtml,
    _meta: {
      "openai/widgetDescription": "Stateless UI bridge that displays a GPT payload and returns button actions to GPT.",
      "openai/widgetPrefersBorder": true,
      "openai/widgetCSP": { connect_domains: [], resource_domains: [] }
    }
  }]
}));

server.registerTool("render", {
  title: "Render GPT payload",
  description: "Displays the supplied GPT payload without adding or hydrating governance state.",
  inputSchema: z.object({ payload: z.unknown() }),
  outputSchema: z.object({ payload: z.unknown() }),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: {
    ui: { resourceUri: TEMPLATE_URI },
    "openai/outputTemplate": TEMPLATE_URI,
    "openai/toolInvocation/invoking": "Rendering payload...",
    "openai/toolInvocation/invoked": "Payload rendered"
  }
}, async ({ payload }: RenderInput) => ({
  structuredContent: { payload },
  content: [{ type: "text", text: "GG rendered the GPT payload unchanged." }]
}));

server.registerTool("emit_action", {
  title: "Emit UI action",
  description: "Returns a user button click to GPT without approving, mutating, hydrating, or persisting governance state.",
  inputSchema: actionSchema,
  outputSchema: actionSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input: UiAction) => ({
  structuredContent: input,
  content: [{ type: "text", text: `GG_UI_ACTION ${JSON.stringify(input)}` }]
}));

export default server;
