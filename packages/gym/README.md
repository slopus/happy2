# gym

`gym` contains Rigged's black-box test harnesses. Its server harness gives every
instance an in-memory SQLite database, an in-memory file volume, generated
signing keys, and a Fastify server. It does not bind a port or write files, and
closing it drops all of its state.

```ts
import { createGymServer } from "gym";

it("reads the current user", async () => {
    await using server = await createGymServer();
    const ada = await server.createUser({ firstName: "Ada", username: "ada" });

    expect((await server.get("/v0/me")).statusCode).toBe(401);
    expect((await server.as(ada).get("/v0/me")).json().user.id).toBe(ada.id);
});
```

Use `server` directly for anonymous requests and `server.as(user)` for requests
with that user's bearer token. `close()`, `await using`, and `withGymServer()`
all provide deterministic teardown. The first user created in an instance is an
admin, matching the production profile bootstrap behavior.

## Naming and organizing tests

Put server end-to-end tests in `tests/server`. Give every test file a name that
states the observable behavior being proven, so listing the directory produces
a useful index of supported server workflows.

Good names include:

- `anonymous_and_authenticated_requests_use_expected_identity.test.ts`
- `collaboration_api_supports_sync_files_search_and_admin_revocation.test.ts`
- `parallel_server_instances_are_isolated_and_disposable.test.ts`

Avoid generic names such as `server.test.ts`, `api.test.ts`,
`integration.test.ts`, `scenario_3.test.ts`, or issue numbers without a behavior
description. Keep one coherent end-to-end behavior in each file. Move a helper
into `sources` only when it is useful across multiple scenarios; otherwise keep
it beside the behavior it supports.
