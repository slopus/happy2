import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
    createSystemServiceHost,
    isNpxInvocation,
    parseSystemServiceCommand,
    renderLaunchdPlist,
    renderSystemdUnit,
    systemServiceStart,
    systemServiceStop,
    systemServiceUsage,
    type SystemServiceHost,
} from "./systemService.js";

const execute = promisify(execFile);

interface CommandInvocation {
    command: string;
    arguments_: readonly string[];
    options: { allowFailure?: boolean } | undefined;
}

class FakeHost implements SystemServiceHost {
    platform: NodeJS.Platform = "darwin";
    cwd = "/Users/ada/Happy & Work";
    home = "/Users/ada";
    username = "ada";
    uid = 501;
    euid = 501;
    environment: NodeJS.ProcessEnv = {
        PATH: "/opt/homebrew/bin:/usr/bin",
        RIG_HOME: "/Users/ada/Rig & State",
    };
    nodePath = "/opt/node 25/bin/node";
    existing = new Set<string>();
    directories: string[] = [];
    userWrites: { contents: string; mode: number; path: string }[] = [];
    userRemovals: string[] = [];
    commands: CommandInvocation[] = [];
    logs: string[] = [];

    async fileExists(path: string): Promise<boolean> {
        return this.existing.has(path);
    }
    async directoryCreate(path: string): Promise<void> {
        this.directories.push(path);
    }
    async userFileWrite(path: string, contents: string, mode: number): Promise<void> {
        this.userWrites.push({ contents, mode, path });
    }
    async userFileRemove(path: string): Promise<void> {
        this.userRemovals.push(path);
    }
    async commandRun(
        command: string,
        arguments_: readonly string[],
        options?: { allowFailure?: boolean },
    ): Promise<void> {
        this.commands.push({ command, arguments_, options });
    }
    log(message: string): void {
        this.logs.push(message);
    }
}

