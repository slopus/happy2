import { afterEach, describe, expect, it, vi } from "vitest";
import {
    RemoteTerminalClientReplica,
    type ProtocolHttpClient,
    type RemoteTerminalAttachment,
} from "@slopus/rig-client-runtime/dist/client/index.js";
import type { RigSessionId, RigTerminalId, RigTerminalObserver } from "happy2-state";
import { RigProtocolTransport } from "./rigProtocolTransport";

const sessionId = "session-disposal-race" as RigSessionId;
const terminalId = "terminal-disposal-race" as RigTerminalId;
const observer: RigTerminalObserver = {
    connected: () => undefined,
    grid: () => undefined,
    exit: () => undefined,
    error: () => undefined,
};

afterEach(() => vi.restoreAllMocks());

describe("Rig protocol terminal ownership", () => {
    it("closes a replica created after the transport was disposed", async () => {
        const replica = fakeReplica();
        let resolveReplica!: (value: RemoteTerminalClientReplica) => void;
        vi.spyOn(RemoteTerminalClientReplica, "create").mockReturnValue(
            new Promise((resolve) => {
                resolveReplica = resolve;
            }),
        );
        const client = {} as ProtocolHttpClient;
        const transport = new RigProtocolTransport(client);

        const connecting = transport.terminalConnect(sessionId, terminalId, observer);
        transport[Symbol.dispose]();
        resolveReplica(replica.value);

        await expect(connecting).rejects.toThrow("transport is closed");
        expect(replica.close).toHaveBeenCalledOnce();
    });

    it("closes an attachment that resolves after the transport was disposed", async () => {
        const replica = fakeReplica();
        const attachment = fakeAttachment();
        vi.spyOn(RemoteTerminalClientReplica, "create").mockResolvedValue(replica.value);
        let resolveAttachment!: (value: RemoteTerminalAttachment) => void;
        const attachRemoteTerminal = vi.fn(
            () =>
                new Promise<RemoteTerminalAttachment>((resolve) => {
                    resolveAttachment = resolve;
                }),
        );
        const client = { attachRemoteTerminal } as unknown as ProtocolHttpClient;
        const transport = new RigProtocolTransport(client);

        const connecting = transport.terminalConnect(sessionId, terminalId, observer);
        await vi.waitFor(() => expect(attachRemoteTerminal).toHaveBeenCalledOnce());
        transport[Symbol.dispose]();
        resolveAttachment(attachment.value);

        await expect(connecting).rejects.toThrow("transport is closed");
        expect(attachment.close).toHaveBeenCalledOnce();
        expect(replica.close).toHaveBeenCalledOnce();
    });
});

function fakeReplica() {
    const close = vi.fn();
    const value = {
        applyGrid: vi.fn(async () => undefined),
        applyVt: vi.fn(async () => undefined),
        close,
        terminal: { snapshot: vi.fn() },
    } as unknown as RemoteTerminalClientReplica;
    return { value, close };
}

function fakeAttachment() {
    const close = vi.fn();
    const value = {
        close,
        exited: new Promise<number | null>(() => undefined),
        protocol: { resize: vi.fn(async () => undefined) },
        reconnectState: vi.fn(),
        requestScrollback: vi.fn(),
        writeInput: vi.fn(),
    } as unknown as RemoteTerminalAttachment;
    return { value, close };
}
