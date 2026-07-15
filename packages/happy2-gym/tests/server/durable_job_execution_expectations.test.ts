import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

/**
 * These are intentionally normal (not `it.fails`) black-box expectations.
 * A requester-facing export API is not complete until it produces a readable
 * artifact without an administrator manually changing its database record.
 */
describe("durable job execution expectations", () => {
    it("eventually produces a requester-readable user-data export", async () => {
        await using server = await createGymServer();
        const member = await server.createUser({ username: "export_execution_member" });
        const asMember = server.as(member);
        const requested = await asMember.post("/v0/me/requestDataExport", {
            options: { includeFiles: true },
        });
        expect(requested.statusCode).toBe(202);
        const exportId = requested.json().dataExport.id as string;

        // A queued request must be resumed from durable state after a normal restart.
        await server.restart();
        // The product server maintenance loop runs once per second.
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        const finished = await asMember.get(`/v0/dataExports/${exportId}`);
        expect(finished.statusCode).toBe(200);
        expect(finished.json().dataExport).toMatchObject({
            id: exportId,
            status: "complete",
            outputFileId: expect.any(String),
        });
        expect(
            await asMember.get(`/v0/files/${finished.json().dataExport.outputFileId as string}`),
        ).toMatchObject({ statusCode: 200 });
    });
});
