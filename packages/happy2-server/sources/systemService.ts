import { spawn } from "node:child_process";
import { access, chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const launchdLabel = "com.slopus.happy2";
const systemdUnit = "happy2.service";
const systemdPath = `/etc/systemd/system/${systemdUnit}`;

export interface SystemServiceHost {
    platform: NodeJS.Platform;
    cwd: string;
    home: string;
    username: string;
    uid: number;
    euid: number;
    environment: NodeJS.ProcessEnv;
    nodePath: string;
    fileExists(path: string): Promise<boolean>;
    directoryCreate(path: string): Promise<void>;
    userFileWrite(path: string, contents: string, mode: number): Promise<void>;
    userFileRemove(path: string): Promise<void>;
    commandRun(
        command: string,
        arguments_: readonly string[],
        options?: { allowFailure?: boolean },
    ): Promise<void>;
    log(message: string): void;
}

export interface SystemServiceStartOptions {
    configPath?: string;
    npx: boolean;
}

export type ParsedSystemServiceCommand =
    | { action: "help" | "invalid" | "stop" }
    | { action: "start"; configPath?: string };

export function parseSystemServiceCommand(
    arguments_: readonly string[],
): ParsedSystemServiceCommand {
    let positionals: string[];
    let values: { config?: string; help?: boolean };
    try {
        const parsed = parseArgs({
            args: [...arguments_],
            allowPositionals: true,
            options: {
                config: { type: "string" },
                help: { type: "boolean", short: "h" },
            },
        });
        positionals = parsed.positionals;
        values = parsed.values;
    } catch {
        return { action: "invalid" };
    }
    const action = positionals[0];
    if (
        (values.help || action === "help") &&
        positionals.length <= 1 &&
        values.config === undefined
    ) {
        return { action: "help" };
    }
    if (action === "start" && positionals.length === 1) {
        return { action: "start", configPath: values.config };
    }
    if (action === "stop" && positionals.length === 1 && values.config === undefined) {
        return { action: "stop" };
    }
    return { action: "invalid" };
}

export function isNpxInvocation(executablePath: string | undefined): boolean {
    return executablePath?.split(/[\\/]/).includes("_npx") === true;
}

export async function systemServiceStart(
    options: SystemServiceStartOptions,
    host: SystemServiceHost = createSystemServiceHost(),
): Promise<void> {
    rejectUnsupportedPlatform(host.platform);
    rejectSudoInvocation(host);
    const configPath = await resolveConfigPath(options.configPath, host);
    const runnerArguments = options.npx
        ? ["/usr/bin/env", "npx", "--yes", "happy2"]
        : ["/usr/bin/env", "happy2"];
    if (configPath) runnerArguments.push("--config", configPath);

    if (host.platform === "darwin") {
        await launchdStart(host, runnerArguments);
        return;
    }
    await systemdStart(host, runnerArguments);
}

export async function systemServiceStop(
    host: SystemServiceHost = createSystemServiceHost(),
): Promise<void> {
    rejectUnsupportedPlatform(host.platform);
    rejectSudoInvocation(host);
    if (host.platform === "darwin") {
        await launchdStop(host);
        return;
    }
    await systemdStop(host);
}

export function systemServiceUsage(): string {
    return [
        "Usage:",
        "  happy2 service start [--config /path/to/happy2.toml]",
        "  happy2 service stop",
        "",
        "macOS installs a per-user LaunchAgent and does not use sudo. It starts at login.",
        "Linux writes ./happy2.service, prints it, and shows the sudo commands that install it for boot.",
    ].join("\n");
}

async function launchdStart(host: SystemServiceHost, arguments_: readonly string[]): Promise<void> {
    const agentsDirectory = join(host.home, "Library", "LaunchAgents");
    const logsDirectory = join(host.home, "Library", "Logs", "Happy2");
    const plistPath = join(agentsDirectory, `${launchdLabel}.plist`);
    await host.directoryCreate(agentsDirectory);
    await host.directoryCreate(logsDirectory);
    await host.commandRun("launchctl", ["bootout", `gui/${host.uid}/${launchdLabel}`], {
        allowFailure: true,
    });
    await host.userFileWrite(
        plistPath,
        renderLaunchdPlist({
            arguments_,
            cwd: host.cwd,
            environment: serviceEnvironment(host.environment),
            standardErrorPath: join(logsDirectory, "server-error.log"),
            standardOutPath: join(logsDirectory, "server.log"),
        }),
        0o600,
    );
    await host.commandRun("launchctl", ["bootstrap", `gui/${host.uid}`, plistPath]);
    host.log("Happy (2) is running and will start automatically when you log in.");
    host.log(`Logs: ${logsDirectory}`);
}

async function launchdStop(host: SystemServiceHost): Promise<void> {
    const plistPath = join(host.home, "Library", "LaunchAgents", `${launchdLabel}.plist`);
    const installed = await host.fileExists(plistPath);
    await host.commandRun("launchctl", ["bootout", `gui/${host.uid}/${launchdLabel}`], {
        allowFailure: true,
    });
    if (installed) await host.userFileRemove(plistPath);
    host.log(
        installed
            ? "Happy (2) was stopped and removed from automatic login startup."
            : "Happy (2) is not installed as a login service.",
    );
}

async function systemdStart(host: SystemServiceHost, arguments_: readonly string[]): Promise<void> {
    const generatedPath = join(host.cwd, systemdUnit);
    const unit = renderSystemdUnit({
        arguments_,
        cwd: host.cwd,
        environment: serviceEnvironment(host.environment),
        username: host.username,
    });
    await host.userFileWrite(generatedPath, unit, 0o644);
    host.log(`Generated ${generatedPath}:`);
    host.log("");
    host.log(unit.trimEnd());
    host.log("");
    host.log("Install and start it with:");
    host.log(`  sudo install -m 0644 ${shellQuote(generatedPath)} ${systemdPath}`);
    host.log("  sudo systemctl daemon-reload");
    host.log(`  sudo systemctl enable --now ${systemdUnit}`);
    host.log("");
    host.log(`Then check it with: sudo systemctl status ${systemdUnit}`);
    host.log(`Logs: sudo journalctl -u ${systemdUnit}`);
}

async function systemdStop(host: SystemServiceHost): Promise<void> {
    host.log("Stop Happy (2) and remove automatic boot startup with:");
    host.log(`  sudo systemctl disable --now ${systemdUnit}`);
    host.log(`  sudo rm -f ${systemdPath}`);
    host.log("  sudo systemctl daemon-reload");
}

function rejectUnsupportedPlatform(platform: NodeJS.Platform): void {
    if (platform !== "darwin" && platform !== "linux") {
        throw new Error("Happy (2) services are supported on macOS and Linux only.");
    }
}

function rejectSudoInvocation(host: SystemServiceHost): void {
    if (host.platform === "darwin" && host.euid === 0) {
        throw new Error(
            "Run this command without sudo on macOS; Happy (2) installs a user service.",
        );
    }
    if (host.platform === "linux" && host.environment.SUDO_USER) {
        throw new Error(
            "Run this command without sudo. Happy (2) will print the sudo commands needed by systemd.",
        );
    }
}

async function resolveConfigPath(
    configPath: string | undefined,
    host: SystemServiceHost,
): Promise<string | undefined> {
    if (!configPath) return undefined;
    const absolute = isAbsolute(configPath) ? configPath : resolve(host.cwd, configPath);
    if (!(await host.fileExists(absolute))) {
        throw new Error(`Happy (2) config does not exist: ${absolute}`);
    }
    return absolute;
}

function serviceEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
    const result: Record<string, string> = {};
    if (environment.PATH) result.PATH = environment.PATH;
    if (environment.RIG_HOME) result.RIG_HOME = environment.RIG_HOME;
    return result;
}

