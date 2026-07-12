# rigged-state

`rigged-state` owns Rigged's framework-independent, in-memory client state. It
does not authenticate, persist data, create a singleton, or render UI. A host
creates an instance with an already authenticated `ClientTransport`.

```ts
import { createClientState } from "rigged-state";

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

Multipart uploads and one-time secret issuance are intentionally single-attempt
operations because the server rejects HTTP idempotency keys for those routes.
Use the resumable upload operations for retryable file transfer. All other JSON
mutations retry with one stable idempotency key.

## Testing

`rigged-state/testing` exports a programmable fake server with request history,
route handlers, queued responses, one-shot failures, and a realtime event
facade. `gym/state` adapts the repository's complete in-memory Fastify/SQLite
server to the same transport contract for black-box tests.
