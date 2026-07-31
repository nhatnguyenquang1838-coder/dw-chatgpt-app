import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { sampleState } from "./sample-state.js";
import crypto from "node:crypto";
import { getOAuthConfig } from "./auth-config.js";

const TEMPLATE_URI = "ui://dw-super/cockpit.html";

const server = new McpServer(
  { name: "DW SUPER Governance Cockpit", version: "1.2.0" },
  { capabilities: { tools: {}, resources: {} } }
);

type OAuthSessionState = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // timestamp in ms
  providerUserId: string;
  workspaceId: string;
};

const oauthSessions = new Map<string, OAuthSessionState>();
const activeSession = new Map<string, string>(); // session cookie ID -> sessionId

const oauthConfig = getOAuthConfig();

// GET /api/auth/gg/authorize
export const authorizeGG = async () => {
  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = new URL(oauthConfig.authorizationUrl);
  authUrl.searchParams.set("client_id", oauthConfig.clientId);
  authUrl.searchParams.set("redirect_uri", oauthConfig.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", oauthConfig.scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", crypto.createHash("sha256").update(state).digest("base64url"));
  authUrl.searchParams.set("code_challenge_method", "S256");
  return { url: authUrl.toString(), state };
};

// GET /api/auth/gg/callback
export const callbackGG = async (code: string, state: string, storedState: string) => {
  if (state !== storedState) throw new Error("Invalid state");
  
  const tokenResponse = await fetch(oauthConfig.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
      code,
      redirect_uri: oauthConfig.redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!tokenResponse.ok) throw new Error("Token exchange failed");
  const tokens = await tokenResponse.json();
  
  const sessionId = crypto.randomUUID();
  oauthSessions.set(sessionId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    providerUserId: tokens.user_id,
    workspaceId: "default"
  });

  return { sessionId };
};

// POST /api/auth/gg/logout
export const logoutGG = async (sessionId: string) => {
  const session = oauthSessions.get(sessionId);
  if (session && oauthConfig.revocationUrl) {
     await fetch(oauthConfig.revocationUrl, {
        method: "POST",
        body: JSON.stringify({ token: session.accessToken })
     });
  }
  oauthSessions.delete(sessionId);
  activeSession.delete(sessionId);
  return { success: true };
};

function getSessionId(): string {
  return activeSession.get("current") ?? "default";
}

function setSessionId(sessionId: string): void {
  activeSession.set("current", sessionId);
}

