import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { OnboardingScreen } from "./OnboardingScreen";
import { WindowDragRegion } from "./TitleBar";
import { onboardingBackgroundUrl } from "./assets";

export interface RigInstallScreenProps {
    command: string;
    error?: string;
    exitCode?: number;
    onChangeMode(): void;
    onConfirm(): void;
    onInput(data: string): void;
    onResize(cols: number, rows: number): void;
    onRetry(): void;
    output: string;
    status: "loading" | "awaitingConfirmation" | "running" | "exited";
    verified?: boolean;
}

/**
 * Confirmed fixed-command installer for the system Rig CLI. The component
 * renders no shell choice or editable command; callers supply only PTY events.
 */
export function RigInstallScreen(props: RigInstallScreenProps) {
    const terminal = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        if (props.status !== "running") return;
        const element = terminal.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            props.onResize(
                Math.max(2, Math.floor((entry.contentRect.width - 24) / 8.4)),
                Math.max(1, Math.floor((entry.contentRect.height - 24) / 18)),
            );
        });
        observer.observe(element);
        input.current?.focus({ preventScroll: true });
        return () => observer.disconnect();
    }, [props.status]);
    const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        const sequences: Partial<Record<string, string>> = {
            Enter: "\r",
            Backspace: "\x7f",
            Tab: "\t",
            ArrowUp: "\x1b[A",
            ArrowDown: "\x1b[B",
            ArrowRight: "\x1b[C",
            ArrowLeft: "\x1b[D",
            Escape: "\x1b",
        };
        const sequence = sequences[event.key];
        if (sequence) {
            event.preventDefault();
            props.onInput(sequence);
        } else if (event.ctrlKey && event.key.length === 1) {
            event.preventDefault();
            props.onInput(String.fromCharCode(event.key.toUpperCase().charCodeAt(0) - 64));
        }
    };
    const title =
        props.status === "awaitingConfirmation"
            ? "Install Rig"
            : props.status === "running"
              ? "Installing Rig"
              : props.status === "exited" && props.verified
                ? "Rig is ready"
                : "Rig installation";
    return (
        <>
            <WindowDragRegion />
            <OnboardingScreen
                backgroundUrl={onboardingBackgroundUrl}
                bodyKey={props.status}
                brand={{ name: "Happy (2)" }}
                copy="Happy connects to the normal Rig daemon on this Mac. Review the exact command before it runs."
                data-testid="rig-install-screen"
                kicker="Local agent runtime"
                title={title}
            >
                <div className="happy2-rig-install" data-happy2-ui="rig-install">
                    {props.error ? <Banner tone="danger">{props.error}</Banner> : null}
                    {props.status === "awaitingConfirmation" ? (
                        <>
                            <div
                                className="happy2-rig-install__command"
                                data-happy2-ui="rig-install-command"
                            >
                                <span>Command</span>
                                <code>{props.command}</code>
                            </div>
                            <p className="happy2-rig-install__copy">
                                This installs the published Rig CLI globally with npm. Happy never
                                writes this command until you confirm.
                            </p>
                        </>
                    ) : null}
                    {props.status === "running" || props.output ? (
                        <div
                            className="happy2-rig-install__terminal"
                            data-happy2-ui="rig-install-terminal"
                            onClick={
                                props.status === "running"
                                    ? () => input.current?.focus({ preventScroll: true })
                                    : undefined
                            }
                            ref={terminal}
                        >
                            <pre data-happy2-ui="rig-install-output">
                                {terminalOutput(props.output) ||
                                    (props.status === "running" ? "Starting npm…" : "")}
                            </pre>
                            {props.status === "running" ? (
                                <textarea
                                    aria-label="Installation terminal input"
                                    className="happy2-rig-install__input"
                                    onBlur={(event) => {
                                        event.currentTarget.value = "";
                                    }}
                                    onInput={(event) => {
                                        if (event.currentTarget.value)
                                            props.onInput(event.currentTarget.value);
                                        event.currentTarget.value = "";
                                    }}
                                    onKeyDown={keyDown}
                                    ref={input}
                                />
                            ) : null}
                        </div>
                    ) : null}
                    {props.status === "exited" ? (
                        <Banner tone={props.verified ? "success" : "warning"}>
                            {props.verified
                                ? "Rig was installed and its daemon connection was verified."
                                : `Installation exited with status ${props.exitCode ?? "unknown"}.`}
                        </Banner>
                    ) : null}
                    <div
                        className="happy2-rig-install__actions"
                        data-happy2-ui="rig-install-actions"
                    >
                        <Button onClick={props.onChangeMode} variant="ghost">
                            Change connection
                        </Button>
                        {props.status === "awaitingConfirmation" ? (
                            <Button onClick={props.onConfirm}>Install Rig</Button>
                        ) : props.status === "exited" && !props.verified ? (
                            <Button onClick={props.onRetry}>Try again</Button>
                        ) : null}
                    </div>
                </div>
            </OnboardingScreen>
        </>
    );
}

function terminalOutput(value: string): string {
    const escape = String.fromCharCode(27);
    return value
        .replace(new RegExp(`${escape}\\[[0-?]*[ -/]*[@-~]`, "gu"), "")
        .replace(new RegExp(`${escape}\\][^\\u0007]*(?:\\u0007|${escape}\\\\)`, "gu"), "");
}
