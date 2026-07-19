import { describe, expect, it } from "vitest";
import type { PreparedPluginSummary } from "../../resources.js";
import { createFakeServer, jsonResponse, type FakeStreamController } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import {
    pluginInstallOutputRoute,
    pluginInstallStoreCreate,
    type PluginInstallStore,
} from "./pluginInstallState.js";

const image = {
    contentType: "image/png",
    size: 10,
    width: 1,
    height: 1,
    thumbhash: "hash",
    checksumSha256: "checksum",
} as const;

function candidate(overrides: Partial<PreparedPluginSummary> = {}): PreparedPluginSummary {
    return {
        preparedToken: "token-1",
        expiresAt: "2026-01-01T00:15:00.000Z",
        sourceKind: "zip_url",
        sourceReference: "https://example.com/plugin.zip",
        packageDigest: "digest-1",
        version: "1.0.0",
        displayName: "Linked Tools",
        shortName: "linked-tools",
        description: "Tools linked from a ZIP URL.",
        skills: [{ name: "lint", description: "Lints the project." }],
        variables: [],
        image,
        ...overrides,
    };
}

const installation = {
    id: "installation-1",
    pluginId: "plugin-1",
    shortName: "linked-tools",
    sourceVersion: "1.0.0",
    packageDigest: "digest-1",
    status: "preparing",
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

function flowCreate(runtime: StateRuntime): {
    binding: PluginInstallStore;
    routed: Promise<void>[];
} {
    let binding!: PluginInstallStore;
    const routed: Promise<void>[] = [];
    binding = pluginInstallStoreCreate((event) =>
        routed.push(pluginInstallOutputRoute({ runtime, install: binding }, event)),
    );
    return { binding, routed };
}

function zipFile(name = "plugin.zip"): File {
    return new File([new Uint8Array([80, 75, 3, 4])], name, { type: "application/zip" });
}

describe("plugin install flow module", () => {
    it("prepares an uploaded ZIP with live progress and reaches the configure step", async () => {
        const server = createFakeServer();
        let stream!: FakeStreamController;
        server.streamRoute("POST", "/v0/admin/pluginPackages/preparePlugin", (_request, s) => {
            stream = s;
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().archiveSelect(zipFile());
        expect(binding.getState().archive).toMatchObject({ name: "plugin.zip", size: 4 });
        binding.getState().prepareSubmit();
        expect(binding.getState().step).toEqual({ step: "preparing" });
        const request = server.requests[0]!;
        expect(request.path).toBe("/v0/admin/pluginPackages/preparePlugin");
        expect(request.body).toBeInstanceOf(FormData);
        const uploaded = (request.body as FormData).get("plugin");
        expect(uploaded).toBeInstanceOf(File);
        expect((uploaded as File).name).toBe("plugin.zip");
        stream.event("progress", {
            stage: "verifying",
            detail: "Verifying package structure",
            receivedBytes: 4,
            totalBytes: 4,
        });
        expect(binding.getState().step).toMatchObject({
            step: "preparing",
            progress: { stage: "verifying", receivedBytes: 4 },
        });
        stream.event("prepared", {
            selectionRequired: false,
            candidates: [candidate({ sourceKind: "upload" })],
        });
        expect(binding.getState().step).toMatchObject({
            step: "configure",
            candidate: { shortName: "linked-tools", sourceKind: "upload" },
        });
        // A trailing close and stray frames after the terminal event change nothing.
        stream.event("failed", { error: "invalid_package", message: "late frame" });
        stream.end();
        expect(binding.getState().step).toMatchObject({ step: "configure" });
        await Promise.all(routed);
        runtime.stop();
    });

    it("validates URLs locally before opening any preparation request", () => {
        const server = createFakeServer();
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("zip_url");
        binding.getState().prepareSubmit();
        expect(binding.getState().urlError).toBe("Enter an https:// URL.");
        binding.getState().sourceUrlUpdate("not a url");
        binding.getState().prepareSubmit();
        expect(binding.getState().urlError).toBe("This is not a valid URL.");
        binding.getState().sourceUrlUpdate("http://example.com/plugin.zip");
        binding.getState().prepareSubmit();
        expect(binding.getState().urlError).toBe("Plugin sources must use https://.");
        binding.getState().sourceUrlUpdate("https://user:pw@example.com/plugin.zip");
        binding.getState().prepareSubmit();
        expect(binding.getState().urlError).toBe("Plugin source URLs must not embed credentials.");
        expect(binding.getState().step).toEqual({ step: "source" });
        expect(server.requests).toHaveLength(0);
        // The next edit clears the shown validation error.
        binding.getState().sourceUrlUpdate("https://example.com/plugin.zip");
        expect(binding.getState().urlError).toBeUndefined();
        runtime.stop();
    });

    it("prepares a ZIP URL source as JSON and requires choosing among GitHub candidates", async () => {
        const server = createFakeServer();
        server.respondStream("POST", "/v0/admin/pluginPackages/preparePlugin", [
            {
                event: "selection_required",
                data: {
                    selectionRequired: true,
                    candidates: [
                        candidate({
                            preparedToken: "token-alpha",
                            shortName: "alpha-tools",
                            sourceKind: "github",
                        }),
                        candidate({
                            preparedToken: "token-beta",
                            shortName: "beta-tools",
                            sourceKind: "github",
                        }),
                    ],
                },
            },
        ]);
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("github");
        binding.getState().sourceUrlUpdate("https://github.com/example/tools");
        binding.getState().prepareSubmit();
        await Promise.all(routed);
        expect(server.requests[0]?.body).toEqual({
            source: { kind: "github", url: "https://github.com/example/tools" },
        });
        expect(binding.getState().step).toMatchObject({
            step: "choose",
            candidates: [{ shortName: "alpha-tools" }, { shortName: "beta-tools" }],
        });
        binding.getState().candidateChoose("token-beta");
        expect(binding.getState().step).toMatchObject({
            step: "configure",
            candidate: { shortName: "beta-tools" },
        });
        binding.getState().candidateListReturn();
        expect(binding.getState().step).toMatchObject({ step: "choose" });
        runtime.stop();
    });

    it("surfaces a preparation failure and retries the same retained source", async () => {
        const server = createFakeServer();
        server.respondStream(
            "POST",
            "/v0/admin/pluginPackages/preparePlugin",
            [
                {
                    event: "failed",
                    data: {
                        error: "invalid_package",
                        message: "A plugin ZIP must contain exactly one plugin.json",
                    },
                },
            ],
            [
                {
                    event: "prepared",
                    data: { selectionRequired: false, candidates: [candidate()] },
                },
            ],
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("zip_url");
        binding.getState().sourceUrlUpdate("https://example.com/plugin.zip");
        binding.getState().prepareSubmit();
        await Promise.all(routed);
        expect(binding.getState().step).toMatchObject({
            step: "failed",
            error: { message: "A plugin ZIP must contain exactly one plugin.json" },
        });
        binding.getState().prepareRetry();
        await Promise.all(routed);
        expect(server.requests).toHaveLength(2);
        expect(binding.getState().step).toMatchObject({ step: "configure" });
        runtime.stop();
    });

    it("settles as a displayable failure when the server rejects the stream request", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/admin/pluginPackages/preparePlugin",
            jsonResponse(403, {
                error: "forbidden",
                message: "Server admin permission is required",
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("zip_url");
        binding.getState().sourceUrlUpdate("https://example.com/plugin.zip");
        binding.getState().prepareSubmit();
        await Promise.all(routed);
        expect(binding.getState().step).toMatchObject({
            step: "failed",
            error: { message: "Server admin permission is required", code: "forbidden" },
        });
        runtime.stop();
    });

    it("cancelling preparation aborts the open stream and returns to the source step", async () => {
        const server = createFakeServer();
        let stream!: FakeStreamController;
        server.streamRoute("POST", "/v0/admin/pluginPackages/preparePlugin", (_request, s) => {
            stream = s;
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("github");
        binding.getState().sourceUrlUpdate("https://github.com/example/tools");
        binding.getState().prepareSubmit();
        binding.getState().prepareCancel();
        expect(binding.getState().step).toEqual({ step: "source" });
        expect(stream.aborted).toBe(true);
        stream.event("prepared", { selectionRequired: false, candidates: [candidate()] });
        expect(binding.getState().step).toEqual({ step: "source" });
        await Promise.all(routed);
        runtime.stop();
    });

    it("closing the dialog mid-preparation cancels the stream through flowReset", async () => {
        const server = createFakeServer();
        let stream!: FakeStreamController;
        server.streamRoute("POST", "/v0/admin/pluginPackages/preparePlugin", (_request, s) => {
            stream = s;
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("zip_url");
        binding.getState().sourceUrlUpdate("https://example.com/plugin.zip");
        binding.getState().prepareSubmit();
        binding.getState().flowReset();
        expect(stream.aborted).toBe(true);
        expect(binding.getState()).toMatchObject({ step: { step: "source" }, urlDraft: "" });
        await Promise.all(routed);
        runtime.stop();
    });

    it("a stream that ends without a terminal event fails visibly instead of hanging", async () => {
        const server = createFakeServer();
        server.streamRoute("POST", "/v0/admin/pluginPackages/preparePlugin", (_request, s) => {
            s.event("progress", { stage: "downloading", detail: "Downloading" });
            s.end();
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("zip_url");
        binding.getState().sourceUrlUpdate("https://example.com/plugin.zip");
        binding.getState().prepareSubmit();
        await Promise.all(routed);
        expect(binding.getState().step).toMatchObject({
            step: "failed",
            error: { message: "Preparation ended before a result arrived." },
        });
        runtime.stop();
    });

    it("installs the selected prepared plugin with variables and a container image", async () => {
        const server = createFakeServer();
        server.respondStream("POST", "/v0/admin/pluginPackages/preparePlugin", [
            {
                event: "prepared",
                data: {
                    selectionRequired: false,
                    candidates: [
                        candidate({
                            variables: [
                                {
                                    key: "API_TOKEN",
                                    displayName: "API token",
                                    description: "Token used by the MCP server.",
                                    kind: "secret",
                                },
                            ],
                            mcp: { type: "stdio", container: "selection_required" },
                        }),
                    ],
                },
            },
        ]);
        server.respond(
            "POST",
            "/v0/admin/pluginPackages/installPlugin",
            jsonResponse(202, { installation }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("zip_url");
        binding.getState().sourceUrlUpdate("https://example.com/plugin.zip");
        binding.getState().prepareSubmit();
        await Promise.all(routed);
        expect(binding.getState().step).toMatchObject({ step: "configure" });
        // Both the declared variable and the container image gate submission.
        binding.getState().installSubmit({});
        expect(binding.getState().step).toMatchObject({ step: "configure" });
        binding.getState().installSubmit({ API_TOKEN: "secret value" });
        expect(binding.getState().step).toMatchObject({ step: "configure" });
        binding.getState().installSubmit({ API_TOKEN: "secret value" }, "image-1");
        expect(binding.getState().step).toMatchObject({ step: "installing" });
        await Promise.all(routed);
        expect(binding.getState().step).toMatchObject({
            step: "installed",
            installation: { id: "installation-1" },
        });
        const install = server.requests.find(
            (request) => request.path === "/v0/admin/pluginPackages/installPlugin",
        );
        expect(install?.body).toEqual({
            preparedToken: "token-1",
            variables: { API_TOKEN: "secret value" },
            containerImageId: "image-1",
        });
        expect(install?.headers?.["idempotency-key"]).toBeTruthy();
        expect(JSON.stringify(binding.getState())).not.toContain("secret value");
        runtime.stop();
    });

    it("an expired or consumed prepared token returns the flow to preparation with guidance", async () => {
        const server = createFakeServer();
        server.respondStream("POST", "/v0/admin/pluginPackages/preparePlugin", [
            {
                event: "prepared",
                data: { selectionRequired: false, candidates: [candidate()] },
            },
        ]);
        server.respond(
            "POST",
            "/v0/admin/pluginPackages/installPlugin",
            jsonResponse(404, {
                error: "not_found",
                message: "Prepared plugin token was not found or expired",
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("zip_url");
        binding.getState().sourceUrlUpdate("https://example.com/plugin.zip");
        binding.getState().prepareSubmit();
        await Promise.all(routed);
        binding.getState().installSubmit({});
        await Promise.all(routed);
        expect(binding.getState().step).toEqual({ step: "source" });
        expect(binding.getState().notice).toContain("expired");
        // The retained URL draft makes re-preparation one submit away.
        expect(binding.getState().urlDraft).toBe("https://example.com/plugin.zip");
        binding.getState().prepareSubmit();
        expect(binding.getState().notice).toBeUndefined();
        await Promise.all(routed);
        expect(binding.getState().step).toMatchObject({ step: "configure" });
        runtime.stop();
    });

    it("a conflicting install retains every prepared candidate for another choice or retry", async () => {
        const server = createFakeServer();
        server.respondStream("POST", "/v0/admin/pluginPackages/preparePlugin", [
            {
                event: "prepared",
                data: {
                    selectionRequired: true,
                    candidates: [
                        candidate({ preparedToken: "token-1", displayName: "Alpha Tools" }),
                        candidate({ preparedToken: "token-2", displayName: "Beta Tools" }),
                    ],
                },
            },
        ]);
        server.respond(
            "POST",
            "/v0/admin/pluginPackages/installPlugin",
            jsonResponse(409, {
                error: "conflict",
                message: "This remote plugin has changed since its installed snapshot",
            }),
            jsonResponse(202, { installation }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("zip_url");
        binding.getState().sourceUrlUpdate("https://example.com/plugin.zip");
        binding.getState().prepareSubmit();
        await Promise.all(routed);
        binding.getState().candidateChoose("token-2");
        binding.getState().installSubmit({});
        await Promise.all(routed);
        expect(binding.getState().step).toMatchObject({
            step: "configure",
            candidate: { preparedToken: "token-2" },
            candidates: [{ preparedToken: "token-1" }, { preparedToken: "token-2" }],
        });
        expect(binding.getState().installError?.message).toContain("has changed");
        binding.getState().candidateListReturn();
        expect(binding.getState().step).toMatchObject({
            step: "choose",
            candidates: [{ preparedToken: "token-1" }, { preparedToken: "token-2" }],
        });
        binding.getState().candidateChoose("token-2");
        binding.getState().installSubmit({});
        expect(binding.getState().installError).toBeUndefined();
        await Promise.all(routed);
        expect(binding.getState().step).toMatchObject({ step: "installed" });
        runtime.stop();
    });

    it("a replaced preparation ignores every frame from the superseded stream", async () => {
        const server = createFakeServer();
        const streams: FakeStreamController[] = [];
        server.streamRoute("POST", "/v0/admin/pluginPackages/preparePlugin", (_request, s) => {
            streams.push(s);
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const { binding, routed } = flowCreate(runtime);
        binding.getState().sourceKindUpdate("zip_url");
        binding.getState().sourceUrlUpdate("https://example.com/first.zip");
        binding.getState().prepareSubmit();
        binding.getState().prepareCancel();
        binding.getState().sourceUrlUpdate("https://example.com/second.zip");
        binding.getState().prepareSubmit();
        expect(streams).toHaveLength(2);
        expect(streams[0]!.aborted).toBe(true);
        streams[1]!.event("prepared", {
            selectionRequired: false,
            candidates: [candidate({ sourceReference: "https://example.com/second.zip" })],
        });
        expect(binding.getState().step).toMatchObject({
            step: "configure",
            candidate: { sourceReference: "https://example.com/second.zip" },
        });
        await Promise.all(routed);
        runtime.stop();
    });
});
