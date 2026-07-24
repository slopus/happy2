import { describe, expect, it, vi } from "vitest";
import type { ProtocolHttpClient } from "@slopus/rig-client-runtime/dist/client/index.js";
import type { LocalRigConnection, LocalRigConnector } from "./localRig";
import {
    RigInstallTerminalManager,
    rigInstallCommand,
    type RigInstallPty,
    type RigInstallPtyHost,
    type RigInstallTerminalEvent,
} from "./rigInstallTerminal";

describe("confirmed Rig installation terminal", () => {
    it("does not spawn before confirmation, runs only the fixed command, and verifies success", async () => {
        const pty = fakePty();
        const host: RigInstallPtyHost = { spawn: vi.fn(() => pty.value) };
        const connector: LocalRigConnector = {
            connect: vi.fn(async () => ({
                client: {} as ProtocolHttpClient,
                command: "/usr/local/bin/rig",
                environment: { PATH: "/usr/local/bin:/usr/bin" },
                version: "0.0.45",
                close: vi.fn(),
            })),
        };
        const verified = vi.fn();
        const events: RigInstallTerminalEvent[] = [];
        using manager = new RigInstallTerminalManager(connector, {
            ptyHost: host,
            environment: { HOME: "/Users/ada", SHELL: "/bin/zsh" },
            shell: "/bin/zsh",
            cwd: "/Users/ada",
            verified,
        });
        const opened = manager.open(7, (event) => events.push(event));
        expect(opened.command).toBe(rigInstallCommand);
        expect(host.spawn).not.toHaveBeenCalled();
        expect(() => manager.input(7, opened.terminalId, "yes\n")).toThrow("input is invalid");

        manager.confirm(7, opened.terminalId, 100, 30);

        expect(host.spawn).toHaveBeenCalledOnce();
        const [shell, arguments_, options] = vi.mocked(host.spawn).mock.calls[0]!;
        expect(shell).toBe("/bin/zsh");
        expect(arguments_.slice(0, 2)).toEqual(["-l", "-c"]);
        expect(arguments_[2]).toContain(rigInstallCommand);
        expect(arguments_[2]).not.toContain(opened.terminalId);
        expect(options).toMatchObject({ cols: 100, rows: 30, cwd: "/Users/ada" });
        manager.input(7, opened.terminalId, "password\n");
        manager.resize(7, opened.terminalId, 120, 40);
        expect(pty.writes).toEqual(["password\n"]);
        expect(pty.sizes).toEqual([{ cols: 120, rows: 40 }]);

        pty.data("__HAPPY2_RIG_INSTALL_EXIT__:0\n");
        pty.exit(0);
        await vi.waitFor(() => expect(connector.connect).toHaveBeenCalledOnce());
        expect(verified).toHaveBeenCalledOnce();
        expect(events).toContainEqual(
            expect.objectContaining({ type: "exited", exitCode: 0, verified: true }),
        );
    });

    it("retains failed output and kills only terminals owned by the disposed renderer", () => {
        const first = fakePty();
        const second = fakePty();
        const host: RigInstallPtyHost = {
            spawn: vi.fn().mockReturnValueOnce(first.value).mockReturnValueOnce(second.value),
        };
        const connector: LocalRigConnector = { connect: vi.fn() };
        const events: RigInstallTerminalEvent[] = [];
        using manager = new RigInstallTerminalManager(connector, {
            ptyHost: host,
            shell: "/bin/zsh",
            environment: { HOME: "/tmp" },
        });
        const one = manager.open(1, (event) => events.push(event));
        const two = manager.open(2, (event) => events.push(event));
        manager.confirm(1, one.terminalId);
        manager.confirm(2, two.terminalId);
        first.data("npm error\n__HAPPY2_RIG_INSTALL_EXIT__:1\n");
        first.exit(1);
        expect(events).toContainEqual(
            expect.objectContaining({ type: "exited", exitCode: 1, verified: false }),
        );
        expect(connector.connect).not.toHaveBeenCalled();

        manager.closeOwner(2);
        expect(second.killed).toBe(true);
        expect(first.killed).toBe(false);
    });

    it("does not notify or retry after its renderer closes during verification", async () => {
        const pty = fakePty();
        const connectionClose = vi.fn();
        let connectionResolve!: (connection: LocalRigConnection) => void;
        const connector: LocalRigConnector = {
            connect: vi.fn(
                () =>
                    new Promise<LocalRigConnection>((resolve) => {
                        connectionResolve = resolve;
                    }),
            ),
        };
        const events: RigInstallTerminalEvent[] = [];
        const verified = vi.fn();
        using manager = new RigInstallTerminalManager(connector, {
            ptyHost: { spawn: () => pty.value },
            shell: "/bin/zsh",
            environment: { HOME: "/tmp" },
            verified,
        });
        const installation = manager.open(9, (event) => events.push(event));
        manager.confirm(9, installation.terminalId);
        pty.exit(0);
        await vi.waitFor(() => expect(connector.connect).toHaveBeenCalledOnce());

        manager.closeOwner(9);
        connectionResolve({
            client: {} as ProtocolHttpClient,
            command: "/usr/local/bin/rig",
            environment: {},
            version: "0.0.45",
            close: connectionClose,
        });
        await vi.waitFor(() => expect(connectionClose).toHaveBeenCalledOnce());

        expect(events).not.toContainEqual(expect.objectContaining({ type: "exited" }));
        expect(verified).not.toHaveBeenCalled();
    });
});

function fakePty() {
    let dataListener: (data: string) => void = () => undefined;
    let exitListener: (event: { readonly exitCode: number }) => void = () => undefined;
    const writes: string[] = [];
    const sizes: { cols: number; rows: number }[] = [];
    let killed = false;
    const value: RigInstallPty = {
        write: (data) => writes.push(data),
        resize: (cols, rows) => sizes.push({ cols, rows }),
        kill: () => {
            killed = true;
        },
        onData: (listener) => {
            dataListener = listener;
            return { dispose: () => undefined };
        },
        onExit: (listener) => {
            exitListener = listener;
            return { dispose: () => undefined };
        },
    };
    return {
        value,
        writes,
        sizes,
        get killed() {
            return killed;
        },
        data: (data: string) => dataListener(data),
        exit: (exitCode: number) => exitListener({ exitCode }),
    };
}
