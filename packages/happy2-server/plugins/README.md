# Bundled plugins

Each child directory is one immutable, built-in plugin package. See
[`../PLUGINS.md`](../PLUGINS.md) for the manifest and package contract.

`hello` is the minimal built-in example with both a skill and a bundled stdio MCP
tool. `chat-management` demonstrates installation-bound chat and referenced-user
capabilities: it updates the current chat, manages channel membership, and creates
public channels by default (or private channels explicitly) with either an
informational opening message or an agent-triggering prompt.
`environment-management` lets agents inspect, build, select, and safely
deactivate Dockerfile-backed agent environments while retaining their manifests.
`plugin-developer` provides Happy2 plugin authoring/install documentation
and chat-scoped MCP tools that request administrator approval for linked install
or uninstall actions. Product plugins should be added here as separate,
reviewable changes.
