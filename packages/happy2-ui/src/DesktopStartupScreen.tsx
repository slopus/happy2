import { type FormEvent } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { OnboardingScreen } from "./OnboardingScreen";
import { SetupOptionCard } from "./SetupOptionCard";
import { TextField } from "./TextField";
import { WindowDragRegion } from "./TitleBar";
import { onboardingBackgroundUrl } from "./assets";

export type DesktopStartupMode = "local" | "cloud";
export type DesktopStartupPhase = "choosing" | "starting" | "error";

export interface DesktopStartupValues {
    mode: DesktopStartupMode;
    cloudUrl: string;
}

export interface DesktopStartupUpdate {
    availableVersion?: string;
    message?: string;
    status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";
}

export interface DesktopStartupScreenProps {
    error?: string;
    message?: string;
    onChange(values: DesktopStartupValues): void;
    onChangeMode?(): void;
    onInstallUpdate?(): void;
    onRetry?(): void;
    onSubmit(): void;
    phase: DesktopStartupPhase;
    update?: DesktopStartupUpdate;
    values: DesktopStartupValues;
}

function updateBanner(props: DesktopStartupScreenProps) {
    const update = props.update;
    if (!update || update.status === "idle") return null;
    const copy =
        update.message ??
        (update.status === "checking"
            ? "Checking for updates…"
            : update.status === "available"
              ? `Happy ${update.availableVersion ?? "update"} is available.`
              : update.status === "downloading"
                ? `Downloading Happy ${update.availableVersion ?? "update"}…`
                : update.status === "downloaded"
                  ? `Happy ${update.availableVersion ?? "update"} is ready to install.`
                  : "Happy could not check for updates.");
    return (
        <Banner
            action={
                update.status === "downloaded" && props.onInstallUpdate
                    ? { label: "Install and restart", onClick: props.onInstallUpdate }
                    : undefined
            }
            icon={update.status === "error" ? "shield" : "arrow-up"}
            tone={update.status === "error" ? "warning" : "info"}
        >
            {copy}
        </Banner>
    );
}

/**
 * C-145 DesktopStartupScreen — the first-run desktop topology chooser.
 * It keeps all form state in its owner and offers exactly two durable
 * topologies as explicit cards: run Happy locally on this machine, or connect
 * this machine to an existing cloud instance over HTTPS. The cloud card is the
 * only mode with a field (the HTTPS origin); local mode has none.
 */
export function DesktopStartupScreen(props: DesktopStartupScreenProps) {
    const values = () => props.values;
    const change = (patch: Partial<DesktopStartupValues>) =>
        props.onChange({ ...values(), ...patch });
    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        props.onSubmit();
    };
    const submitLabel = () => (values().mode === "local" ? "Start locally" : "Connect to cloud");

    return (
        <>
            <WindowDragRegion />
            <OnboardingScreen
                backgroundUrl={onboardingBackgroundUrl}
                bodyKey={props.phase}
                brand={{ name: "Happy (2)" }}
                copy={
                    props.phase === "choosing"
                        ? "Choose where Happy runs for this machine. Happy remembers the choice and starts it automatically on future launches."
                        : props.phase === "error"
                          ? "Happy stopped before your workspace was ready."
                          : undefined
                }
                data-testid="desktop-startup-screen"
                kicker={
                    props.phase === "choosing"
                        ? "Desktop connection"
                        : props.phase === "error"
                          ? "Startup interrupted"
                          : "Preparing your workspace"
                }
                loadingLabel={props.message ?? "Starting Happy…"}
                state={props.phase === "starting" ? "loading" : "form"}
                title={
                    props.phase === "choosing"
                        ? "Where should Happy run?"
                        : props.phase === "error"
                          ? "Happy couldn't start."
                          : "Bringing Happy online."
                }
                width="large"
            >
                {props.phase === "error" ? (
                    <div
                        className="happy2-desktop-startup__error"
                        data-happy2-ui="desktop-startup-error"
                    >
                        <Banner icon="shield" title="Startup failed" tone="danger">
                            {props.error ?? "Happy could not start."}
                        </Banner>
                        <div
                            className="happy2-desktop-startup__actions"
                            data-happy2-ui="desktop-startup-actions"
                        >
                            {props.onChangeMode ? (
                                <Button
                                    onClick={props.onChangeMode}
                                    type="button"
                                    variant="secondary"
                                >
                                    Change mode
                                </Button>
                            ) : null}
                            {props.onRetry ? (
                                <Button onClick={props.onRetry} type="button">
                                    Try again
                                </Button>
                            ) : null}
                        </div>
                        {updateBanner(props)}
                    </div>
                ) : props.phase === "choosing" ? (
                    <form
                        className="happy2-desktop-startup"
                        data-happy2-ui="desktop-startup-form"
                        onSubmit={submit}
                    >
                        {updateBanner(props)}
                        <fieldset
                            className="happy2-desktop-startup__group"
                            data-happy2-ui="desktop-startup-group"
                        >
                            <legend className="happy2-desktop-startup__legend">Run mode</legend>
                            <div className="happy2-desktop-startup__options">
                                <SetupOptionCard
                                    description="Private Happy server, sessions, and terminals on this machine."
                                    icon="terminal"
                                    onSelect={() => change({ mode: "local" })}
                                    selected={values().mode === "local"}
                                    title="Local on this machine"
                                />
                                <SetupOptionCard
                                    description="Connect this machine to an existing cloud Happy instance over HTTPS."
                                    icon="link"
                                    onSelect={() => change({ mode: "cloud" })}
                                    selected={values().mode === "cloud"}
                                    title="Connect to cloud"
                                />
                            </div>
                        </fieldset>

                        {values().mode === "cloud" ? (
                            <TextField
                                autoComplete="url"
                                fullWidth
                                hint="HTTPS origin only, for example https://happy.example.com"
                                label="Cloud Happy endpoint"
                                leadingIcon="link"
                                onValueChange={(cloudUrl) => change({ cloudUrl })}
                                placeholder="https://happy.example.com"
                                required
                                type="text"
                                value={values().cloudUrl}
                            />
                        ) : null}

                        <Button fullWidth size="large" type="submit">
                            {submitLabel()}
                        </Button>
                    </form>
                ) : null}
            </OnboardingScreen>
        </>
    );
}
