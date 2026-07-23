# DW SUPER Slack Communication Policy

Purpose:

Slack is used for execution visibility only.

Slack is not:

- governance authority
- source of truth
- audit replacement
- automatic approval mechanism

## Message Model

Each governed task/run creates one root message in the target channel.

All later updates for that same task/run must be replies in the original thread.

Thread recovery order:

1. Use stored `slack.channel_id` and `slack.root_message_ts`.
2. Search by task ID / run ID.
3. Create one replacement root message only if recovery fails.

## Root Message

Use a compact status card:

```text
🟡 DW SUPER TASK STARTED

Project:
Task:
Run:
Gate:
Status:
Risk:

Evidence:
- Branch:
- Commit:
- PR:
- CI:

Next:
```

## Thread Replies

Use short updates:

```text
🟢 GATE UPDATE

Gate:
Status:
Evidence:
Next:
```

## Status Visuals

- 🟢 Completed / passed
- 🟡 Running / pending / approval required
- 🔴 Blocked / failed
- 🟣 Human override / bypass
- 🔵 Information

## Rich Reporting

For complex reports:

1. Send a short Slack thread summary.
2. Attach or link a mobile-friendly HTML report.
3. Use Mermaid only inside HTML/image artifacts, not as raw Slack text.
4. Use Slack Canvas for stable communication rules.

## Failure Handling

If Slack fails:

- continue governed execution
- record notification failure
- never block the workflow because of Slack
