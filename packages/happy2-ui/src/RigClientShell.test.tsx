import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import "./styles.css";
import { RigClientShell, type RigClientShellProps } from "./RigClientShell";
import { createRenderer } from "./testing";

const noOp = () => undefined;
const base: RigClientShellProps = {
    activeSessionId: "session-1",
    activity: {
        now: Date.UTC(2026, 6, 23, 20, 0),
        subagents: [
            {
                id: "subagent-1",
                description: "Inspect renderer lifecycle",
                latestText: "Reading RigClientShell.tsx",
                startedAt: Date.UTC(2026, 6, 23, 19, 59, 32),
                status: "running",
                totalTokens: 1_284,
            },
        ],
        terminals: [],
    },
    composerValue: "",
    onAbort: noOp,
    onAnswerInput: noOp,
    onChangeConnection: noOp,
    onComposerValueChange: noOp,
    onDirectoryPick: async () => undefined,
    onEffortChange: noOp,
    onFork: noOp,
    onModelChange: noOp,
    onPermissionModeChange: noOp,
    onReset: noOp,
    onSend: noOp,
    onServiceTierChange: noOp,
    onSessionCreate: noOp,
    onSessionSelect: noOp,
    onTerminalClose: noOp,
    onTerminalCreate: noOp,
    onTerminalHeightChange: noOp,
    onTerminalInput: noOp,
    onTerminalOpen: noOp,
    onTerminalReconnect: noOp,
    onTerminalResize: noOp,
    onTerminalStop: noOp,
    rigVersion: "0.0.45",
    session: {
        cwd: "/Users/ada/Developer/happy2",
        effort: "high",
        effortOptions: [
            { label: "medium", value: "medium" },
            { label: "high", value: "high" },
        ],
        id: "session-1",
        messages: [
            { body: "Please wire the local Rig client.", id: "message-1", role: "user" },
            {
                body: "I’m inspecting the existing state and UI contracts now.",
                id: "message-2",
                role: "agent",
            },
        ],
        modelId: "gpt-5",
        modelLocked: false,
        modelOptions: [{ label: "GPT-5", value: "gpt-5" }],
        pendingInputs: [],
        permissionMode: "workspace_write",
        serviceTier: "fast",
        status: "running",
        title: "Direct local Rig client",
    },
    sidebarSections: [
        {
            id: "/Users/ada/Developer/happy2",
            label: "~/Developer/happy2",
            items: [
                {
                    id: "session-1",
                    kind: "channel",
                    label: "Direct local Rig client",
                    meta: "running",
                },
            ],
        },
    ],
    terminalHeight: 260,
    terminalIds: [],
};

it("composes the direct-Rig desktop workspace and creates sessions from absolute paths", async () => {
    const sessionCreate = vi.fn();
    const directoryPick = vi.fn(async () => "/Users/ada/Developer/new-project");
    const view = createRenderer().render(
        () => (
            <RigClientShell
                {...base}
                onDirectoryPick={directoryPick}
                onSessionCreate={sessionCreate}
            />
        ),
        { width: 1280, height: 800 },
    );
    await view.ready();

    expect(view.$('[data-happy2-ui="app-shell"]').bounds()).toMatchObject({
        width: 1280,
        height: 800,
    });
    expect(view.container.textContent).toContain("Rig 0.0.45");
    expect(view.container.textContent).toContain("Direct local Rig client");
    expect(view.container.querySelectorAll('[data-happy2-ui="message"]')).toHaveLength(2);
    expect(view.$('[data-happy2-ui="message-list"]').computedStyle("overflow-y")).toBe("auto");

    const newSession = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("New session"))!;
    await userEvent.click(newSession);
    const cwd = view.container.querySelector<HTMLInputElement>(
        'input[placeholder="/Users/you/Developer/project"]',
    )!;
    const choose = view.container.querySelector<HTMLButtonElement>(
        ".happy2-rig-client__create button",
    )!;
    await userEvent.click(choose);
    await vi.waitFor(() => expect(cwd.value).toBe("/Users/ada/Developer/new-project"));
    expect(directoryPick).toHaveBeenCalledOnce();
    const create = Array.from(view.container.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Create session",
    )!;
    expect(create.disabled).toBe(false);
    await userEvent.click(create);
    expect(sessionCreate).toHaveBeenCalledWith("/Users/ada/Developer/new-project");

    await view.screenshot("RigClientShell.test");
});

it("preserves message nodes and composer focus across same-surface notifications", async () => {
    let snapshot = base;
    const listeners = new Set<() => void>();
    const store = {
        get: () => snapshot,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        update() {
            snapshot = {
                ...snapshot,
                session: {
                    ...snapshot.session!,
                    status: "idle",
                    title: "Direct local Rig client · ready",
                },
            };
            for (const listener of listeners) listener();
        },
    };
    function Host() {
        const props = useSyncExternalStore(store.subscribe, store.get, store.get);
        return <RigClientShell {...props} />;
    }
    const view = createRenderer().render(() => <Host />, { width: 1280, height: 800 });
    await view.ready();

    const message = view.container.querySelector('[data-happy2-ui="message"]')!;
    const textarea = view.container.querySelector<HTMLTextAreaElement>(
        '[data-happy2-ui="composer-textarea"]',
    )!;
    textarea.focus();
    expect(document.activeElement).toBe(textarea);
    store.update();
    await vi.waitFor(() =>
        expect(view.container.textContent).toContain("Direct local Rig client · ready"),
    );

    expect(view.container.querySelector('[data-happy2-ui="message"]')).toBe(message);
    expect(document.activeElement).toBe(textarea);
    expect(listeners.size).toBe(1);
});

it("does not replace a terminal that is already open", async () => {
    const terminalCreate = vi.fn();
    const terminalOpen = vi.fn();
    const view = createRenderer().render(
        () => (
            <RigClientShell
                {...base}
                activeTerminal={{
                    id: "terminal-1",
                    status: "disconnected",
                    exitCode: null,
                }}
                onTerminalCreate={terminalCreate}
                onTerminalOpen={terminalOpen}
                terminalIds={[{ id: "terminal-1", label: "Terminal 1", running: true }]}
            />
        ),
        { width: 1280, height: 800 },
    );
    await view.ready();

    await userEvent.click(view.container.querySelector('[aria-label="Terminal is open"]')!);

    expect(terminalCreate).not.toHaveBeenCalled();
    expect(terminalOpen).not.toHaveBeenCalled();
});
