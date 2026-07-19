---
name: happy2-plugin-development
description: Build, package, validate, install, inspect, and troubleshoot Happy2 server plugins. Use when a user asks to create a Happy2 plugin, add Agent Skills or an MCP server to one, package a plugin ZIP, install from a ZIP or HTTPS link, understand plugin permissions and containers, or diagnose plugin installation/runtime health.
---

# Happy2 plugin development

Build against Happy2's server-plugin contract. Do not substitute Codex, Claude, browser-extension, or Conductor plugin formats; they are unrelated.

## Start with the product boundary

1. Identify the useful capability and decide whether it belongs in an Agent Skill, an MCP tool server, a persistent container command, or a combination.
2. Keep the package focused. One plugin may contain several closely related skills or tools, but do not make it a miscellaneous bundle.
3. Treat installation as system-wide administrator state. A chat agent may request installation, but Happy2 installs only after a human administrator approves the chat card.
4. Never claim that MCP elicitation itself grants Happy2 authority. Happy2 owns the durable approval, audit, package snapshot, and runtime lifecycle.

Read [references/package-format.md](references/package-format.md) before authoring `plugin.json` or arranging files. Read [references/installing.md](references/installing.md) before packaging, installing, updating, or uninstalling. Read [references/host-api.md](references/host-api.md) before requesting host capabilities from a local plugin container.

## Choose components

- Use a skill for reusable instructions, project conventions, workflows, references, scripts, and assets that an agent should load into context.
- Use MCP for typed operations the agent should call. Keep tool schemas closed, concrete, bounded, and explicit about side effects.
- Use a persistent container command for an indexer, watcher, worker, or daemon that must stay alive for the installation lifetime.
- Combine a command and stdio MCP only when they genuinely share one immutable package and isolated installation container.
- Use remote MCP only for an already-hosted public HTTPS MCP endpoint with static header-template authentication. Happy2 does not add OAuth on behalf of a plugin.

## Build workflow

1. Create a kebab-case package directory and make `plugin.json.shortName` match it.
2. Add a square `plugin.png`; prefer 1024×1024.
3. Write schema-version-1 `plugin.json` with strict SemVer, user-facing metadata, and only supported fields.
4. Put each skill at `skills/<skill-name>/SKILL.md`; match its frontmatter `name` to the directory.
5. For local MCP or commands, add a package-relative Dockerfile and ensure the image contains `/bin/sh`.
6. Make stdio MCP write newline-delimited JSON-RPC only to stdout. Send logs to stderr.
7. Declare the smallest exact host permission allowlist. Unknown permissions make the package invalid.
8. Create a ZIP whose root is the package root, or whose only top-level directory is the package root.
9. Install directly as an administrator, or use `happy2_plugin_install_from_link` to create a chat approval for a public HTTPS ZIP.
10. Inspect installation health and correct the package/configuration rather than hiding a failed state.

## Security invariants

- Do not include symlinks, device files, traversal paths, encrypted ZIP entries, or generated dependency caches.
- Never bake secrets into the ZIP, image, manifest, URL, arguments, or skill.
- Declare required variables in the manifest. Happy2 encrypts `secret` values and injects both secret and text values only into configured processes.
- Do not ask an agent to collect a plugin secret in chat. Plugins requiring variables or an administrator-selected image must use the direct administrator install flow.
- Assume package files become immutable after the first system installation. A changed link does not silently rewrite an installed plugin.
- Treat the package icon, display name, and description as untrusted publisher material that Happy2 validates and shows in approval UI.
- A plugin runtime token is not a user session. It grants only manifest-declared host capabilities for one live container incarnation.
- A contextual chat token is short-lived and bound to the originating Rig session, external-tool call, agent, human actor, and chat. Never persist or forward it.

## Completion checklist

- `plugin.json`, `plugin.png`, and at least one skill/container/MCP component exist.
- Short name, directory name, skill names, referenced paths, variables, headers, permissions, and SemVer validate.
- The ZIP stays within Happy2's package limits and contains no unsafe entry.
- MCP initialization, ping, paginated tool listing, and representative tool calls work.
- Side-effecting tools have bounded inputs, clear descriptions, and their own idempotency where external ambiguity matters.
- Installation reaches `ready`, or a specific expected failure is explained.
- The result is tested in a fresh agent turn so Rig receives the current durable tool catalog.
