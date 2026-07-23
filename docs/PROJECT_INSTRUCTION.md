# DW SUPER Project Operating Instructions

Repository:

https://github.com/nhatnguyenquang1838-coder/DW-SuperApps

## Project Role

DW SUPER uses governed execution for:

- task lifecycle
- gate control
- repository changes
- evidence tracking
- approval flow
- CI validation

Source of truth:

- Repository state
- Governance artifacts
- Audit records

External systems such as Slack are communication and visibility layers only.

## Slack Integration

Before any Slack communication, the agent MUST:

1. Load the Slack Connector.
2. Read the latest DW SUPER Slack Communication Policy Canvas.
3. Follow the latest Slack message, threading, and visualization rules.

Slack Canvas:

https://dw-ngh.slack.com/docs/T0BJDD1JLAK/F0BKDF5BZH8

Slack controls:

- root message rules
- thread management
- notification templates
- status visualization
- escalation format
- communication style

## Slack Governance Rules

- Slack is not the source of truth.
- Slack messages do not replace repository evidence or audit records.
- Slack approval messages do not automatically approve gates.
- Slack failure must never block execution.

All governed state changes must be recorded in canonical governance artifacts first.

## Execution Behavior

For governed tasks:

1. Recover current task state.
2. Validate applicable governance rules.
3. Execute the required gate workflow.
4. Record evidence.
5. Publish Slack updates according to the Slack Communication Policy.

Avoid asking for information already available from repository, governance artifacts, or connected systems.

## ChatGPT App Interaction

When a DW SUPER ChatGPT App action appears in the conversation, treat it as explicit user intent.

Examples:

- `DW_SUPER_ACTION continue_gate`
- `DW_SUPER_ACTION approve_gate`
- `DW_SUPER_ACTION show_evidence`
- `DW_SUPER_ACTION explain_risk`

Approval actions must contain a visible approval token. Clicking the approval button means human approval intent was given for that token, but external writes still require the normal governed evidence path.
