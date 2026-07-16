# happy2-state

`happy2-state` owns Happy (2)'s framework-independent, in-memory client state. It
does not authenticate, persist data, create a singleton, or render UI. A host
creates an instance with an already authenticated `ClientTransport`.

```ts
import { createClientState } from "happy2-state";

const state = createClientState(transport);
state.subscribe("messages", ({ chatId, reason }) => {
    // Ask state.get() for the new immutable snapshot and update the UI.
});
await state.start();
```

Promise actions such as `createChannel` retry transient failures with a stable
idempotency key and reject with `UserError`. Background actions such as
`sendMessage` return immediately, publish optimistic state, then publish either
confirmation or a typed `background-error` event.

The named `execute()` facade covers every backend capability outside
authentication itself: health, profile, collaboration, messages, directory,
presence, calls, files and resumable uploads, sync, automation, integrations,
moderation, exports, backups, retention, and administration. Operation names,
path/query parameters, important request bodies, and resource responses are
typed; application code never supplies a URL. The latest successful result for
each operation is available through `result()` and the immutable
`operationResults` snapshot. Durable sync automatically refreshes previously
loaded non-chat areas as well as chat differences.

```ts
const { backups } = await state.execute("getBackups", { limit: 25 });
const latest = state.result("getBackups");
```

Channel workspaces are lazy live trees. Calling `start()` does not load any
workspace. A host declares the directories it currently needs—normally the
expanded folders in the file tree—and state materializes only those layers:

```ts
const workspace = await state.syncWorkspace(chatId, expandedDirectories);

tree.resetPaths(workspace.paths);
tree.setGitStatus(workspace.gitStatus);
```

`workspacesByChat[chatId]` is the immutable aggregate to pass to the tree. It
contains the adaptive server preload plus the requested directory pages,
`requestedDirectories`, `unloadedDirectories`, Git annotations, and
page-completion metadata. Calling
`syncWorkspace` again drops layers for folders that are no longer requested;
`loadMoreWorkspaceDirectory` adds one bounded page for an exceptionally wide
folder. Once a workspace has been loaded, `workspace.changed` realtime hints
conditionally reconcile the preload and every requested directory. The hints
never mutate state directly, and unchanged trees use `ETag` revalidation with
no response body.

Multipart uploads and one-time secret issuance are intentionally single-attempt
operations because the server rejects HTTP idempotency keys for those routes.
Use the resumable upload operations for retryable file transfer. All other JSON
mutations retry with one stable idempotency key.

## Testing

`happy2-state/testing` exports a programmable fake server with request history,
route handlers, queued responses, one-shot failures, and a realtime event
facade. `gym/state` adapts the repository's complete in-memory Fastify/SQLite
server to the same transport contract for black-box tests.
