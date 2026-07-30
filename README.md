# DW SUPER ChatGPT App — Complete MVP

> Triggered by Vercel after Git reconnection at 2026-07-24 08:24 UTC+7.

This package is a complete prototype for a **DW SUPER Governance Cockpit inside ChatGPT**.

It is designed for the exact interaction model requested:

- The UI appears inside ChatGPT.
- Buttons send action messages back into the same ChatGPT conversation.
- `Approve` buttons show the approval token directly on the button.
- Clicking an approval button is treated as human approval intent.
- No direct GWC backend mutation is performed in this MVP.
- Slack is a visibility layer only; repository/audit remains the source of truth.

## Important boundary

A normal standalone HTML file cannot talk back to ChatGPT.

A ChatGPT App widget can request a follow-up user message through the ChatGPT Apps bridge using `ui/message`, or use the ChatGPT compatibility helper `window.openai.sendFollowUpMessage(...)`.

The official Apps SDK still requires an MCP Apps server shell to expose tools and UI templates to ChatGPT, but this package does **not** require a DW SUPER/GWC MCP backend. The included server is only the ChatGPT App host.

The widget resource is returned as MCP Apps HTML using `text/html;profile=mcp-app`.

Button clicks now round-trip through a GG rendering layer before the action result is returned to ChatGPT. If you have a separate GG service, point `GG_API_URL` at it; otherwise the app uses the built-in GG renderer.

## What is included

```text
dw-super-chatgpt-app-complete/
├── src/
│   ├── server.ts
│   └── sample-state.ts
├── widget/
│   └── dw-super-cockpit.html
├── public/
│   ├── preview.html
│   └── sample-execution-report.html
├── schemas/
│   ├── dw-super-action.schema.json
│   ├── approval.schema.json
│   └── task-state.schema.json
├── docs/
│   ├── PROJECT_INSTRUCTION.md
│   ├── SLACK_COMMUNICATION_POLICY_CANVAS.md
│   ├── CHATGPT_APP_BEHAVIOR.md
│   └── INSTALL.md
├── fixtures/
│   └── sample-task-state.json
├── MANIFEST.json
└── SHA256SUMS.txt
```

## Run locally

```bash
npm install
npm run dev
```

For visual-only preview without ChatGPT:

```bash
npm run preview
```

Open:

```text
http://localhost:8787/preview.html
```

## Expected ChatGPT behavior

When a user clicks:

```text
Approve G1 APPROVE_G1_RHUA04_20260724
```

The widget asks ChatGPT to post a message like:

```text
DW_SUPER_ACTION approve_gate
task_id: RH-UA-GWC-01
gate: G1_ALIGNMENT
approval_token: APPROVE_G1_RHUA04_20260724
scope_hash: 8c6dc26b45491407
```

Then the assistant continues from that message.

## GitHub MCP

This app also exposes read-only GitHub MCP tools for PR and workflow status checks. The assistant must first configure a GitHub token for the active session, then call the GitHub tools and render the results back into the cockpit widget.

## Governance rule

The app only captures and presents intent. It must not claim repository changes, audit writes, Slack posts, PR updates, or gate transitions unless evidence exists.
