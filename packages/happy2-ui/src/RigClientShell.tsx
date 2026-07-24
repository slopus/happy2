import { useState } from "react";
import type { TerminalGridSnapshot } from "happy2-state";
import type { AgentActivityStripProps } from "./AgentActivityStrip";
import { AppShell } from "./AppShell";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { ChannelHeader } from "./ChannelHeader";
import { ComposerModelControl } from "./ComposerModelControl";
import { EmptyState } from "./EmptyState";
import { Message, MessageList } from "./Message";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { ComposerDock } from "./pages/chat/ComposerDock";
import type { SelectOption } from "./Select";
import { Sidebar, type SidebarSection } from "./Sidebar";
import { TerminalPanel } from "./TerminalPanel";
import { TextField } from "./TextField";

export interface RigClientMessage {
    readonly body: string;
    readonly id: string;
    readonly role: "system" | "user" | "agent";
    readonly streaming?: boolean;
}

export interface RigClientInputQuestion {
    readonly header: string;
    readonly id: string;
    readonly multiSelect: boolean;
    readonly options: readonly { readonly description: string; readonly label: string }[];
    readonly question: string;
    readonly required: boolean;
}

export interface RigClientInputRequest {
    readonly questions: readonly RigClientInputQuestion[];
    readonly requestId: string;
}

export interface RigClientSessionView {
    readonly cwd: string;
    readonly effort?: string;
    readonly effortOptions: readonly SelectOption[];
    readonly error?: string;
    readonly id: string;
    readonly messages: readonly RigClientMessage[];
    readonly modelId: string;
    readonly modelLocked: boolean;
    readonly modelOptions: readonly SelectOption[];
    readonly pendingInputs: readonly RigClientInputRequest[];
    readonly permissionMode: string;
    readonly serviceTier?: string;
    readonly status: string;
    readonly title: string;
}

export interface RigClientTerminalView {
    readonly error?: string;
    readonly exitCode: number | null;
    readonly grid?: TerminalGridSnapshot;
    readonly id: string;
    readonly status: "connecting" | "connected" | "disconnected" | "exited" | "error";
}

export interface RigClientShellProps {
    readonly activeSessionId?: string;
    readonly activeTerminal?: RigClientTerminalView;
    readonly activity: Pick<AgentActivityStripProps, "now" | "subagents" | "terminals">;
    readonly composerValue: string;
    readonly directoryError?: string;
    readonly directoryLoading?: boolean;
    readonly onAbort: () => void;
    readonly onAnswerInput: (
        requestId: string,
        answers: Readonly<Record<string, readonly string[]>>,
    ) => void;
    readonly onChangeConnection: () => void;
    readonly onComposerValueChange: (value: string) => void;
    readonly onDirectoryPick: () => Promise<string | undefined>;
    readonly onEffortChange: (value?: string) => void;
    readonly onFork: () => void;
    readonly onModelChange: (value: string) => void;
    readonly onPermissionModeChange: (value: string) => void;
    readonly onReset: () => void;
    readonly onSend: () => void;
    readonly onServiceTierChange: (value?: string) => void;
    readonly onSessionCreate: (cwd: string) => void;
    readonly onSessionSelect: (sessionId: string) => void;
    readonly onTerminalClose: () => void;
    readonly onTerminalCreate: () => void;
    readonly onTerminalInput: (data: string) => void;
    readonly onTerminalOpen: (terminalId: string) => void;
    readonly onTerminalReconnect: () => void;
    readonly onTerminalResize: (cols: number, rows: number) => void;
    readonly onTerminalStop: (terminalId: string) => void;
    readonly rigVersion: string;
    readonly session?: RigClientSessionView;
    readonly sessionLoading?: boolean;
    readonly sidebarSections: readonly SidebarSection[];
    readonly terminalHeight: number;
    readonly terminalIds: readonly {
        readonly id: string;
        readonly label: string;
        readonly running: boolean;
    }[];
    readonly onTerminalHeightChange: (height: number) => void;
}

