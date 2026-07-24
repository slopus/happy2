import { spawn as ptySpawn, type IPty } from "@lydell/node-pty";
import { randomBytes } from "node:crypto";
import { userInfo } from "node:os";
import type { LocalRigConnector } from "./localRig";

export const rigInstallCommand = "npm install --global @slopus/rig";
const installExitMarker = "__HAPPY2_RIG_INSTALL_EXIT__:";
const maximumInputLength = 65_536;
const maximumTerminalsPerOwner = 2;

export type RigInstallTerminalEvent =
    | { readonly type: "output"; readonly terminalId: string; readonly data: string }
    | {
          readonly type: "exited";
          readonly terminalId: string;
          readonly exitCode: number;
          readonly verified: boolean;
          readonly message?: string;
      };

export interface RigInstallTerminalSnapshot {
    readonly terminalId: string;
    readonly command: typeof rigInstallCommand;
    readonly status: "awaitingConfirmation" | "running" | "exited";
}

export interface RigInstallPty {
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): void;
    onData(listener: (data: string) => void): { dispose(): void };
    onExit(listener: (event: { readonly exitCode: number }) => void): { dispose(): void };
}

export interface RigInstallPtyHost {
    spawn(
        executable: string,
        arguments_: readonly string[],
        options: {
            readonly cols: number;
            readonly rows: number;
            readonly cwd: string;
            readonly env: Record<string, string>;
            readonly name: string;
        },
    ): RigInstallPty;
}

const defaultPtyHost: RigInstallPtyHost = {
    spawn: (executable, arguments_, options) =>
        ptySpawn(executable, [...arguments_], options) as IPty,
};

interface Installation {
    readonly id: string;
    readonly ownerId: number;
    readonly emit: (event: RigInstallTerminalEvent) => void;
    status: RigInstallTerminalSnapshot["status"];
    pty?: RigInstallPty;
    dataSubscription?: { dispose(): void };
    exitSubscription?: { dispose(): void };
    exitMarker?: number;
}

/** Owns fixed-command installation PTYs and bounds them to renderer lifetimes. */
export class RigInstallTerminalManager implements Disposable {
    private readonly installations = new Map<string, Installation>();
    private disposed = false;

    constructor(
        private readonly connector: LocalRigConnector,
        private readonly options: {
            readonly ptyHost?: RigInstallPtyHost;
            readonly environment?: NodeJS.ProcessEnv;
            readonly shell?: string;
            readonly cwd?: string;
            readonly verified?: () => void;
        } = {},
    ) {}

    open(
        ownerId: number,
        emit: (event: RigInstallTerminalEvent) => void,
    ): RigInstallTerminalSnapshot {
        this.assertActive();
        const owned = [...this.installations.values()].filter(
            (installation) => installation.ownerId === ownerId,
        );
        if (owned.length >= maximumTerminalsPerOwner)
            throw new Error("Too many Rig installation terminals are open.");
        const id = `install_${randomBytes(16).toString("hex")}`;
        this.installations.set(id, {
            id,
            ownerId,
            emit,
            status: "awaitingConfirmation",
        });
        return { terminalId: id, command: rigInstallCommand, status: "awaitingConfirmation" };
    }

    confirm(ownerId: number, terminalId: string, cols = 80, rows = 24): void {
        const installation = this.owned(ownerId, terminalId);
        if (installation.status !== "awaitingConfirmation")
            throw new Error("The Rig installation terminal was already confirmed.");
        sizeValidate(cols, rows);
        const environment = this.options.environment ?? process.env;
        const shell = this.options.shell ?? environment.SHELL ?? userInfo().shell;
        if (!shell) throw new Error("The user's login shell is unavailable.");
        const fixedScript =
            `${rigInstallCommand}; ` +
            `install_status=$?; printf '\\n${installExitMarker}%s\\n' "$install_status"; ` +
            `exit "$install_status"`;
        const pty = (this.options.ptyHost ?? defaultPtyHost).spawn(
            shell,
            ["-l", "-c", fixedScript],
            {
                cols,
                rows,
                cwd: this.options.cwd ?? environment.HOME ?? process.cwd(),
                env: stringEnvironment(environment),
                name: "xterm-256color",
            },
        );
        installation.status = "running";
        installation.pty = pty;
        installation.dataSubscription = pty.onData((data) => {
            const marker = data.lastIndexOf(installExitMarker);
            if (marker >= 0) {
                const match = new RegExp(`${installExitMarker}(\\d+)`, "u").exec(
                    data.slice(marker),
                );
                if (match?.[1]) installation.exitMarker = Number(match[1]);
            }
            installation.emit({ type: "output", terminalId, data });
        });
        installation.exitSubscription = pty.onExit(({ exitCode }) => {
            void this.exit(installation, installation.exitMarker ?? exitCode);
        });
    }

