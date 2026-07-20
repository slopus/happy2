import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("bundled Plugin Developer MCP server", () => {
    test("initializes its tool catalog before serving tools/list", async () => {
        const child = spawn(
            process.execPath,
            [
                join(
                    process.cwd(),
                    "..",
                    "happy2-plugin-plugin-developer",
                    "dist",
                    "plugin",
                    "server.js",
                ),
            ],
            { stdio: ["pipe", "pipe", "pipe"] },
        );
        const output: Buffer[] = [];
        const errors: Buffer[] = [];
        child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
        child.stdin.write(
            `${JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: { protocolVersion: "2025-06-18" },
            })}\n`,
        );
        await new Promise<void>((resolve, reject) => {
            const responseRead = () => {
                if (!Buffer.concat(output).includes(10)) return;
                child.stdout.off("data", responseRead);
                resolve();
            };
            child.stdout.on("data", responseRead);
            child.once("error", reject);
            responseRead();
        });
        child.stdin.write(
            `${[
                JSON.stringify({
                    jsonrpc: "2.0",
                    method: "notifications/initialized",
                    params: {},
                }),
                JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
            ].join("\n")}\n`,
        );
        await new Promise<void>((resolve, reject) => {
            const responseRead = () => {
                if (Buffer.concat(output).toString().trim().split("\n").length < 2) return;
                child.stdout.off("data", responseRead);
                resolve();
            };
            child.stdout.on("data", responseRead);
            child.stdout.once("error", reject);
            responseRead();
        });
        child.stdin.end();

        const exitCode = await new Promise<number | null>((resolve, reject) => {
            child.once("error", reject);
            child.once("close", resolve);
        });
        expect(Buffer.concat(errors).toString()).toBe("");
        expect(exitCode).toBe(0);
        const responses = Buffer.concat(output)
            .toString()
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as Record<string, unknown>);
        expect(responses).toHaveLength(2);
        expect(responses[1]).toMatchObject({
            id: 2,
            result: {
                tools: [
                    { name: "happy2_plugins_list" },
                    { name: "happy2_plugin_install_from_link" },
                    { name: "happy2_plugin_uninstall" },
                ],
            },
        });
    });
});
