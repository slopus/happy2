---
name: happy2-environment-management
description: Inspect, create, select, and safely deactivate Happy agent environments. Use when a user asks to change the default Docker image or environment, inspect an environment Dockerfile, build or reactivate an agent environment, or deactivate an unused custom environment.
---

# Happy2 environment management

Treat an environment as an immutable Dockerfile-backed agent image. Use the
environment tools for the server-wide catalog; do not edit container state or
claim that changing the default rewrites an existing agent.

## Workflow

1. Call `happy2_environments_list` before referring to an existing environment.
2. Call `happy2_environment_get_dockerfile` when the current Dockerfile matters
   or when a new environment should be derived from an existing definition.
3. Create with a complete, reproducible Dockerfile and a concise distinct name.
   Creation queues an asynchronous image build. Creating the exact definition
   of an inactive environment reactivates the retained manifest and queues a
   fresh build under the same environment ID.
4. Poll `happy2_environments_list` until the new environment is `ready` before
   calling `happy2_environment_set_default`. Report a `failed` status rather
   than repeatedly creating equivalent definitions.
5. Explain that the default applies to agents created later. Existing agents
   retain their assigned environment.
6. Deactivate only the exact custom environment the user requested. Happy
   rejects deactivation while an environment is the default, assigned to an
   agent or live runtime, selected by a plugin, queued/building, or built in.
   Deactivation never deletes its manifest or Dockerfile; inactive definitions
   remain readable and can be reactivated and rebuilt.

## Safety

- Create, set, or deactivate only when the user explicitly requests that mutation.
- Never guess an environment ID; resolve it from the list response.
- Inspect the Dockerfile before copying or modifying an unfamiliar environment.
- Do not put credentials, tokens, private keys, or user data in a Dockerfile.
- Prefer pinned, reproducible dependencies when the user supplies or approves
  exact versions. Do not silently invent version requirements.
- If a name matches multiple environments, ask which ID the user means before a
  mutation.