    input(ownerId: number, terminalId: string, data: string): void {
        const installation = this.owned(ownerId, terminalId);
        if (
            installation.status !== "running" ||
            !installation.pty ||
            data.length > maximumInputLength
        )
            throw new Error("The Rig installation terminal input is invalid.");
        installation.pty.write(data);
    }

    resize(ownerId: number, terminalId: string, cols: number, rows: number): void {
        const installation = this.owned(ownerId, terminalId);
        sizeValidate(cols, rows);
        if (installation.status !== "running" || !installation.pty)
            throw new Error("The Rig installation terminal is not running.");
        installation.pty.resize(cols, rows);
    }

    close(ownerId: number, terminalId: string): void {
        const installation = this.owned(ownerId, terminalId);
        this.installationDispose(installation);
        this.installations.delete(terminalId);
    }

    closeOwner(ownerId: number): void {
        for (const installation of this.installations.values()) {
            if (installation.ownerId !== ownerId) continue;
            this.installationDispose(installation);
            this.installations.delete(installation.id);
        }
    }

    [Symbol.dispose](): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const installation of this.installations.values())
            this.installationDispose(installation);
        this.installations.clear();
    }

    private async exit(installation: Installation, exitCode: number): Promise<void> {
        if (installation.status !== "running") return;
        installation.status = "exited";
        installation.dataSubscription?.dispose();
        installation.exitSubscription?.dispose();
        installation.dataSubscription = undefined;
        installation.exitSubscription = undefined;
        installation.pty = undefined;
        if (exitCode !== 0) {
            installation.emit({
                type: "exited",
                terminalId: installation.id,
                exitCode,
                verified: false,
                message: `npm exited with status ${exitCode}.`,
            });
            return;
        }
        try {
            const connection = await this.connector.connect();
            connection.close();
            if (this.disposed || this.installations.get(installation.id) !== installation) return;
            installation.emit({
                type: "exited",
                terminalId: installation.id,
                exitCode,
                verified: true,
            });
            this.options.verified?.();
        } catch (error) {
            if (this.disposed || this.installations.get(installation.id) !== installation) return;
            installation.emit({
                type: "exited",
                terminalId: installation.id,
                exitCode,
                verified: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "The installed Rig command could not be verified.",
            });
        }
    }

    private owned(ownerId: number, terminalId: string): Installation {
        this.assertActive();
        if (!/^install_[a-f0-9]{32}$/u.test(terminalId))
            throw new Error("The Rig installation terminal identity is invalid.");
        const installation = this.installations.get(terminalId);
        if (!installation || installation.ownerId !== ownerId)
            throw new Error("The Rig installation terminal is unavailable.");
        return installation;
    }

    private installationDispose(installation: Installation): void {
        installation.dataSubscription?.dispose();
        installation.exitSubscription?.dispose();
        installation.pty?.kill();
        installation.dataSubscription = undefined;
        installation.exitSubscription = undefined;
        installation.pty = undefined;
        installation.status = "exited";
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("The Rig installation manager is closed.");
    }
}

function sizeValidate(cols: number, rows: number): void {
    if (
        !Number.isSafeInteger(cols) ||
        !Number.isSafeInteger(rows) ||
        cols < 2 ||
        cols > 1000 ||
        rows < 1 ||
        rows > 1000
    )
        throw new Error("The Rig installation terminal size is invalid.");
}

function stringEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
    return Object.fromEntries(
        Object.entries(environment).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
        ),
    );
}
