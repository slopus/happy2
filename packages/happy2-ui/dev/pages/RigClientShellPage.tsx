import { RigClientShell, type RigClientShellProps } from "../../src/RigClientShell";
import { ComponentPage, FullScreenSpecimen } from "../kit";

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
                {
                    id: "session-2",
                    kind: "channel",
                    label: "Review terminal lifecycle",
                    meta: "idle",
                },
            ],
        },
    ],
    terminalHeight: 260,
    terminalIds: [{ id: "terminal-1", label: "Terminal abc123", running: true }],
};

export function RigClientShellPage() {
    return (
        <ComponentPage
            number="C-148"
            summary="Complete desktop-only direct-Rig workspace: grouped sessions, live chat controls, activity, and terminal access."
            title="Rig client shell"
        >
            <FullScreenSpecimen
                detail="1280 × 800 design reference · active streaming session"
                label="Connected workspace"
                number="01"
            >
                <RigClientShell {...base} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="720 × 480 Electron minimum · first local session"
                label="Empty Rig"
                number="02"
            >
                <RigClientShell
                    {...base}
                    activeSessionId={undefined}
                    activity={{ now: 0, subagents: [], terminals: [] }}
                    session={undefined}
                    sidebarSections={[]}
                    terminalIds={[]}
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