/** Complete props-only desktop composition for a direct local Rig connection. */
export function RigClientShell(props: RigClientShellProps) {
    const [createOpen, setCreateOpen] = useState(false);
    const [cwd, setCwd] = useState("");
    const session = props.session;
    const controlsDisabled = !session || Boolean(props.sessionLoading);
    return (
        <AppShell
            sidebar={
                <Sidebar
                    activeItemId={props.activeSessionId ?? ""}
                    brand
                    composeLabel="New session"
                    footer={
                        <div className="happy2-rig-client__sidebar-footer">
                            <span>Rig {props.rigVersion}</span>
                            <Button onClick={props.onChangeConnection} size="small" variant="ghost">
                                Switch
                            </Button>
                        </div>
                    }
                    onCompose={() => setCreateOpen(true)}
                    onItemSelect={props.onSessionSelect}
                    sections={[...props.sidebarSections]}
                    subtitle="Local sessions"
                />
            }
            sidebarCollapsible
            windowControls
        >
            <main
                className="happy2-rig-client happy2-chat-conversation"
                data-happy2-ui="rig-client-shell"
            >
                {props.directoryError ? (
                    <div className="happy2-rig-client__state">
                        <EmptyState
                            description={props.directoryError}
                            icon="shield"
                            title="Sessions could not be loaded"
                        />
                    </div>
                ) : props.directoryLoading ? (
                    <div className="happy2-rig-client__state">
                        <EmptyState
                            description="Reading the Rig catalog…"
                            icon="inbox"
                            title="Loading sessions"
                        />
                    </div>
                ) : !props.activeSessionId ? (
                    <div className="happy2-rig-client__state">
                        <EmptyState
                            action={{ label: "New session", onClick: () => setCreateOpen(true) }}
                            description="Start an agent in a working directory on this Mac."
                            icon="plus"
                            title="No Rig sessions yet"
                        />
                    </div>
                ) : props.sessionLoading || !session ? (
                    <div className="happy2-rig-client__state">
                        <EmptyState
                            description="Reconciling the session…"
                            icon="inbox"
                            title="Loading session"
                        />
                    </div>
                ) : (
                    <>
                        <ChannelHeader
                            actions={
                                <>
                                    {session.status === "running" ? (
                                        <Button
                                            aria-label="Stop active run"
                                            icon="pause"
                                            iconOnly
                                            onClick={props.onAbort}
                                            size="small"
                                            variant="ghost"
                                        />
                                    ) : null}
                                    <Button
                                        aria-label={
                                            props.activeTerminal
                                                ? "Terminal is open"
                                                : "Open terminal"
                                        }
                                        icon="terminal"
                                        iconOnly
                                        onClick={() => {
                                            if (props.activeTerminal) return;
                                            const terminal = props.terminalIds[0];
                                            if (terminal) props.onTerminalOpen(terminal.id);
                                            else props.onTerminalCreate();
                                        }}
                                        size="small"
                                        variant="ghost"
                                    />
                                </>
                            }
                            agentCount={props.activity.subagents.length || undefined}
                            icon="spark"
                            menuItems={sessionMenuItems(props)}
                            menuLabel="Rig session menu"
                            onMenuSelect={(id) => sessionMenuSelect(id, props)}
                            topic={session.cwd}
                            title={session.title}
                        />
                        {session.error ? (
                            <div className="happy2-rig-client__banner">
                                <Banner tone="danger">{session.error}</Banner>
                            </div>
                        ) : null}
                        <MessageList virtualize>
                            {session.messages.map((message) => (
                                <Message
                                    agent={message.role === "agent"}
                                    author={
                                        message.role === "agent"
                                            ? "Rig"
                                            : message.role === "system"
                                              ? "System"
                                              : "You"
                                    }
                                    body={message.body}
                                    generationStatus={message.streaming ? "streaming" : undefined}
                                    key={message.id}
                                    own={message.role === "user"}
                                    time=""
                                />
                            ))}
                        </MessageList>
                        <div className="happy2-rig-client__requests">
                            {session.pendingInputs.map((request) => (
                                <RigInputRequestCard
                                    key={request.requestId}
                                    onAnswer={(answers) =>
                                        props.onAnswerInput(request.requestId, answers)
                                    }
                                    request={request}
                                />
                            ))}
                        </div>
                        <ComposerDock
                            activities={activityProject(session.id, props.activity)}
                            activityNow={props.activity.now}
                            composerCompactHint={
                                session.status === "running" ? "Steer run" : "Send"
                            }
                            composerDisabled={controlsDisabled}
                            composerHint={
                                session.status === "running"
                                    ? "Enter to steer the active run"
                                    : "Enter to send"
                            }
                            composerMentions={[]}
                            composerModelControl={
                                <ComposerModelControl
                                    disabled={session.modelLocked}
                                    effort={session.effort ?? ""}
                                    efforts={[
                                        { id: "", label: "Default" },
                                        ...session.effortOptions.map((option) => ({
                                            id: option.value,
                                            label: option.label,
                                        })),
                                    ]}
                                    model={session.modelId}
                                    models={session.modelOptions.map((option) => ({
                                        id: option.value,
                                        label: option.label,
                                    }))}
                                    onEffortChange={(value) =>
                                        props.onEffortChange(value || undefined)
                                    }
                                    onModelChange={props.onModelChange}
                                />
                            }
                            composerPending={false}
                            composerSendEnabled={Boolean(props.composerValue.trim())}
                            composerValue={props.composerValue}
                            contextItems={[]}
                            onComposerFocusChange={() => undefined}
                            onContextRemove={() => undefined}
                            onFilesSelected={() => undefined}
                            onSend={props.onSend}
                            onValueChange={props.onComposerValueChange}
                            placeholder={
                                session.status === "running"
                                    ? "Steer the running agent…"
                                    : "Ask Rig to work…"
                            }
                        />
                        {props.activeTerminal ? (
                            <TerminalPanel
                                error={props.activeTerminal.error}
                                exitCode={props.activeTerminal.exitCode}
                                grid={props.activeTerminal.grid}
                                height={props.terminalHeight}
                                onClose={props.onTerminalClose}
                                onHeightChange={props.onTerminalHeightChange}
                                onInput={props.onTerminalInput}
                                onReconnect={props.onTerminalReconnect}
                                onResize={props.onTerminalResize}
                                status={props.activeTerminal.status}
                            />
                        ) : null}
                    </>
                )}
            </main>
            {createOpen ? (
                <ModalOverlay onDismiss={() => setCreateOpen(false)}>
                    <Modal
                        footer={
                            <>
                                <Button onClick={() => setCreateOpen(false)} variant="ghost">
                                    Cancel
                                </Button>
                                <Button
                                    disabled={!cwd.startsWith("/")}
                                    onClick={() => {
                                        props.onSessionCreate(cwd);
                                        setCreateOpen(false);
                                        setCwd("");
                                    }}
                                >
                                    Create session
                                </Button>
                            </>
                        }
                        icon="plus"
                        onClose={() => setCreateOpen(false)}
                        size="medium"
                        title="New Rig session"
                    >
                        <div className="happy2-rig-client__create">
                            <TextField
                                autoComplete="off"
                                fullWidth
                                hint="Choose a folder or enter an absolute directory path."
                                label="Working directory"
                                onSubmit={() => {
                                    if (cwd.startsWith("/")) {
                                        props.onSessionCreate(cwd);
                                        setCreateOpen(false);
                                        setCwd("");
                                    }
                                }}
                                onValueChange={setCwd}
                                placeholder="/Users/you/Developer/project"
                                value={cwd}
                            />
                            <Button
                                icon="files"
                                onClick={() =>
                                    void props.onDirectoryPick().then((path) => {
                                        if (path) setCwd(path);
                                    })
                                }
                                variant="secondary"
                            >
                                Choose folder
                            </Button>
                        </div>
                    </Modal>
                </ModalOverlay>
            ) : null}
        </AppShell>
    );
}

