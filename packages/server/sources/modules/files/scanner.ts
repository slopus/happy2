import { spawn } from "node:child_process";

export type MalwareScanResult =
    | { verdict: "clean" }
    | { verdict: "infected"; threat?: string }
    | { verdict: "error"; message: string };

export interface MalwareScanner {
    scan(path: string): Promise<MalwareScanResult>;
}

export class DisabledMalwareScanner implements MalwareScanner {
    async scan(): Promise<MalwareScanResult> {
        return { verdict: "clean" };
    }
}

/**
 * Runs a scanner directly without a shell. Exit 0 means clean, 1 means
 * infected, and every other exit or timeout is treated as a scanner error.
 */
export class CommandMalwareScanner implements MalwareScanner {
    constructor(
        private readonly command: string,
        private readonly configuredArguments: string[],
        private readonly timeoutMs: number,
    ) {}

    async scan(path: string): Promise<MalwareScanResult> {
        const hasPlaceholder = this.configuredArguments.some((value) => value.includes("{path}"));
        const arguments_ = this.configuredArguments.map((value) =>
            value.replaceAll("{path}", path),
        );
        if (!hasPlaceholder) arguments_.push(path);
        return new Promise((resolve) => {
            const child = spawn(this.command, arguments_, {
                shell: false,
                stdio: ["ignore", "pipe", "pipe"],
            });
            let output = "";
            const collect = (chunk: Buffer) => {
                if (output.length < 16_384)
                    output += chunk.toString("utf8").slice(0, 16_384 - output.length);
            };
            child.stdout.on("data", collect);
            child.stderr.on("data", collect);
            let settled = false;
            let timer: NodeJS.Timeout | undefined;
            const finish = (result: MalwareScanResult) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                resolve(result);
            };
            timer = setTimeout(() => {
                child.kill("SIGKILL");
                finish({ verdict: "error", message: "Malware scanner timed out" });
            }, this.timeoutMs);
            timer.unref();
            child.once("error", (error) => finish({ verdict: "error", message: error.message }));
            child.once("close", (code, signal) => {
                if (code === 0) return finish({ verdict: "clean" });
                if (code === 1)
                    return finish({ verdict: "infected", threat: output.trim() || undefined });
                return finish({
                    verdict: "error",
                    message: `Malware scanner failed (${signal ?? code ?? "unknown"})`,
                });
            });
        });
    }
}
