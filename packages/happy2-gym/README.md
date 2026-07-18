# happy2-gym

`gym` contains Happy (2)'s black-box test harnesses. Its server harness gives every
instance an in-memory SQLite database, an in-memory file volume, generated
signing keys, and a Fastify server. It does not bind a port or write files, and
closing it drops all of its state.

```ts
import { createGymServer } from "happy2-gym";

it("reads the current user", async () => {
    await using server = await createGymServer();
    const ada = await server.createUser({ firstName: "Ada", username: "ada" });

    expect((await server.get("/v0/me")).statusCode).toBe(401);
    expect((await server.as(ada).get("/v0/me")).json().user.id).toBe(ada.id);
});
```

Use `databaseMode: "file"` for concurrency tests that must exercise libSQL's
real multi-connection SQLite transaction behavior. Gym creates the database in
a temporary directory and removes it during teardown; the file volume remains
in memory.

Use `server` directly for anonymous requests and `server.as(user)` for requests
with that user's bearer token. `close()`, `await using`, and `withGymServer()`
all provide deterministic teardown. The first user created in an instance is an
admin, matching the production profile bootstrap behavior.

## Mock Rig daemon

`gym/rig` provides a programmable Rig protocol server on a real Unix socket.
Its sessions and opt-in durable global event queue survive `restart()`. Tests can
pause automatic replies or global event delivery, complete or fail individual
runs, discard a submit response after accepting the turn, emit high-volume queue
updates, and inspect configuration, resumable global SSE connections, forbidden
batch polling, cursor rejection, and trimming.

```ts
import { createMockRigDaemon } from "happy2-gym/rig";

await using rig = await createMockRigDaemon();
rig.setAutomaticReply(undefined);

// Configure server agents.socketPath/tokenPath from the fixture, submit work,
// then exercise recovery without replacing the durable Rig session.
rig.pauseGlobalEventDelivery();
await rig.restart();
rig.completeRun(rig.submittedRuns[0]!.runId, "Recovered reply");
rig.resumeGlobalEventDelivery();
```

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

## Browser rendering harness

`gym/playwright` owns the reusable real-browser measurement harness. A consumer supplies only a
framework-specific mount callback; the harness supplies independently sized surfaces, rendered
border-box coordinates, computed CSS, DOM text-baseline metrics, Retina screenshots, and visible
pixel analysis.

Visible pixels are reconstructed by capturing the integer-aligned render surface against both black
and white, then scanning the selected element's region on that shared backing-pixel grid. Capturing
the selected element itself is incorrect when its box begins fractionally because Playwright rounds
the clip. For each backing pixel, `Cwhite - Cblack = 255 * (1 - alpha)`, so the harness recovers
coverage without assuming a foreground color. `visibleMetrics()` reports the exact raster bounds,
nonzero backing-pixel count, total alpha mass, and alpha-weighted optical center relative to the
selected element.

`textMetrics().baseline.fromElementTop` and `.fromSurfaceTop` report the live DOM first-line
baseline; `ink.baseline` and `verticalOffset` remain compatibility aliases. The baseline comes from
a temporary zero-size inline probe and is not inferred from canvas. `textMetrics().fontMetrics`
separately exposes the browser's raw Canvas `TextMetrics` values. Those values describe font and
outline metrics and must not be treated as rasterized visible bounds.

`renderer.visibleMetrics([first, second])` measures independent elements on one render surface from
one black/white screenshot pair, preserving each element's real DOM rectangle and 2× pixel math.
Use it for fixture sheets rather than issuing repeated `element.visibleMetrics()` calls. Elements in
one batch cannot contain one another because changing ancestor backgrounds would otherwise alter a
second measurement's paint. `renderer.screenshot()` only writes inspection PNGs when
`VITE_HAPPY2_WRITE_SCREENSHOTS=1`; use `pnpm --filter happy2-gym test:playwright:artifacts` for a
deliberate artifact refresh.