function activityProject(
    sessionId: string,
    activity: Pick<AgentActivityStripProps, "now" | "subagents" | "terminals">,
) {
    if (activity.subagents.length === 0 && activity.terminals.length === 0) return [];
    const startedAt = Math.min(
        ...activity.subagents.map((subagent) => subagent.startedAt),
        ...activity.terminals.map((terminal) => terminal.startedAt),
    );
    return [
        {
            chatId: sessionId,
            agentUserId: "rig",
            turnId: `rig:${sessionId}`,
            phase: "thinking" as const,
            tokenCount: activity.subagents.reduce(
                (total, subagent) => total + subagent.totalTokens,
                0,
            ),
            startedAt,
            subagents: activity.subagents.map((subagent) => ({ ...subagent, depth: 0 })),
            backgroundTerminals: activity.terminals,
            expiresAt: activity.now + 60_000,
        },
    ];
}

function sessionMenuItems(props: RigClientShellProps) {
    const serviceTier = props.session?.serviceTier;
    const permissionMode = props.session?.permissionMode;
    return [
        { kind: "item" as const, id: "fork", icon: "branch" as const, label: "Fork session" },
        { kind: "item" as const, id: "reset", label: "Reset session" },
        { kind: "separator" as const },
        { kind: "label" as const, label: "Service tier" },
        {
            kind: "item" as const,
            id: "service:standard",
            icon: serviceTier ? undefined : ("check" as const),
            label: "Standard",
        },
        {
            kind: "item" as const,
            id: "service:fast",
            icon: serviceTier === "fast" ? ("check" as const) : undefined,
            label: "Fast",
        },
        { kind: "label" as const, label: "Permission mode" },
        ...[
            ["auto", "Auto"],
            ["workspace_write", "Workspace write"],
            ["read_only", "Read only"],
            ["full_access", "Full access"],
        ].map(([value, label]) => ({
            kind: "item" as const,
            id: `permission:${value}`,
            icon: permissionMode === value ? ("check" as const) : undefined,
            label: label!,
        })),
        { kind: "separator" as const },
        {
            kind: "item" as const,
            id: "terminal:new",
            icon: "terminal" as const,
            label: "New terminal",
        },
        ...props.terminalIds.map((terminal) => ({
            kind: "item" as const,
            id: `terminal:${terminal.id}`,
            icon: props.activeTerminal?.id === terminal.id ? ("check" as const) : undefined,
            label: terminal.label,
        })),
        ...(props.activeTerminal
            ? [
                  {
                      kind: "item" as const,
                      id: `terminal-stop:${props.activeTerminal.id}`,
                      danger: true,
                      label: "Stop active terminal",
                  },
              ]
            : []),
    ];
}