// GG Client with OAuth
async function callGG(sessionId: string, path: string): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  const session = oauthSessions.get(sessionId);
  if (!session) return { ok: false, status: 401, error: "GG_AUTH_MISSING" };

  // Check token expiry (refresh 60s early)
  if (session.expiresAt && Date.now() > session.expiresAt - 60000 && session.refreshToken) {
    const refreshResponse = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
        refresh_token: session.refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (refreshResponse.ok) {
      const tokens = await refreshResponse.json();
      session.accessToken = tokens.access_token;
      session.expiresAt = Date.now() + tokens.expires_in * 1000;
      if (tokens.refresh_token) session.refreshToken = tokens.refresh_token;
      oauthSessions.set(sessionId, session);
    } else {
      oauthSessions.delete(sessionId);
      return { ok: false, status: 401, error: "GG_TOKEN_REFRESH_FAILED" };
    }
  }

  const response = await fetch(`https://api.gg.example.com${path}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/json",
      "User-Agent": "dw-super-chatgpt-app"
    }
  });

  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }

  if (!response.ok) {
    const message = typeof data === "object" && data && "message" in data ? String((data as Record<string, unknown>).message) : response.statusText;
    return { ok: false, status: response.status, data, error: message };
  }

  return { ok: true, status: response.status, data };
}

const dwSuperStateSchema = z
  .object({
    project: z.string(),
    task_id: z.string(),
    run_id: z.string(),
    source_instruction: z.string(),
    execution_mode: z.string(),
    repository: z.string(),
    target_system: z.string(),
    current_gate: z.string(),
    status: z.string(),
    risk: z.string(),
    health: z.number(),
    scope_hash: z.string(),
    approval: z
      .object({
        gate: z.string(),
        token: z.string(),
        label: z.string(),
        expires_at_utc: z.string()
      })
      .passthrough(),
    repositories: z.array(
      z
        .object({
          name: z.string(),
          branch: z.string(),
          sha: z.string(),
          status: z.string()
        })
        .passthrough()
    ),
    risks: z.array(
      z
        .object({
          level: z.string(),
          title: z.string(),
          detail: z.string()
        })
        .passthrough()
    ),
    timeline: z.array(
      z
        .object({
          time: z.string(),
          status: z.string(),
          event: z.string()
        })
        .passthrough()
    )
  })
  .passthrough();

const ggActionResultSchema = dwSuperStateSchema.extend({
  gg_renderer: z.string(),
  gg_summary: z.string(),
  gg_message: z.string()
});

type DwSuperActionInput = {
  action: "continue_gate" | "approve_gate" | "show_evidence" | "explain_risk" | "prepare_slack_update" | "reject_gate";
  task_id: string;
  run_id?: string;
  gate: string;
  risk?: string;
  scope_hash?: string;
  approval_token?: string;
};

function buildNextStateFromAction(input: DwSuperActionInput, ggMessage: string) {
  const now = new Date().toISOString();
  const timelineEvent =
    input.action === "approve_gate"
      ? "GG rendered approval action and returned control to ChatGPT"
      : `GG rendered ${input.action} and returned control to ChatGPT`;

  return {
    ...sampleState,
    task_id: input.task_id,
    run_id: input.run_id ?? sampleState.run_id,
    current_gate: input.gate,
    risk: input.risk ?? sampleState.risk,
    scope_hash: input.scope_hash ?? sampleState.scope_hash,
    status:
      input.action === "approve_gate"
        ? "APPROVAL_RECORDED"
        : input.action === "show_evidence"
          ? "EVIDENCE_REQUESTED"
          : input.action === "explain_risk"
            ? "RISK_EXPLAINED"
            : input.action === "prepare_slack_update"
              ? "SLACK_UPDATE_PREPARED"
              : input.action === "reject_gate"
                ? "GATE_REJECTED"
                : "ACTION_RECORDED",
    approval:
      input.action === "approve_gate"
        ? {
            ...sampleState.approval,
            token: input.approval_token ?? sampleState.approval.token
          }
        : sampleState.approval,
    timeline: [
      ...sampleState.timeline,
      {
        time: now,
        status: "done",
        event: timelineEvent
      }
    ],
    gg_message: ggMessage
  };
}

async function callGGRenderer(input: DwSuperActionInput) {
  const remoteUrl = process.env.GG_API_URL?.trim();
  if (remoteUrl) {
    try {
      const response = await fetch(remoteUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(input)
      });

      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        if (typeof data.gg_message === "string" && typeof data.gg_summary === "string") {
          const nextState = data.next_state && typeof data.next_state === "object" ? data.next_state : buildNextStateFromAction(input, data.gg_message);
          return {
            gg_renderer: typeof data.gg_renderer === "string" ? data.gg_renderer : remoteUrl,
            gg_summary: data.gg_summary,
            gg_message: data.gg_message,
            next_state: nextState
          };
        }
      }
    } catch (error) {
      console.warn("GG remote renderer unavailable, using local GG renderer", error);
    }
  }

  const ggMessage =
    input.action === "approve_gate"
      ? `GG rendered approval for ${input.task_id} at ${input.gate}. Action returned to ChatGPT with token ${input.approval_token}.`
      : input.action === "show_evidence"
        ? `GG rendered evidence request for ${input.task_id} at ${input.gate} and returned the action to ChatGPT.`
        : input.action === "explain_risk"
          ? `GG rendered risk explanation for ${input.task_id} at ${input.gate} and returned the action to ChatGPT.`
          : input.action === "prepare_slack_update"
            ? `GG rendered Slack update draft request for ${input.task_id} at ${input.gate} and returned the action to ChatGPT.`
            : input.action === "reject_gate"
              ? `GG rendered gate rejection for ${input.task_id} at ${input.gate} and returned the action to ChatGPT.`
              : `GG rendered continue request for ${input.task_id} at ${input.gate} and returned the action to ChatGPT.`;

  return {
    gg_renderer: "local-gg-renderer",
    gg_summary: `GG rendered ${input.action} for ${input.task_id} / ${input.gate}`,
    gg_message: ggMessage,
    next_state: buildNextStateFromAction(input, ggMessage)
  };
}

const widgetHtml = `
<div class="dw-root" data-app="dw-super-cockpit">
  <style>
    :root {
      color-scheme: light dark;
    }
    .dw-root {
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --primary: #2563eb;
      --primary-soft: #dbeafe;
      --green: #16a34a;
      --green-soft: #dcfce7;
      --yellow: #ca8a04;
      --yellow-soft: #fef9c3;
      --red: #dc2626;
      --red-soft: #fee2e2;
      --purple: #7c3aed;
      --purple-soft: #ede9fe;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: transparent;
      width: 100%;
      max-width: 920px;
      margin: 0 auto;
    }
    @media (prefers-color-scheme: dark) {
      .dw-root {
        --bg: #020617;
        --card: #0f172a;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --border: #1e293b;
        --primary-soft: rgba(37, 99, 235, .18);
        --green-soft: rgba(22, 163, 74, .18);
        --yellow-soft: rgba(202, 138, 4, .2);
        --red-soft: rgba(220, 38, 38, .18);
        --purple-soft: rgba(124, 58, 237, .18);
      }
    }
    .dw-shell {
      display: grid;
      gap: 14px;
      padding: 2px;
    }
    .dw-hero {
      border: 1px solid var(--border);
      background: linear-gradient(135deg, var(--primary-soft), var(--card));
      border-radius: 20px;
      padding: 18px;
    }
    .dw-title-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .dw-title {
      font-size: 20px;
      line-height: 1.2;
      font-weight: 750;
      margin: 0;
    }
    .dw-sub {
      color: var(--muted);
      margin: 6px 0 0;
      font-size: 14px;
    }
    .dw-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 7px 10px;
      font-size: 13px;
      font-weight: 650;
      border: 1px solid var(--border);
      background: var(--card);
      white-space: nowrap;
    }
    .dw-badge.warn { background: var(--yellow-soft); color: var(--yellow); border-color: transparent; }
    .dw-badge.good { background: var(--green-soft); color: var(--green); border-color: transparent; }
    .dw-badge.bad { background: var(--red-soft); color: var(--red); border-color: transparent; }
    .dw-metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .dw-metric {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 12px;
      min-width: 0;
    }
    .dw-label {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.2;
      margin-bottom: 6px;
    }
    .dw-value {
      font-size: 15px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .dw-progress {
      height: 10px;
      border-radius: 999px;
      background: var(--border);
      overflow: hidden;
      margin-top: 8px;
    }
    .dw-progress > span {
      display: block;
      height: 100%;
      width: 82%;
      background: var(--primary);
      border-radius: 999px;
    }
    .dw-grid {
      display: grid;
      grid-template-columns: 1.05fr .95fr;
      gap: 14px;
    }
    .dw-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 14px;
    }
    .dw-card h3 {
      margin: 0 0 10px;
      font-size: 15px;
    }
    .dw-gates {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 7px;
    }
    .dw-gate {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 10px 8px;
      text-align: center;
      font-size: 12px;
      min-height: 68px;
      display: grid;
      place-content: center;
      gap: 4px;
    }
    .dw-gate.done { background: var(--green-soft); color: var(--green); border-color: transparent; }
    .dw-gate.current { background: var(--yellow-soft); color: var(--yellow); border-color: transparent; }
    .dw-gate.locked { opacity: .62; }
    .dw-action-grid {
      display: grid;
      gap: 8px;
    }
    .dw-btn {
      width: 100%;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
      border-radius: 14px;
      padding: 12px 14px;
      font-size: 14px;
      font-weight: 650;
      text-align: left;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .dw-btn:hover {
      border-color: var(--primary);
      background: var(--primary-soft);
    }
    .dw-btn.primary {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }
    .dw-btn.approve {
      background: var(--green-soft);
      color: var(--green);
      border-color: transparent;
    }
    .dw-token {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      overflow-wrap: anywhere;
      opacity: .9;
    }
    .dw-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .dw-item {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 10px;
    }
    .dw-item-title {
      font-weight: 700;
      font-size: 13px;
    }
    .dw-item-detail {
      color: var(--muted);
      font-size: 12px;
      margin-top: 3px;
    }
    .dw-repos {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .dw-repo {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 10px;
      min-width: 0;
    }
    .dw-repo-name {
      font-weight: 700;
      font-size: 13px;
    }
    .dw-sha {
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      overflow-wrap: anywhere;
      margin-top: 5px;
    }
    .dw-footer {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .dw-log {
      display: none;
      border: 1px dashed var(--border);
      border-radius: 14px;
      padding: 10px;
      color: var(--muted);
      font-size: 12px;
      white-space: pre-wrap;
    }
    .dw-log.show { display: block; }
    @media (max-width: 720px) {
      .dw-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .dw-grid { grid-template-columns: 1fr; }
      .dw-gates { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .dw-repos { grid-template-columns: 1fr; }
      .dw-title { font-size: 18px; }
    }
    @media (max-width: 380px) {
      .dw-metrics { grid-template-columns: 1fr; }
      .dw-gates { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>

  <main class="dw-shell" aria-label="DW SUPER Governance Cockpit">
    <section class="dw-hero">
      <div class="dw-title-row">
        <div>
          <h2 class="dw-title">DW SUPER Governance Cockpit</h2>
          <p class="dw-sub">Interactive control surface for ChatGPT conversation actions.</p>
        </div>
        <span class="dw-badge warn" id="statusBadge">🟡 Waiting approval</span>
      </div>

      <div class="dw-metrics" id="metricGrid">
        <div class="dw-metric">
          <div class="dw-label">Task</div>
          <div class="dw-value" id="taskId">RH-UA-GWC-01</div>
        </div>
        <div class="dw-metric">
          <div class="dw-label">Gate</div>
          <div class="dw-value" id="gate">G1_ALIGNMENT</div>
        </div>
        <div class="dw-metric">
          <div class="dw-label">Risk</div>
          <div class="dw-value" id="risk">R2</div>
        </div>
        <div class="dw-metric">
          <div class="dw-label">Health</div>
          <div class="dw-value" id="health">82%</div>
          <div class="dw-progress" aria-label="Health score"><span id="healthBar"></span></div>
        </div>
      </div>
    </section>

    <section class="dw-grid">
      <div class="dw-card">
        <h3>🚦 Gate journey</h3>
        <div class="dw-gates" id="gates">
          <div class="dw-gate done">�?strong>G0</strong><span>Context</span></div>
          <div class="dw-gate current">🟡<strong>G1</strong><span>Alignment</span></div>
          <div class="dw-gate locked">🔒<strong>G2</strong><span>Execution</span></div>
          <div class="dw-gate locked">🔒<strong>G3</strong><span>PR</span></div>
          <div class="dw-gate locked">🔒<strong>G4</strong><span>Approval</span></div>
          <div class="dw-gate locked">🔒<strong>G5</strong><span>Verify</span></div>
        </div>
      </div>

      <div class="dw-card">
        <h3>👤 Human actions</h3>
        <div class="dw-action-grid">
          <button class="dw-btn primary" type="button" data-action="continue_gate">
            <span>�?Continue current gate</span><span>G1</span>
          </button>
          <button class="dw-btn approve" type="button" data-action="approve_gate">
            <span>Approve G1<br><span class="dw-token" id="approvalToken">APPROVE_G1_RHUA04_20260724</span></span>
            <span>�?/span>
          </button>
          <button class="dw-btn" type="button" data-action="show_evidence">
            <span>🔝 Show evidence</span><span>view</span>
          </button>
          <button class="dw-btn" type="button" data-action="explain_risk">
            <span>�?Explain risk</span><span>R2</span>
          </button>
          <button class="dw-btn" type="button" data-action="prepare_slack_update">
            <span>💬 Prepare Slack thread update</span><span>draft</span>
          </button>
        </div>
      </div>
    </section>

    <section class="dw-grid">
      <div class="dw-card">
        <h3>📦 Repository truth</h3>
        <div class="dw-repos" id="repos"></div>
      </div>

      <div class="dw-card">
        <h3>�?Risks</h3>
        <ul class="dw-list" id="risks"></ul>
      </div>
    </section>

    <section class="dw-card">
      <h3>🧭 Timeline</h3>
      <ul class="dw-list" id="timeline"></ul>
    </section>

    <section class="dw-card">
      <h3>Runtime notes</h3>
      <p class="dw-footer">
        Buttons send model-visible action messages to ChatGPT through the Apps bridge.
        They do not mutate GitHub, GWC, Slack, or audit records unless the assistant later uses authorized tools and records evidence.
      </p>
      <pre class="dw-log" id="localLog"></pre>
    </section>
  </main>

  <script>
    const DEFAULT_STATE = {"project": "DW SUPER", "task_id": "RH-UA-GWC-01", "run_id": "g1-20260724-0017-rental-home-ua-refresh", "source_instruction": "REPO", "execution_mode": "chat_connector_only", "repository": "nhatnguyenquang1838-coder/DW-SuperApps", "target_system": "nhatnguyenquang1838-coder/rental_home", "current_gate": "G1_ALIGNMENT", "status": "WAITING_APPROVAL", "risk": "R2", "health": 82, "scope_hash": "8c6dc26b45491407", "approval": {"gate": "G1_ALIGNMENT", "token": "APPROVE_G1_RHUA04_20260724", "label": "Approve G1 APPROVE_G1_RHUA04_20260724", "expires_at_utc": "2026-07-24T17:17:30Z"}, "repositories": [{"name": "DW-SuperApps", "branch": "main", "sha": "6332c8f62614d581c45403cb5e3e0c4f528cbd70", "status": "verified"}, {"name": "rental_home", "branch": "main", "sha": "88fb343c0f354661f9c2e309afe920de70b6a9a9", "status": "warning"}, {"name": "gwc", "branch": "main", "sha": "b3edbb102fb5b0e7e1532e221d89c16896f17755", "status": "verified"}, {"name": "Understand-Anything", "branch": "main", "sha": "6ae71878beb50226a1e4b7e2f52ac6468c86f74b", "status": "warning"}], "risks": [{"level": "high", "title": "Stale governance package", "detail": "Generated governance packages need regeneration before execution."}, {"level": "high", "title": "Old .gwc/gwc assumption", "detail": "Some instructions still point to nested GWC path."}, {"level": "medium", "title": "UA metadata drift", "detail": "Existing UA graph metadata is stale against current target main."}], "timeline": [{"time": "2026-07-23T17:00:00Z", "status": "done", "event": "Repository state loaded"}, {"time": "2026-07-23T17:08:00Z", "status": "done", "event": "G0 inspection completed"}, {"time": "2026-07-23T17:17:30Z", "status": "pending", "event": "G1 approval requested"}]};

    let state = DEFAULT_STATE;

    function shortSha(sha) {
      return String(sha || "").slice(0, 12);
    }

    function statusIcon(status) {
      if (status === "verified" || status === "done") return "🟢";
      if (status === "warning" || status === "pending") return "🟡";
      if (status === "blocked" || status === "failed") return "🔴";
      return "🔵";
    }

    function render(nextState) {
      state = nextState || state;
      document.getElementById("taskId").textContent = state.task_id;
      document.getElementById("gate").textContent = state.current_gate;
      document.getElementById("risk").textContent = state.risk;
      document.getElementById("health").textContent = \`\${state.health}%\`;
      document.getElementById("healthBar").style.width = \`\${state.health}%\`;
      document.getElementById("approvalToken").textContent = state.approval.token;

      const repos = document.getElementById("repos");
      repos.innerHTML = state.repositories.map(repo => \`
        <article class="dw-repo">
          <div class="dw-repo-name">\${statusIcon(repo.status)} \${repo.name}</div>
          <div class="dw-item-detail">\${repo.branch}</div>
          <div class="dw-sha">\${shortSha(repo.sha)}</div>
        </article>
      \`).join("");

      const risks = document.getElementById("risks");
      risks.innerHTML = state.risks.map(risk => \`
        <li class="dw-item">
          <div class="dw-item-title">\${risk.level === "high" ? "🔴" : "🟡"} \${risk.title}</div>
          <div class="dw-item-detail">\${risk.detail}</div>
        </li>
      \`).join("");

      const timeline = document.getElementById("timeline");
      timeline.innerHTML = state.timeline.map(item => \`
        <li class="dw-item">
          <div class="dw-item-title">\${statusIcon(item.status)} \${item.event}</div>
          <div class="dw-item-detail">\${item.time}</div>
        </li>
      \`).join("");
    }

    function buildActionMessage(action) {
      const lines = [
        \`DW_SUPER_ACTION \${action}\`,
        \`task_id: \${state.task_id}\`,
        \`run_id: \${state.run_id}\`,
        \`gate: \${state.current_gate}\`,
        \`risk: \${state.risk}\`,
        \`scope_hash: \${state.scope_hash}\`
      ];

      if (action === "approve_gate") {
        lines.push("approval_token: " + state.approval.token);
        lines.push("approval_label: " + state.approval.label);
        lines.push("expires_at_utc: " + state.approval.expires_at_utc);
        lines.push("human_intent: approve");
        lines.push("approval_envelope: " + JSON.stringify({ task_id: state.task_id, approved: true, token: state.approval.token, timestamp: new Date().toISOString() }));
      }

      if (action === "prepare_slack_update") {
        lines.push("instruction: load Slack Connector, read Slack Canvas policy, then draft a threaded Slack update.");
      }

      return lines.join("\\n");
    }

    function getOpenAiBridge() {
      return typeof window !== "undefined" ? window.openai : undefined;
    }

    async function postToChatGPT(text) {
      const openai = getOpenAiBridge();
      if (openai?.sendFollowUpMessage) {
        await openai.sendFollowUpMessage({ prompt: text, scrollToBottom: true });
        return true;
      }

      const payload = {
        jsonrpc: "2.0",
        method: "ui/message",
        params: {
          role: "user",
          content: [{ type: "text", text }]
        }
      };

      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
        return true;
      }
      return false;
    }

    async function updateModelContext(text) {
      const payload = {
        jsonrpc: "2.0",
        id: \`dw-\${Date.now()}\`,
        method: "ui/update-model-context",
        params: {
          content: [{ type: "text", text }]
        }
      };

      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
        return true;
      }
      return false;
    }

    function localFallback(text) {
      const log = document.getElementById("localLog");
      log.classList.add("show");
      log.textContent = \`Local preview only. In ChatGPT this would become a conversation action:\\\\n\\\\n\${text}\`;
    }

    document.querySelectorAll("[data-action]").forEach(button => {
      button.addEventListener("click", async () => {
        const action = button.getAttribute("data-action");
        const message = buildActionMessage(action);
        await updateModelContext(\`User selected DW SUPER action: \${action}\`);
        const posted = await postToChatGPT(message);
        if (!posted) localFallback(message);
      });
    });

    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;
      if (message.method === "ui/notifications/tool-result") {
        const next = message.params?.structuredContent;
        if (next?.task_id) render(next);
      }
    }, { passive: true });

    render(state);
  </script>
</div>
`;

server.registerResource(
  "dw_super_cockpit_widget",
  TEMPLATE_URI,
  {},
  async () => ({
    contents: [
      {
        uri: TEMPLATE_URI,
        mimeType: "text/html;profile=mcp-app",
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
    inputSchema: z.object({
      task_id: z.string(),
      title: z.string().optional(),
      content: z.string().optional(),
      timeline: z.array(z.any()).optional()
    }),
    outputSchema: z.object({
      project: z.string(),
      task_id: z.string(),
      run_id: z.string(),
      source_instruction: z.string(),
      execution_mode: z.string(),
      repository: z.string(),
      target_system: z.string(),
      current_gate: z.string(),
      status: z.string(),
      risk: z.string(),
      health: z.number(),
      scope_hash: z.string(),
      approval: z.any(),
      repositories: z.array(z.any()),
      risks: z.array(z.any()),
      timeline: z.array(z.any())
    }).passthrough(),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false
    },
    _meta: {
      ui: { resourceUri: TEMPLATE_URI },
      "openai/outputTemplate": TEMPLATE_URI,
      "openai/toolInvocation/invoking": "Loading DW SUPER...",
      "openai/toolInvocation/invoked": "DW SUPER loaded"
    }
  },
  async (input) => {
    // Dynamic state merge
    const nextState = {
      ...sampleState,
      task_id: input.task_id,
      timeline: input.timeline ?? sampleState.timeline
    };
    return {
      structuredContent: nextState,
      content: [
        {
          type: "text",
          text: `DW SUPER governance state updated for task ${input.task_id}. Cockpit rendered.`
        }
      ]
    };
  }
);

server.registerTool(
  "record_dw_super_action",
  {
    title: "Record DW SUPER action intent",
    description:
      "Records a user action intent from the DW SUPER cockpit, routes it through GG rendering, and returns the GG-rendered state to ChatGPT.",
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
      run_id: z.string().optional(),
      gate: z.string(),
      risk: z.string().optional(),
      scope_hash: z.string().optional(),
      approval_token: z.string().optional()
    }),
    outputSchema: ggActionResultSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false
    }
  },
  async (input: DwSuperActionInput) => {
    const gg = await callGGRenderer(input);
    const nextState = gg.next_state;

    return {
      structuredContent: {
        ...nextState,
        gg_renderer: gg.gg_renderer,
        gg_summary: gg.gg_summary,
        gg_message: gg.gg_message
      },
      content: [
        {
          type: "text",
          text: gg.gg_message
        }
      ]
    };
  }
);

server.registerTool(
  "mcp__dw_super__configure_github",
  {
    title: "Configure GitHub token",
    description: "Stores a GitHub token for the current session.",
    inputSchema: z.object({ token: z.string().min(1) }),
    outputSchema: z.object({ configured: z.boolean(), session_id: z.string() }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
  },
  async ({ token }) => {
    const sessionId = getSessionId();
    // Assuming GG token configuration for session
    oauthSessions.set(sessionId, {
        accessToken: token,
        expiresAt: Date.now() + 3600 * 1000,
        providerUserId: "manual",
        workspaceId: "default"
    });
    return {
      structuredContent: { configured: true, session_id: sessionId },
      content: [{ type: "text", text: "GG token configured for this session." }]
    };
  }
);

server.registerTool(
  "mcp__dw_super__github_list_prs",
  {
    title: "List PRs",
    description: "Lists pull requests for a repository.",
    inputSchema: z.object({ owner: z.string(), repo: z.string(), state: z.enum(["open", "closed", "all"]).optional(), per_page: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).optional() }),
    outputSchema: z.object({ items: z.array(z.object({ number: z.number(), title: z.string(), state: z.string(), user: z.string().optional(), url: z.string().optional() })), error: z.string().optional() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  async (input) => {
    const sessionId = getSessionId();
    const params = new URLSearchParams();
    params.set("state", input.state ?? "open");
    if (input.per_page) params.set("per_page", String(input.per_page));
    if (input.page) params.set("page", String(input.page));
    const res = await callGG(sessionId, `/repos/${input.owner}/${input.repo}/pulls?${params.toString()}`);
    if (!res.ok || !Array.isArray(res.data)) {
      return { structuredContent: { items: [], error: res.error ?? `HTTP_${res.status}` }, content: [{ type: "text", text: `GitHub PR list failed: ${res.error ?? res.status}` }] };
    }
    const items = res.data.map((pr: any) => ({ number: pr.number, title: pr.title, state: pr.state, user: pr.user?.login, url: pr.html_url }));
    return { structuredContent: { items }, content: [{ type: "text", text: `Loaded ${items.length} PRs.` }] };
  }
);

server.registerTool(
  "mcp__dw_super__github_get_pr",
  {
    title: "Get PR",
    description: "Gets a single pull request.",
    inputSchema: z.object({ owner: z.string(), repo: z.string(), pull_number: z.number().int().positive() }),
    outputSchema: z.object({ number: z.number(), title: z.string(), state: z.string(), merged: z.boolean().optional(), user: z.string().optional(), body: z.string().optional(), url: z.string().optional(), additions: z.number().optional(), deletions: z.number().optional(), changed_files: z.number().optional(), error: z.string().optional() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  async (input) => {
    const res = await callGG(getSessionId(), `/repos/${input.owner}/${input.repo}/pulls/${input.pull_number}`);
    if (!res.ok || typeof res.data !== "object" || !res.data) {
      return { structuredContent: { number: input.pull_number, title: "", state: "", error: res.error ?? `HTTP_${res.status}` }, content: [{ type: "text", text: `GitHub PR fetch failed: ${res.error ?? res.status}` }] };
    }
    const pr = res.data as Record<string, any>;
    return { structuredContent: { number: pr.number, title: pr.title, state: pr.state, merged: pr.merged, user: pr.user?.login, body: pr.body, url: pr.html_url, additions: pr.additions, deletions: pr.deletions, changed_files: pr.changed_files }, content: [{ type: "text", text: `Loaded PR #${pr.number}.` }] };
  }
);

server.registerTool(
  "mcp__dw_super__github_list_workflow_runs",
  {
    title: "List workflow runs",
    description: "Lists GitHub Actions workflow runs.",
    inputSchema: z.object({ owner: z.string(), repo: z.string(), workflow_id: z.union([z.string(), z.number()]).optional(), branch: z.string().optional(), per_page: z.number().int().min(1).max(100).optional(), page: z.number().int().min(1).optional() }),
    outputSchema: z.object({ items: z.array(z.object({ id: z.number(), workflow_id: z.number().optional(), workflow_name: z.string().optional(), status: z.string().optional(), conclusion: z.string().optional(), head_branch: z.string().optional(), head_sha: z.string().optional(), url: z.string().optional() })), error: z.string().optional() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  async (input) => {
    const params = new URLSearchParams();
    if (input.workflow_id !== undefined) params.set("workflow_id", String(input.workflow_id));
    if (input.branch) params.set("branch", input.branch);
    if (input.per_page) params.set("per_page", String(input.per_page));
    if (input.page) params.set("page", String(input.page));
    const res = await callGG(getSessionId(), `/repos/${input.owner}/${input.repo}/actions/runs?${params.toString()}`);
    if (!res.ok || typeof res.data !== "object" || !res.data || !("workflow_runs" in res.data)) {
      return { structuredContent: { items: [], error: res.error ?? `HTTP_${res.status}` }, content: [{ type: "text", text: `GitHub workflow list failed: ${res.error ?? res.status}` }] };
    }
    const payload = res.data as Record<string, any>;
    const items = (payload.workflow_runs ?? []).map((run: any) => ({ id: run.id, workflow_id: run.workflow_id, workflow_name: run.name, status: run.status, conclusion: run.conclusion, head_branch: run.head_branch, head_sha: run.head_sha, url: run.html_url }));
    return { structuredContent: { items }, content: [{ type: "text", text: `Loaded ${items.length} workflow runs.` }] };
  }
);

server.registerTool(
  "mcp__dw_super__github_get_workflow_run",
  {
    title: "Get workflow run",
    description: "Gets a GitHub Actions workflow run and its jobs.",
    inputSchema: z.object({ owner: z.string(), repo: z.string(), run_id: z.number().int().positive() }),
    outputSchema: z.object({ id: z.number(), workflow_id: z.number().optional(), workflow_name: z.string().optional(), status: z.string().optional(), conclusion: z.string().optional(), head_branch: z.string().optional(), head_sha: z.string().optional(), event: z.string().optional(), url: z.string().optional(), jobs: z.array(z.object({ id: z.number(), name: z.string().optional(), status: z.string().optional(), conclusion: z.string().optional(), started_at: z.string().optional(), completed_at: z.string().optional() })).optional(), error: z.string().optional() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  },
  async (input) => {
    const sessionId = getSessionId();
    const runRes = await callGG(sessionId, `/repos/${input.owner}/${input.repo}/actions/runs/${input.run_id}`);
    if (!runRes.ok || typeof runRes.data !== "object" || !runRes.data) {
      return { structuredContent: { id: input.run_id, error: runRes.error ?? `HTTP_${runRes.status}` }, content: [{ type: "text", text: `GG workflow fetch failed: ${runRes.error ?? runRes.status}` }] };
    }
    const run = runRes.data as Record<string, any>;
    const jobsRes = await callGG(sessionId, `/repos/${input.owner}/${input.repo}/actions/runs/${input.run_id}/jobs`);
    const jobs = jobsRes.ok && typeof jobsRes.data === "object" && jobsRes.data && Array.isArray((jobsRes.data as Record<string, any>).jobs)
      ? (jobsRes.data as Record<string, any>).jobs.map((job: any) => ({ id: job.id, name: job.name, status: job.status, conclusion: job.conclusion, started_at: job.started_at, completed_at: job.completed_at }))
      : [];
    return { structuredContent: { id: run.id, workflow_id: run.workflow_id, workflow_name: run.name, status: run.status, conclusion: run.conclusion, head_branch: run.head_branch, head_sha: run.head_sha, event: run.event, url: run.html_url, jobs }, content: [{ type: "text", text: `Loaded workflow run #${run.id}.` }] };
  }
);

export default server;
