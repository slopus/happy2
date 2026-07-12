import { describe, expect, it } from "vitest";
import {
    backendOperations,
    createClientState,
    type BackendInput,
    type BackendOperation,
} from "../src/index";
import { createFakeServer, jsonResponse } from "../src/testing";

describe("complete backend facade", () => {
    it("dispatches every named non-auth backend operation without exposing paths to callers", async () => {
        const server = createFakeServer();
        server.route(
            "GET",
            () => true,
            () => jsonResponse(200, {}),
        );
        server.route(
            "POST",
            () => true,
            () => jsonResponse(200, {}),
        );
        const state = createClientState(server.transport, {
            createId: () => "facade-idempotency-key",
        });
        const execute = state.execute.bind(state) as (
            operation: BackendOperation,
            input?: BackendInput,
        ) => Promise<unknown>;

        for (const [operation, spec] of Object.entries(backendOperations) as Array<
            [BackendOperation, (typeof backendOperations)[BackendOperation]]
        >) {
            const input: Record<string, unknown> = {};
            for (const match of spec.path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g))
                input[match[1]!] = `${match[1]}-value`;
            if ("query" in spec)
                for (const query of spec.query ?? []) input[query] = `${query}-value`;
            if ("rawBodyKey" in spec && spec.rawBodyKey)
                input[spec.rawBodyKey] = new Uint8Array([1]);

            await execute(operation, input);
            const request = server.requests.at(-1);
            expect(request, operation).toBeDefined();
            expect(request?.path, operation).not.toContain(":");
            expect(request?.method, operation).toBe(spec.method);
            if (
                spec.method === "POST" &&
                !("rawBodyKey" in spec && spec.rawBodyKey) &&
                !("idempotency" in spec && spec.idempotency === false)
            )
                expect(request?.headers?.["idempotency-key"], operation).toBe(
                    "facade-idempotency-key",
                );
            else if (spec.method === "POST")
                expect(request?.headers?.["idempotency-key"], operation).toBeUndefined();
        }

        expect(server.requests).toHaveLength(Object.keys(backendOperations).length);
        expect(Object.keys(backendOperations).length).toBeGreaterThan(130);
    });
});
