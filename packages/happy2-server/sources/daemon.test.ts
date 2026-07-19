import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
    daemonStart,
    daemonStop,
    daemonUsage,
    createDaemonHost,
    parseDaemonCommand,
    type DaemonHost,
} from "./daemon.js";

const execute = promisify(execFile);

class FakeDaemonHost implements DaemonHost {
    cwd = "/Users/ada/Happy Work";
    environment: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    executablePath = "/opt/node/bin/node";
    executableArguments: readonly string[] = ["--import=tsx"];
    scriptPath = "/app/runner.ts";
    files = new Map<string, string>();
    directories: string[] = [];
    starts: {
        arguments_: readonly string[];
        cwd: string;
        environment: NodeJS.ProcessEnv;
        executablePath: string;
        logPath: string;
        pidPath: string;
    }[] = [];
    signals: { pid: number; signal: NodeJS.Signals }[] = [];
    alive = new Set<number>();
    logs: string[] = [];
    startedPid = 4242;
    ignoreTerminate = false;
    waitCount = 0;
    createAllowed = true;

    async directoryCreate(path: string): Promise<void> {
        this.directories.push(path);
    }
    async fileCreate(path: string, contents: string): Promise<boolean> {
        if (!this.createAllowed || this.files.has(path)) return false;
        this.files.set(path, contents);
        return true;
    }
    async fileExists(path: string): Promise<boolean> {
        return this.files.has(path);
    }
    async fileRead(path: string): Promise<string> {
        const value = this.files.get(path);
        if (value === undefined) throw new Error(`Missing fake file: ${path}`);
        return value;
    }
    async fileRemove(path: string): Promise<void> {
        this.files.delete(path);
    }
    processAlive(pid: number): boolean {
        return this.alive.has(pid);
    }
    processTreeAlive(pid: number): boolean {
        return this.alive.has(pid);
    }
    async processStart(input: {
        arguments_: readonly string[];
        cwd: string;
        environment: NodeJS.ProcessEnv;
        executablePath: string;
        logPath: string;
        pidPath: string;
    }): Promise<number> {
        this.starts.push(input);
        this.alive.add(this.startedPid);
        this.files.set(input.pidPath, `${this.startedPid}\n`);
        return this.startedPid;
    }
    processTreeSignal(pid: number, signal: NodeJS.Signals): void {
        this.signals.push({ pid, signal });
        if (signal === "SIGKILL" || !this.ignoreTerminate) this.alive.delete(pid);
    }
    async wait(): Promise<void> {
        this.waitCount += 1;
    }
    log(message: string): void {
        this.logs.push(message);
    }
}

