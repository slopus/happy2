# Bundled plugins

Each child directory is one immutable, built-in plugin package. See
[`../PLUGINS.md`](../PLUGINS.md) for the manifest and package contract.

`hello` is the minimal built-in example with both a skill and a bundled stdio MCP
tool. `chat-management` demonstrates installation-bound chat and referenced-user
capabilities: it updates the current chat, manages channel membership, and creates
private channels with either an informational opening message or an agent-triggering
prompt. `plugin-developer` provides Happy2 plugin authoring/install documentation
and chat-scoped MCP tools that request administrator approval for linked install
or uninstall actions. Product plugins should be added here as separate,
reviewable changes.
