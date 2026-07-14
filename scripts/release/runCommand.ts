import { spawnSync } from "node:child_process";

export interface RunCommandOptions {
    allowFailure?: boolean;
    captureOutput?: boolean;
    cwd?: string;
}

export interface RunCommandResult {
    status: number;
    stderr: string;
    stdout: string;
}

export function runCommand(
    command: string,
    arguments_: readonly string[],
    options: RunCommandOptions = {},
): RunCommandResult {
    const result = spawnSync(command, arguments_, {
        cwd: options.cwd,
        encoding: "utf8",
        stdio: options.captureOutput === true ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    if (result.error !== undefined) {
        throw result.error;
    }

    const status = result.status ?? 1;
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
    if (status !== 0 && options.allowFailure !== true) {
        if (stderr.length > 0) {
            console.error(stderr);
        }
        throw new Error(`Command failed: ${command} ${arguments_.join(" ")}`);
    }

    return { status, stderr, stdout };
}