describe("automatic operating-system service", () => {
    it("installs and starts a macOS LaunchAgent without privileged commands", async () => {
        const host = new FakeHost();
        host.existing.add("/Users/ada/Happy & Work/config/happy2.toml");

        await systemServiceStart(
            {
                configPath: "config/happy2.toml",
                npx: false,
            },
            host,
        );

        expect(host.directories).toEqual([
            "/Users/ada/Library/LaunchAgents",
            "/Users/ada/Library/Logs/Happy2",
        ]);
        expect(host.commands).toEqual([
            {
                command: "launchctl",
                arguments_: ["bootout", "gui/501/com.slopus.happy2"],
                options: { allowFailure: true },
            },
            {
                command: "launchctl",
                arguments_: [
                    "bootstrap",
                    "gui/501",
                    "/Users/ada/Library/LaunchAgents/com.slopus.happy2.plist",
                ],
                options: undefined,
            },
        ]);
        expect(host.userWrites).toHaveLength(1);
        expect(host.userWrites[0]).toMatchObject({
            mode: 0o600,
            path: "/Users/ada/Library/LaunchAgents/com.slopus.happy2.plist",
        });
        expect(host.userWrites[0]!.contents).toContain(
            "<string>/Users/ada/Happy &amp; Work/config/happy2.toml</string>",
        );
        expect(host.userWrites[0]!.contents).toContain(
            "<string>/Users/ada/Rig &amp; State</string>",
        );
        expect(host.userWrites[0]!.contents).toContain("<string>/usr/bin/env</string>");
        expect(host.userWrites[0]!.contents).toContain("<string>happy2</string>");
        expect(host.logs).toEqual([
            "Happy (2) is running and will start automatically when you log in.",
            "Logs: /Users/ada/Library/Logs/Happy2",
        ]);
    });

    it("stops and unregisters an installed macOS LaunchAgent", async () => {
        const host = new FakeHost();
        const plist = "/Users/ada/Library/LaunchAgents/com.slopus.happy2.plist";
        host.existing.add(plist);

        await systemServiceStop(host);

        expect(host.userRemovals).toEqual([plist]);
        expect(host.commands[0]).toEqual({
            command: "launchctl",
            arguments_: ["bootout", "gui/501/com.slopus.happy2"],
            options: { allowFailure: true },
        });
        expect(host.logs).toEqual([
            "Happy (2) was stopped and removed from automatic login startup.",
        ]);
    });

    it("makes macOS stop idempotent when no plist is installed", async () => {
        const host = new FakeHost();
        await systemServiceStop(host);
        expect(host.userRemovals).toEqual([]);
        expect(host.logs).toEqual(["Happy (2) is not installed as a login service."]);
    });

    it("writes and prints an npx-safe Linux unit with exact sudo installation commands", async () => {
        const host = new FakeHost();
        host.platform = "linux";
        host.cwd = "/home/ada/happy % workspace";
        host.home = "/home/ada";
        host.nodePath = "/home/ada/.nvm/node";
        host.environment = { PATH: "/home/ada/.nvm:/usr/bin" };

        await systemServiceStart({ npx: true }, host);

        expect(host.userWrites).toHaveLength(1);
        expect(host.userWrites[0]).toMatchObject({
            mode: 0o644,
            path: "/home/ada/happy % workspace/happy2.service",
        });
        expect(host.userWrites[0]!.contents).toContain("User=ada");
        expect(host.userWrites[0]!.contents).toContain(
            'WorkingDirectory="/home/ada/happy %% workspace"',
        );
        expect(host.userWrites[0]!.contents).toContain(
            'ExecStart="/usr/bin/env" "npx" "--yes" "happy2"',
        );
        expect(host.commands).toEqual([]);
        expect(host.logs).toContain(host.userWrites[0]!.contents.trimEnd());
        expect(host.logs).toContain(
            "  sudo install -m 0644 '/home/ada/happy % workspace/happy2.service' /etc/systemd/system/happy2.service",
        );
        expect(host.logs).toContain("  sudo systemctl enable --now happy2.service");
        expect(host.logs).toContain("Logs: sudo journalctl -u happy2.service");
    });

    it("writes a Linux global-install unit that resolves happy2 from the saved PATH", async () => {
        const host = new FakeHost();
        host.platform = "linux";
        host.cwd = "/home/ada/happy";
        host.home = "/home/ada";

        await systemServiceStart({ npx: false }, host);

        expect(host.userWrites[0]!.contents).toContain('ExecStart="/usr/bin/env" "happy2"');
        expect(host.userWrites[0]!.contents).not.toContain('"npx"');
    });

    it("prints Linux stop and unregister commands without invoking sudo", async () => {
        const host = new FakeHost();
        host.platform = "linux";

        await systemServiceStop(host);

        expect(host.commands).toEqual([]);
        expect(host.logs).toEqual([
            "Stop Happy (2) and remove automatic boot startup with:",
            "  sudo systemctl disable --now happy2.service",
            "  sudo rm -f /etc/systemd/system/happy2.service",
            "  sudo systemctl daemon-reload",
        ]);
    });

    it("rejects unsupported systems, direct sudo, and missing configs", async () => {
        const host = new FakeHost();
        host.platform = "win32";
        await expect(systemServiceStop(host)).rejects.toThrow("supported on macOS and Linux only");

        host.platform = "darwin";
        host.euid = 0;
        await expect(systemServiceStop(host)).rejects.toThrow("without sudo on macOS");

        host.platform = "linux";
        host.euid = 501;
        host.environment.SUDO_USER = "ada";
        await expect(systemServiceStop(host)).rejects.toThrow("Run this command without sudo");

        delete host.environment.SUDO_USER;
        await expect(
            systemServiceStart({ configPath: "missing.toml", npx: false }, host),
        ).rejects.toThrow("config does not exist: /Users/ada/Happy & Work/missing.toml");
    });

    it("escapes launchd XML and systemd command values without invoking a shell", () => {
        const plist = renderLaunchdPlist({
            arguments_: ["node", `a<&>'"`],
            cwd: "/tmp/work",
            environment: {},
            standardErrorPath: "/tmp/error",
            standardOutPath: "/tmp/out",
        });
        expect(plist).toContain("a&lt;&amp;&gt;&apos;&quot;");

        const unit = renderSystemdUnit({
            arguments_: ["/node", 'path with \\ and "quote"'],
            cwd: "/work",
            environment: {},
            username: "happy-user",
        });
        expect(unit).toContain('ExecStart="/node" "path with \\\\ and \\"quote\\""');
        expect(() =>
            renderSystemdUnit({
                arguments_: ["bad\nvalue"],
                cwd: "/work",
                environment: {},
                username: "ada",
            }),
        ).toThrow("cannot contain line breaks");
        expect(() =>
            renderSystemdUnit({
                arguments_: ["node"],
                cwd: "/work",
                environment: {},
                username: "bad user",
            }),
        ).toThrow("Cannot install a systemd service");
    });

    it("documents start, stop, sudo, login, and boot behavior in CLI help", () => {
        const usage = systemServiceUsage();
        expect(usage).toContain("happy2 service start");
        expect(usage).toContain("happy2 service stop");
        expect(usage).toContain("does not use sudo");
        expect(usage).toContain("install it for boot");
    });

    it("parses every service CLI action and rejects ambiguous arguments", () => {
        expect(parseSystemServiceCommand(["start"])).toEqual({
            action: "start",
            configPath: undefined,
        });
        expect(parseSystemServiceCommand(["start", "--config", "happy2.toml"])).toEqual({
            action: "start",
            configPath: "happy2.toml",
        });
        expect(parseSystemServiceCommand(["stop"])).toEqual({ action: "stop" });
        expect(parseSystemServiceCommand(["help"])).toEqual({ action: "help" });
        expect(parseSystemServiceCommand(["-h"])).toEqual({ action: "help" });
        expect(parseSystemServiceCommand([])).toEqual({ action: "invalid" });
        expect(parseSystemServiceCommand(["unknown"])).toEqual({ action: "invalid" });
        expect(parseSystemServiceCommand(["start", "extra"])).toEqual({ action: "invalid" });
        expect(parseSystemServiceCommand(["start", "--unknown"])).toEqual({ action: "invalid" });
        expect(parseSystemServiceCommand(["start", "--config"])).toEqual({ action: "invalid" });
        expect(parseSystemServiceCommand(["stop", "--config", "happy2.toml"])).toEqual({
            action: "invalid",
        });
    });

    it("recognizes cross-platform _npx cache invocations", () => {
        expect(isNpxInvocation("/home/ada/.npm/_npx/hash/happy2.js")).toBe(true);
        expect(isNpxInvocation(String.raw`C:\Users\ada\npm-cache\_npx\hash\happy2.js`)).toBe(true);
        expect(isNpxInvocation("/usr/local/lib/node_modules/happy2/bin/happy2.js")).toBe(false);
        expect(isNpxInvocation(undefined)).toBe(false);
    });

    it("wires help and invalid service arguments through the executable CLI", async () => {
        const runner = join(import.meta.dirname, "runner.ts");
        const help = await execute(process.execPath, ["--import=tsx", runner, "service", "--help"]);
        expect(help.stdout).toContain("happy2 service start");
        expect(help.stderr).toBe("");

        try {
            await execute(process.execPath, ["--import=tsx", runner, "service", "--unknown"]);
            throw new Error("Expected invalid service arguments to fail.");
        } catch (error) {
            expect(error).toMatchObject({ code: 1, stdout: "" });
            expect((error as { stderr: string }).stderr).toContain("happy2 service start");
            expect((error as { stderr: string }).stderr).not.toContain("Error:");
        }
    });

    it("provides a real host with atomic user file operations and command failures", async () => {
        const directory = await mkdtemp(join(tmpdir(), "happy2-system-service-test-"));
        try {
            const host = createSystemServiceHost();
            const nested = join(directory, "nested");
            const file = join(nested, "service.plist");
            await host.directoryCreate(nested);
            await host.userFileWrite(file, "service definition\n", 0o600);
            expect(await host.fileExists(file)).toBe(true);
            expect(await readFile(file, "utf8")).toBe("service definition\n");
            await host.userFileRemove(file);
            expect(await host.fileExists(file)).toBe(false);

            await host.commandRun(host.nodePath, ["-e", "process.exit(3)"], {
                allowFailure: true,
            });
            await expect(host.commandRun(host.nodePath, ["-e", "process.exit(4)"])).rejects.toThrow(
                "exited with status 4",
            );
        } finally {
            await rm(directory, { force: true, recursive: true });
        }
    });
});