export function renderLaunchdPlist(input: {
    arguments_: readonly string[];
    cwd: string;
    environment: Readonly<Record<string, string>>;
    standardErrorPath: string;
    standardOutPath: string;
}): string {
    const argumentsXml = input.arguments_
        .map((argument) => `        <string>${xmlEscape(argument)}</string>`)
        .join("\n");
    const environmentXml = Object.entries(input.environment)
        .map(
            ([key, value]) =>
                `        <key>${xmlEscape(key)}</key>\n        <string>${xmlEscape(value)}</string>`,
        )
        .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${launchdLabel}</string>
    <key>ProgramArguments</key>
    <array>
${argumentsXml}
    </array>
    <key>WorkingDirectory</key>
    <string>${xmlEscape(input.cwd)}</string>
    <key>EnvironmentVariables</key>
    <dict>
${environmentXml}
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>StandardOutPath</key>
    <string>${xmlEscape(input.standardOutPath)}</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(input.standardErrorPath)}</string>
</dict>
</plist>
`;
}

export function renderSystemdUnit(input: {
    arguments_: readonly string[];
    cwd: string;
    environment: Readonly<Record<string, string>>;
    username: string;
}): string {
    const environment = Object.entries(input.environment)
        .map(([key, value]) => `Environment=${systemdQuote(`${key}=${value}`)}`)
        .join("\n");
    return `[Unit]
