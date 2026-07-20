import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { serverLoggingCreate } from "./logging.js";

describe("server logging", () => {
    const directories: string[] = [];

    afterEach(async () => {
        await Promise.all(
            directories
                .splice(0)
                .map((directory) => rm(directory, { force: true, recursive: true })),
        );
    });

    it("duplicates error events without copying ordinary request logs", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy2-error-log-"));
        directories.push(directory);
        const errorLogPath = join(directory, "nested", "server-error.log");
        const logging = serverLoggingCreate(true, errorLogPath);
        const app = Fastify({ logger: logging.logger });
        app.addHook("onClose", () => logging.close());

        app.log.info("server:ready port=3000");
        app.log.error(
            { err: new Error("catalog failure") },
            "http:error requestId=req-1 method=GET path=/v0/admin/plugins message=catalog failure",
        );
        await app.close();

        const records = (await readFile(errorLogPath, "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            level: 50,
            msg: "http:error requestId=req-1 method=GET path=/v0/admin/plugins message=catalog failure",
            err: { message: "catalog failure" },
        });
    });
});
