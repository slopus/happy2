import { describe, expect, it, vi } from "vitest";
import type { AgentImageSummary } from "../../resources.js";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { UserError } from "../../types.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { agentImagesLoad, agentImagesOutputRoute } from "./agentImagesState.js";
import { agentImagesStoreCreate } from "./agentImagesState.js";

describe("agent images module", () => {
    it("loads, selects details, and settles only the matching pending operation", async () => {
        const server = createFakeServer();
        const summary = image("image-1");
        server.respond(
            "GET",
            "/v0/admin/agentImages",
            jsonResponse(200, { images: [summary], defaultImageId: "image-1" }),
        );
        server.respond(
            "GET",
            "/v0/admin/agentImages/image-1",
            jsonResponse(200, {
                image: {
                    ...summary,
                    dockerfile: "FROM scratch",
                    buildLog: "",
                    buildLogTruncated: false,
                },
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        let binding: ReturnType<typeof agentImagesStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = agentImagesStoreCreate((event) =>
            routed.push(agentImagesOutputRoute({ runtime, images: binding }, event)),
        );
        await agentImagesLoad({ runtime, images: binding });
        binding.getState().imageSelect("image-1");
        await Promise.all(routed);
        expect(binding.getState()).toMatchObject({
            images: { type: "ready", value: [{ id: "image-1" }] },
            details: { "image-1": { type: "ready", value: { dockerfile: "FROM scratch" } } },
        });
        runtime.stop();
    });

    it("emits every local intent synchronously", () => {
        const output = vi.fn();
        const binding = agentImagesStoreCreate(output);
        binding.getState().imageBuild("image-1");
        binding.getState().imageBuild("image-1");
        binding.getState().defaultImageSet("image-1");
        binding.getState().defaultImageSet("image-2");
        binding.getState().imageCreate("Custom", "FROM scratch");
        binding.getState().imageCreate("Duplicate", "FROM scratch");
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "imageBuildSubmitted",
            "defaultImageSubmitted",
            "imageCreateSubmitted",
        ]);
    });

    it("clears exactly the failed build so it can be retried", () => {
        const output = vi.fn();
        const binding = agentImagesStoreCreate(output);
        binding.getState().imageBuild("image-1");
        binding.getState().imageBuild("image-2");
        binding.getState().agentImagesInput({
            type: "imageActionFailed",
            action: "build",
            imageId: "image-1",
            error: new UserError("failed"),
        });
        binding.getState().imageBuild("image-1");
        expect(output.mock.calls.map(([event]) => event)).toEqual([
            { type: "imageBuildSubmitted", imageId: "image-1" },
            { type: "imageBuildSubmitted", imageId: "image-2" },
            { type: "imageBuildSubmitted", imageId: "image-1" },
        ]);
        expect(binding.getState().pending.buildImageIds).toEqual(["image-2", "image-1"]);
    });

    it("reconciles the complete catalog when a mutation wins an initial-load race", async () => {
        const server = createFakeServer();
        const first = image("image-1");
        const second = image("image-2");
        let releaseInitialLoad!: () => void;
        let catalogRequests = 0;
        server.route("GET", "/v0/admin/agentImages", async () => {
            const requestNumber = ++catalogRequests;
            if (requestNumber === 1)
                await new Promise<void>((resolve) => (releaseInitialLoad = resolve));
            return jsonResponse(200, {
                images: requestNumber === 1 ? [first] : [first, second],
                defaultImageId: first.id,
            });
        });
        server.respond(
            "POST",
            "/v0/admin/agentImages/image-2/buildImage",
            jsonResponse(200, { image: second }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const binding = agentImagesStoreCreate();
        const initialLoad = agentImagesLoad({ runtime, images: binding });
        await vi.waitFor(() => expect(releaseInitialLoad).toBeTypeOf("function"));
        await agentImagesOutputRoute(
            { runtime, images: binding },
            { type: "imageBuildSubmitted", imageId: second.id },
        );
        releaseInitialLoad();
        await initialLoad;
        expect(binding.getState().images).toMatchObject({
            type: "ready",
            value: [{ id: first.id }, { id: second.id }],
        });
        runtime.stop();
    });

    it("ignores a stale selected-image failure after newer details load", async () => {
        const server = createFakeServer();
        let releaseFirst!: () => void;
        server.route("GET", "/v0/admin/agentImages/image-1", async () => {
            await new Promise<void>((resolve) => (releaseFirst = resolve));
            return jsonResponse(500, { message: "stale failure" });
        });
        server.respond(
            "GET",
            "/v0/admin/agentImages/image-2",
            jsonResponse(200, {
                image: {
                    ...image("image-2"),
                    dockerfile: "FROM current",
                    buildLog: "",
                    buildLogTruncated: false,
                },
            }),
        );
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
        });
        const binding = agentImagesStoreCreate();
        binding.getState().imageSelect("image-1");
        const stale = agentImagesOutputRoute(
            { runtime, images: binding },
            { type: "imageSelected", imageId: "image-1" },
        );
        await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
        binding.getState().imageSelect("image-2");
        await agentImagesOutputRoute(
            { runtime, images: binding },
            { type: "imageSelected", imageId: "image-2" },
        );
        releaseFirst();
        await stale;
        expect(binding.getState().details["image-2"]).toMatchObject({
            type: "ready",
            value: { dockerfile: "FROM current" },
        });
        expect(binding.getState().details["image-1"]?.type).toBe("loading");
        runtime.stop();
    });
});

function image(id: string): AgentImageSummary {
    return {
        id,
        name: id,
        definitionHash: "hash",
        dockerTag: "tag",
        status: "ready",
        buildAttempt: 1,
        buildProgress: 100,
        createdAt: "now",
        updatedAt: "now",
    };
}