Description=Happy (2)
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=${systemdValue(input.username)}
WorkingDirectory=${systemdQuote(input.cwd)}
ExecStart=${input.arguments_.map(systemdQuote).join(" ")}
${environment ? `${environment}\n` : ""}Restart=always
RestartSec=5
UMask=0077

[Install]
WantedBy=multi-user.target
`;
}

function xmlEscape(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

function systemdQuote(value: string): string {
    if (value.includes("\n") || value.includes("\r") || value.includes("\0")) {
        throw new Error("Service values cannot contain line breaks.");
    }
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
}

function systemdValue(value: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
        throw new Error(`Cannot install a systemd service for user ${JSON.stringify(value)}.`);
    }
    return value;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function createSystemServiceHost(): SystemServiceHost {
    const currentUser = userInfo();
    const effectiveUid = process.geteuid?.() ?? currentUser.uid;
    const commandRun: SystemServiceHost["commandRun"] = async (
        command,
        arguments_,
        options = {},
    ) => {
        const code = await spawnAndWait(command, arguments_);
        if (code !== 0 && !options.allowFailure) {
            throw new Error(`${command} exited with status ${code}.`);
        }
    };
    return {
        platform: process.platform,
        cwd: process.cwd(),
        home: homedir(),
        username: currentUser.username,
        uid: process.getuid?.() ?? currentUser.uid,
        euid: effectiveUid,
        environment: process.env,
        nodePath: process.execPath,
        async fileExists(path) {
            try {
                await access(path);
                return true;
            } catch {
                return false;
            }
        },
        async directoryCreate(path) {
            await mkdir(path, { mode: 0o700, recursive: true });
        },
        async userFileWrite(path, contents, mode) {
            const temporaryPath = `${path}.${process.pid}.tmp`;
            await writeFile(temporaryPath, contents, { mode });
            await rename(temporaryPath, path);
            await chmod(path, mode);
        },
        async userFileRemove(path) {
            await rm(path, { force: true });
        },
        commandRun,
        log(message) {
            console.log(message);
        },
    };
}

async function spawnAndWait(command: string, arguments_: readonly string[]): Promise<number> {
    return await new Promise<number>((resolvePromise, reject) => {
        const child = spawn(command, [...arguments_], { stdio: "inherit" });
        child.once("error", reject);
        child.once("exit", (code, signal) => {
            if (signal) reject(new Error(`${command} was terminated by ${signal}.`));
            else resolvePromise(code ?? 1);
        });
    });
}