function sessionMenuSelect(id: string, props: RigClientShellProps): void {
    if (id === "fork") props.onFork();
    else if (id === "reset") props.onReset();
    else if (id === "service:standard") props.onServiceTierChange(undefined);
    else if (id === "service:fast") props.onServiceTierChange("fast");
    else if (id.startsWith("permission:")) props.onPermissionModeChange(id.slice(11));
    else if (id === "terminal:new") props.onTerminalCreate();
    else if (id.startsWith("terminal-stop:")) props.onTerminalStop(id.slice(14));
    else if (id.startsWith("terminal:")) props.onTerminalOpen(id.slice(9));
}

function RigInputRequestCard(props: {
    onAnswer(answers: Readonly<Record<string, readonly string[]>>): void;
    request: RigClientInputRequest;
}) {
    const [answers, setAnswers] = useState<Readonly<Record<string, readonly string[]>>>({});
    const ready = props.request.questions.every(
        (question) => !question.required || (answers[question.id]?.length ?? 0) > 0,
    );
    return (
        <section className="happy2-rig-input" data-happy2-ui="rig-input-request">
            {props.request.questions.map((question) => (
                <div className="happy2-rig-input__question" key={question.id}>
                    <div className="happy2-rig-input__heading">
                        <strong>{question.header}</strong>
                        <span>{question.question}</span>
                    </div>
                    <div className="happy2-rig-input__options">
                        {question.options.map((option) => {
                            const selected = answers[question.id]?.includes(option.label) ?? false;
                            return (
                                <button
                                    aria-pressed={selected}
                                    key={option.label}
                                    onClick={() =>
                                        setAnswers((current) => {
                                            const values = current[question.id] ?? [];
                                            const next = question.multiSelect
                                                ? selected
                                                    ? values.filter(
                                                          (value) => value !== option.label,
                                                      )
                                                    : [...values, option.label]
                                                : [option.label];
                                            return { ...current, [question.id]: next };
                                        })
                                    }
                                    type="button"
                                >
                                    <span>{option.label}</span>
                                    <small>{option.description}</small>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
            <Button
                disabled={!ready}
                onClick={() => props.onAnswer(answers)}
                size="small"
                variant="secondary"
            >
                Answer
            </Button>
        </section>
    );
}