describe("background daemon lifecycle", () => {
    it("starts a detached foreground invocation and records its PID", async () => {
        const host = new FakeDaemonHost();
        host.files.set("/Users/ada/Happy Work/config/happy2.toml", "[server]\n");

        await daemonStart({ configPath: "config/happy2.toml" }, host);

        expect(host.directories).toEqual(["/Users/ada/Happy Work/.happy2"]);
        expect(host.starts).toEqual([
            {
                arguments_: [
                    "--import=tsx",
                    "/app/runner.ts",
                    "--config",
                    "/Users/ada/Happy Work/config/happy2.toml",
                ],
                cwd: "/Users/ada/Happy Work",
                environment: host.environment,
                executablePath: "/opt/node/bin/node",
                logPath: "/Users/ada/Happy Work/.happy2/happy2.log",
                pidPath: "/Users/ada/Happy Work/.happy2/happy2.pid",
            },
        ]);
        expect(host.files.get("/Users/ada/Happy Work/.happy2/happy2.pid")).toBe("4242\n");
        expect(host.logs).toEqual([
            "Happy (2) daemon started as process 4242.",
            "PID file: /Users/ada/Happy Work/.happy2/happy2.pid",
            "Logs: /Users/ada/Happy Work/.happy2/happy2.log",
        ]);
    });

    it("rejects duplicate starts while preserving the live daemon PID", async () => {
        const host = new FakeDaemonHost();
        const pidPath = "/Users/ada/Happy Work/.happy2/happy2.pid";
        host.files.set(pidPath, "111\n");
        host.alive.add(111);

        await expect(daemonStart({}, host)).rejects.toThrow(
            "already running as daemon process 111",
        );

        expect(host.starts).toEqual([]);
        expect(host.files.get(pidPath)).toBe("111\n");
    });

    it("replaces stale and malformed PID files when starting", async () => {
        for (const contents of ["333\n", "not-a-pid\n", "starting:333\n"]) {
            const host = new FakeDaemonHost();
            const pidPath = "/Users/ada/Happy Work/.happy2/happy2.pid";
            host.files.set(pidPath, contents);

            await daemonStart({}, host);

            expect(host.files.get(pidPath)).toBe("4242\n");
            expect(host.starts).toHaveLength(1);
        }
    });

    it("acquires the PID file before spawning so concurrent starts cannot overlap", async () => {
        const host = new FakeDaemonHost();
        host.createAllowed = false;

        await expect(daemonStart({}, host)).rejects.toThrow("daemon is already starting");

        expect(host.starts).toEqual([]);
    });

    it("gracefully stops the process tree and removes its PID file", async () => {
        const host = new FakeDaemonHost();
        const pidPath = "/Users/ada/Happy Work/.happy2/happy2.pid";
        host.files.set(pidPath, "5150\n");
        host.alive.add(5150);

        await daemonStop(host);

        expect(host.signals).toEqual([{ pid: 5150, signal: "SIGTERM" }]);
        expect(host.files.has(pidPath)).toBe(false);
        expect(host.logs).toEqual(["Happy (2) daemon process 5150 was stopped."]);
    });

    it("force-stops a process tree that ignores graceful termination", async () => {
        const host = new FakeDaemonHost();
        const pidPath = "/Users/ada/Happy Work/.happy2/happy2.pid";
        host.files.set(pidPath, "5150\n");
        host.alive.add(5150);
        host.ignoreTerminate = true;

        await daemonStop(host);

        expect(host.signals).toEqual([
            { pid: 5150, signal: "SIGTERM" },
            { pid: 5150, signal: "SIGKILL" },
        ]);
        expect(host.waitCount).toBe(200);
        expect(host.files.has(pidPath)).toBe(false);
    });

    it("cleans stale or invalid PID files and makes stop idempotent", async () => {
        const pidPath = "/Users/ada/Happy Work/.happy2/happy2.pid";
        const staleHost = new FakeDaemonHost();
        staleHost.files.set(pidPath, "8080\n");
        await daemonStop(staleHost);
        expect(staleHost.files.has(pidPath)).toBe(false);
        expect(staleHost.logs).toEqual([
            "Removed stale Happy (2) daemon PID file for process 8080.",
        ]);

        const invalidHost = new FakeDaemonHost();
        invalidHost.files.set(pidPath, "invalid\n");
        await daemonStop(invalidHost);
        expect(invalidHost.files.has(pidPath)).toBe(false);
        expect(invalidHost.logs).toEqual(["Happy (2) daemon is not running."]);

        const startingHost = new FakeDaemonHost();
        startingHost.files.set(pidPath, "starting:9090\n");
        startingHost.alive.add(9090);
        await expect(daemonStop(startingHost)).rejects.toThrow(
            "daemon is still starting as process 9090",
        );
        expect(startingHost.files.get(pidPath)).toBe("starting:9090\n");

        const interruptedStartHost = new FakeDaemonHost();
        interruptedStartHost.files.set(pidPath, "starting:9090\n");
        await daemonStop(interruptedStartHost);
        expect(interruptedStartHost.files.has(pidPath)).toBe(false);
        expect(interruptedStartHost.logs).toEqual(["Happy (2) daemon is not running."]);

        const absentHost = new FakeDaemonHost();
        await daemonStop(absentHost);
        expect(absentHost.logs).toEqual(["Happy (2) daemon is not running."]);
    });

    it("rejects a missing explicit config before spawning", async () => {
        const host = new FakeDaemonHost();
        await expect(daemonStart({ configPath: "missing.toml" }, host)).rejects.toThrow(
            "config does not exist: /Users/ada/Happy Work/missing.toml",
        );
        expect(host.starts).toEqual([]);
    });

    it("parses every daemon action and documents the lifecycle", () => {
        expect(parseDaemonCommand(["start"])).toEqual({
            action: "start",
            configPath: undefined,
        });
        expect(parseDaemonCommand(["start", "--config", "happy2.toml"])).toEqual({
            action: "start",
            configPath: "happy2.toml",
        });
        expect(parseDaemonCommand(["stop"])).toEqual({ action: "stop" });
        expect(parseDaemonCommand(["help"])).toEqual({ action: "help" });
        expect(parseDaemonCommand(["-h"])).toEqual({ action: "help" });
        expect(parseDaemonCommand([])).toEqual({ action: "invalid" });
        expect(parseDaemonCommand(["start", "extra"])).toEqual({ action: "invalid" });
        expect(parseDaemonCommand(["stop", "--config", "happy2.toml"])).toEqual({
            action: "invalid",
        });
        expect(daemonUsage()).toContain("happy2 daemon start");
        expect(daemonUsage()).toContain("happy2 daemon stop");
        expect(daemonUsage()).toContain("PID and logs");
    });

    it("wires daemon help and invalid arguments through the executable CLI", async () => {
        const runner = join(import.meta.dirname, "runner.ts");
        const help = await execute(process.execPath, ["--import=tsx", runner, "daemon", "--help"]);
        expect(help.stdout).toContain("happy2 daemon start");
        expect(help.stderr).toBe("");

        try {
            await execute(process.execPath, ["--import=tsx", runner, "daemon", "--unknown"]);
            throw new Error("Expected invalid daemon arguments to fail.");
        } catch (error) {
            expect(error).toMatchObject({ code: 1, stdout: "" });
            expect((error as { stderr: string }).stderr).toContain("happy2 daemon start");
            expect((error as { stderr: string }).stderr).not.toContain("Error:");
        }
    });

    it("detaches and terminates a real process group through the production host", async () => {
        if (process.platform === "win32") return;
        const directory = await mkdtemp(join(tmpdir(), "happy2-daemon-test-"));
        const host = createDaemonHost();
        host.cwd = directory;
        host.executablePath = "/bin/sh";
        host.executableArguments = ["-c", "trap 'exit 0' TERM; while :; do sleep 1; done"];
        host.scriptPath = "happy2-daemon-test";
        host.log = () => {};
        let pid: number | undefined;
        try {
            await daemonStart({}, host);
            pid = Number(await readFile(join(directory, ".happy2", "happy2.pid"), "utf8"));
            expect(host.processTreeAlive(pid)).toBe(true);

            await daemonStop(host);

            expect(host.processTreeAlive(pid)).toBe(false);
            await expect(access(join(directory, ".happy2", "happy2.pid"))).rejects.toMatchObject({
                code: "ENOENT",
            });
        } finally {
            if (pid !== undefined && host.processTreeAlive(pid)) {
                host.processTreeSignal(pid, "SIGKILL");
            }
            await rm(directory, { force: true, recursive: true });
        }
    });
});
