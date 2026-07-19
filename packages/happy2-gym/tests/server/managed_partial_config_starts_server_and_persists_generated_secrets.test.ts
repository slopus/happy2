import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("managed partial server configuration", () => {
    it("merges defaults, serves requests, and persists generated secrets", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy2-managed-config-gym-"));
        const runtimeDirectory = join(directory, ".happy2");
        await mkdir(runtimeDirectory, { recursive: true });
        await writeFile(
            join(runtimeDirectory, "happy2.toml"),
            `[server]
role = "auth"
host = "127.0.0.1"
port = 0
`,
        );

        const environment = { ...process.env };
        for (const name of [
            "HAPPY2_CONFIG",
            "HAPPY2_INTEGRATION_SECRET",
            "HAPPY2_JWT_PRIVATE_KEY",
            "HAPPY2_JWT_PRIVATE_KEY_B64",
            "HAPPY2_JWT_PUBLIC_KEY",
            "HAPPY2_JWT_PUBLIC_KEY_B64",
            "HAPPY2_PASSWORD_PEPPER",
        ]) {
            delete environment[name];
        }
        const runnerPath = join(import.meta.dirname, "../../../happy2-server/sources/runner.ts");
        const tsxPath = createRequire(import.meta.url).resolve("tsx");
        const child = spawn(process.execPath, [`--import=${tsxPath}`, runnerPath, "backend"], {
            cwd: directory,
            env: environment,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout!.on("data", (chunk) => (output += String(chunk)));
        child.stderr!.on("data", (chunk) => (output += String(chunk)));

        try {
            const methods = await waitForServer(child, () => output);
            expect(methods).toEqual({
                role: "auth",
                method: "password",
                devTokensEnabled: false,
                signupEnabled: true,
                registration: "bootstrap",
            });
            await expect(stat(join(runtimeDirectory, "happy2.db"))).resolves.toBeDefined();
            const envPath = join(runtimeDirectory, ".env");
            const managedEnvironment = await readFile(envPath, "utf8");
            expect(managedEnvironment).toMatch(/^HAPPY2_JWT_PRIVATE_KEY_B64=.+$/m);
            expect(managedEnvironment).toMatch(/^HAPPY2_JWT_PUBLIC_KEY_B64=.+$/m);
            expect(managedEnvironment).toMatch(/^HAPPY2_PASSWORD_PEPPER=.+$/m);
            expect(managedEnvironment).toMatch(/^HAPPY2_INTEGRATION_SECRET=.+$/m);
            expect((await stat(envPath)).mode & 0o777).toBe(0o600);
        } finally {
            await stopChild(child);
            await rm(directory, { force: true, recursive: true });
        }
    });
});

async function waitForServer(child: ChildProcess, output: () => string): Promise<unknown> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Happy (2) exited before serving requests:\n${output()}`);
        }
        const match = /Happy \(2\) backend is running at (http:\/\/[^\s]+)/.exec(output());
        if (match) {
            try {
                const response = await fetch(`${match[1]}/v0/auth/methods`);
                if (response.ok) return response.json();
            } catch {
                // Startup is still in progress.
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for Happy (2):\n${output()}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const forceTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
    }, 5_000);
    try {
        await exited;
    } finally {
        clearTimeout(forceTimer);
    }
}
