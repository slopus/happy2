import {
    Banner,
    BuildProgressPanel,
    Button,
    OnboardingScreen,
    SetupOptionCard,
    StoreSurface,
    TextField,
    WindowDragRegion,
    onboardingBackgroundUrl,
    type OnboardingStep,
} from "happy2-ui";
import type {
    HappyState,
    SandboxProviderStatus,
    SetupBaseImageSummary,
    SetupSnapshot,
    SetupStore,
} from "happy2-state";
import {
    For,
    Show,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
    type Accessor,
    type JSX,
} from "solid-js";
import type { DesktopNavigation, DesktopOnboardingStep } from "../navigation/desktopRouteTypes";
import { desktopNavigationSignal } from "../navigation/desktopNavigationSignal";
import { onboardingStepForStatus } from "../onboarding/onboardingRoute";

export type ServerOnboardingProps = {
    state: HappyState;
    navigation: DesktopNavigation;
    showWindowDragRegion?: boolean;
    /** Invoked once server setup is complete and the main application may take over. */
    onComplete: () => void;
};

/** Poll cadence for the live build surface as a stopgap alongside SSE reconciliation. */
const BUILD_POLL_MS = 2500;

/** Re-probe cadence for sandbox provider health while the sandbox screen is open. */
const PROVIDER_POLL_MS = 4000;

const SERVER_STAGES: { step: DesktopOnboardingStep; label: string }[] = [
    { step: "sandbox-provider", label: "Sandbox" },
    { step: "base-image", label: "Base image" },
    { step: "build-progress", label: "Build" },
    { step: "completion", label: "Registration" },
];

/**
 * The centered, server-driven onboarding surface shown after the bootstrap
 * profile exists and before the main application. It owns one subscription to the
 * durable setup store, reflects the authoritative next step into the
 * `/onboarding/<step>` URL (so reload and manual navigation both resume the exact
 * durable step), and blocks the app until server setup completes.
 */
export function ServerOnboarding(props: ServerOnboardingProps) {
    const setup = props.state.setup();
    return (
        <>
            <Show when={props.showWindowDragRegion}>
                <WindowDragRegion />
            </Show>
            <StoreSurface store={setup}>
                {(snapshot) => (
                    <ServerOnboardingBody
                        navigation={props.navigation}
                        onComplete={props.onComplete}
                        snapshot={snapshot}
                        state={props.state}
                        store={setup}
                    />
                )}
            </StoreSurface>
        </>
    );
}

function ServerOnboardingBody(props: {
    navigation: DesktopNavigation;
    onComplete: () => void;
    snapshot: Accessor<SetupSnapshot>;
    state: HappyState;
    store: SetupStore;
}) {
    const route = desktopNavigationSignal(props.navigation);
    const status = () => props.snapshot().status;
    const resolution = createMemo(() => {
        const current = status();
        return current.type === "ready" ? onboardingStepForStatus(current.value) : undefined;
    });
    const canonicalStep = (): DesktopOnboardingStep | undefined => {
        const value = resolution();
        return value?.kind === "step" ? value.step : undefined;
    };
    const urlStep = (): DesktopOnboardingStep | undefined => {
        const primary = route().primary;
        return primary.kind === "onboarding" ? primary.step : undefined;
    };

    // Hand off to the main application the moment server setup is durably
    // complete, moving the URL off the onboarding path so the workspace opens on
    // a real destination instead of a stale setup route.
    createEffect(() => {
        if (resolution()?.kind !== "app") return;
        if (urlStep() !== undefined)
            props.navigation.navigate(
                { ...route(), primary: { kind: "home" }, panel: undefined, overlay: undefined },
                { replace: true },
            );
        props.onComplete();
    });

    // Reflect the durable step into the URL. A manually entered later route or a
    // stale reload URL is replaced with the first incomplete prerequisite.
    createEffect(() => {
        const canonical = canonicalStep();
        if (!canonical || urlStep() === canonical) return;
        props.navigation.navigate(
            {
                ...route(),
                primary: { kind: "onboarding", step: canonical },
                panel: undefined,
                overlay: undefined,
            },
            { replace: true },
        );
    });

    // Load the data each step needs on entry, once, without a manual refresh.
    createEffect(() => {
        const step = canonicalStep();
        const snapshot = props.snapshot();
        if (step === "sandbox-provider" && snapshot.providers.type === "unloaded")
            props.state.setupProvidersReload();
        if (
            (step === "base-image" || step === "build-progress") &&
            snapshot.baseImages.type === "unloaded"
        )
            props.state.setupBaseImagesReload();
    });

    // Live build progress: SSE reconciles the surface, and a bounded poll while a
    // build is actually running covers long, quiet layers. It stops the moment the
    // build leaves the running state or the surface unmounts.
    createEffect(() => {
        const building =
            canonicalStep() === "build-progress" &&
            selectedImageStatus(props.snapshot()) === "building";
        if (!building) return;
        const timer = setInterval(() => {
            props.state.setupBaseImagesReload();
            props.state.setupStatusReload();
        }, BUILD_POLL_MS);
        onCleanup(() => clearInterval(timer));
    });

    // Provider health is a fresh probe, so re-probe on a bounded poll while the
    // sandbox screen is visible. A user who follows the remediation and starts the
    // engine then sees the card clear without a manual refresh. The poll stops the
    // moment the step changes or the surface unmounts; SSE remains the durable
    // reconciliation path for every other setup change.
    createEffect(() => {
        if (canonicalStep() !== "sandbox-provider") return;
        const timer = setInterval(() => props.state.setupProvidersReload(), PROVIDER_POLL_MS);
        onCleanup(() => clearInterval(timer));
    });

    // The selected sandbox, explained on every later administrator step so the
    // choice stays visible after selection and across reload-resume. It is read
    // from the authoritative validated-step metadata (surviving reload with no
    // discovery loaded) and falls back to already-loaded discovery.
    const providerNote = createMemo(() => {
        const step = canonicalStep();
        if (step !== "base-image" && step !== "build-progress" && step !== "completion")
            return undefined;
        const provider = selectedProvider(props.snapshot());
        if (!provider) return undefined;
        return provider.version
            ? `Agent code runs inside the ${provider.name} sandbox (version ${provider.version}).`
            : `Agent code runs inside the ${provider.name} sandbox.`;
    });

    const steps = createMemo<OnboardingStep[]>(() => {
        const current = canonicalStep();
        const currentIndex = SERVER_STAGES.findIndex((stage) => stage.step === current);
        return SERVER_STAGES.map((stage, index) => ({
            label: stage.label,
            state:
                currentIndex < 0
                    ? "upcoming"
                    : index < currentIndex
                      ? "complete"
                      : index === currentIndex
                        ? "current"
                        : "upcoming",
        }));
    });

    const headline = (): { kicker: string; title: string; copy?: string } => {
        switch (canonicalStep()) {
            case "sandbox-provider":
                return {
                    kicker: "Server setup",
                    title: "Choose a sandbox",
                    copy: "Agent code runs inside the selected sandbox provider, isolated from the Happy server process.",
                };
            case "base-image":
                return {
                    kicker: "Server setup",
                    title: "Pick a base image",
                    copy: "The base image is downloaded and built once, then becomes the default sandbox for every agent.",
                };
            case "build-progress":
                return {
                    kicker: "Server setup",
                    title: "Building your image",
                    copy: "This runs on the server and continues if you reload. You can retry a failed build here.",
                };
            case "completion":
                return {
                    kicker: "Final step",
                    title: "Open registration?",
                    copy: "Decide whether other people can create an account now. You can change this later in Admin.",
                };
            case "waiting":
                return {
                    kicker: "Almost ready",
                    title: "Setup in progress",
                    copy: "An administrator is finishing server setup. This screen advances automatically when it completes.",
                };
            default:
                return { kicker: "Server setup", title: "Preparing setup" };
        }
    };

    const loadingState = () => status().type !== "ready" || canonicalStep() === undefined;

    return (
        <OnboardingScreen
            backgroundUrl={onboardingBackgroundUrl}
            brand={{ name: "Happy (2)" }}
            copy={headline().copy}
            data-testid="server-onboarding"
            kicker={headline().kicker}
            loadingLabel="Loading server setup…"
            state={loadingState() ? "loading" : "form"}
            steps={canonicalStep() === "waiting" ? undefined : steps()}
            title={headline().title}
            width={canonicalStep() === "build-progress" ? "large" : "medium"}
        >
            <Show when={status().type === "error"}>
                <Banner tone="danger" title="Could not load setup">
                    {errorMessage(props.snapshot(), "status")}
                    <Button
                        onClick={() => props.state.setupStatusReload()}
                        size="small"
                        variant="secondary"
                    >
                        Try again
                    </Button>
                </Banner>
            </Show>
            <Show when={providerNote()}>
                {(note) => (
                    <Banner data-testid="provider-note" icon="shield" tone="info">
                        {note()}
                    </Banner>
                )}
            </Show>
            <Switchboard
                snapshot={props.snapshot}
                state={props.state}
                step={canonicalStep()}
                store={props.store}
            />
        </OnboardingScreen>
    );
}

function Switchboard(props: {
    snapshot: Accessor<SetupSnapshot>;
    state: HappyState;
    step: DesktopOnboardingStep | undefined;
    store: SetupStore;
}): JSX.Element {
    return (
        <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
            <Show when={props.step === "sandbox-provider"}>
                <SandboxProviderStep snapshot={props.snapshot} store={props.store} />
            </Show>
            <Show when={props.step === "base-image"}>
                <BaseImageStep snapshot={props.snapshot} store={props.store} />
            </Show>
            <Show when={props.step === "build-progress"}>
                <BuildStep snapshot={props.snapshot} store={props.store} />
            </Show>
            <Show when={props.step === "completion"}>
                <RegistrationStep snapshot={props.snapshot} store={props.store} />
            </Show>
            <Show when={props.step === "waiting"}>
                <Banner tone="info" title="Waiting for the administrator">
                    You will enter the workspace automatically once server setup is complete.
                </Banner>
            </Show>
        </div>
    );
}

function SandboxProviderStep(props: { snapshot: Accessor<SetupSnapshot>; store: SetupStore }) {
    const providers = () => props.snapshot().providers;
    return (
        <>
            <Show when={actionErrorFor(props.snapshot(), "sandboxProvider")}>
                {(message) => (
                    <Banner tone="danger" title="Provider unavailable">
                        {message()}
                    </Banner>
                )}
            </Show>
            <Show when={providers().type === "ready" && providers()} keyed>
                {(loaded) => {
                    const discovery = loaded.type === "ready" ? loaded.value : undefined;
                    return (
                        <For each={discovery?.providers ?? []}>
                            {(provider: SandboxProviderStatus) => (
                                <SetupOptionCard
                                    description={provider.detail}
                                    disabled={provider.health !== "healthy"}
                                    hint={provider.remediation}
                                    hintTone="warning"
                                    icon="terminal"
                                    meta={
                                        provider.version ? `Version ${provider.version}` : undefined
                                    }
                                    onSelect={() => props.store.sandboxProviderSelect(provider.id)}
                                    pending={
                                        props.snapshot().pending.selectingProviderId === provider.id
                                    }
                                    recommended={discovery?.recommendedProviderId === provider.id}
                                    selected={discovery?.selectedProviderId === provider.id}
                                    status={healthStatus(provider.health)}
                                    title={provider.displayName}
                                />
                            )}
                        </For>
                    );
                }}
            </Show>
        </>
    );
}

function BaseImageStep(props: { snapshot: Accessor<SetupSnapshot>; store: SetupStore }) {
    const baseImages = () => props.snapshot().baseImages;
    // The custom-image draft lives in stable local signals owned by this step, so
    // it survives every background base-image reload (which replaces the loadable
    // reference and remounts the keyed built-in list) and every transient submit
    // failure. It is never derived from the changing snapshot.
    const [showCustom, setShowCustom] = createSignal(false);
    const [customName, setCustomName] = createSignal("");
    const [customDockerfile, setCustomDockerfile] = createSignal("");
    const [attempted, setAttempted] = createSignal(false);
    const pending = () => props.snapshot().pending.selectingImage;
    const nameError = () =>
        attempted() && !customName().trim() ? "Enter an image name." : undefined;
    const dockerfileError = () =>
        attempted() && !customDockerfile().trim() ? "Enter the Dockerfile contents." : undefined;
    const submitCustom = () => {
        setAttempted(true);
        if (!customName().trim() || !customDockerfile().trim()) return;
        props.store.baseImageSelect({
            custom: { name: customName().trim(), dockerfile: customDockerfile() },
        });
    };
    return (
        <>
            <Show when={actionErrorFor(props.snapshot(), "baseImageSelect")}>
                {(message) => (
                    <Banner tone="danger" title="Could not start the build">
                        {message()}
                    </Banner>
                )}
            </Show>
            <Show when={baseImages().type === "ready" && baseImages()} keyed>
                {(loaded) => {
                    const view = loaded.type === "ready" ? loaded.value : undefined;
                    return (
                        <For each={view?.images ?? []}>
                            {(image: SetupBaseImageSummary) => (
                                <SetupOptionCard
                                    description={
                                        image.builtinKey
                                            ? builtinDescription(image.builtinKey)
                                            : undefined
                                    }
                                    icon="image"
                                    meta={image.buildLabel}
                                    onSelect={() =>
                                        image.builtinKey
                                            ? props.store.baseImageSelect({
                                                  builtinKey: image.builtinKey,
                                              })
                                            : undefined
                                    }
                                    pending={pending()}
                                    selected={view?.selectedImageId === image.id}
                                    title={image.name}
                                />
                            )}
                        </For>
                    );
                }}
            </Show>
            <SetupOptionCard
                data-testid="custom-image-option"
                description="Build a sandbox from your own Dockerfile."
                icon="code"
                meta="Build"
                onSelect={() => setShowCustom((open) => !open)}
                selected={showCustom()}
                title="Custom Dockerfile"
            />
            <Show when={showCustom()}>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        submitCustom();
                    }}
                    style={{ display: "flex", "flex-direction": "column", gap: "12px" }}
                >
                    <TextField
                        disabled={pending()}
                        error={nameError()}
                        fullWidth
                        label="Image name"
                        name="custom-image-name"
                        onValueChange={setCustomName}
                        required
                        value={customName()}
                    />
                    <TextField
                        disabled={pending()}
                        error={dockerfileError()}
                        fullWidth
                        label="Dockerfile"
                        multiline
                        name="custom-image-dockerfile"
                        onValueChange={setCustomDockerfile}
                        required
                        rows={6}
                        value={customDockerfile()}
                    />
                    <Button disabled={pending()} fullWidth type="submit">
                        {pending() ? "Starting build…" : "Build custom image"}
                    </Button>
                </form>
            </Show>
        </>
    );
}

function BuildStep(props: { snapshot: Accessor<SetupSnapshot>; store: SetupStore }) {
    const image = () => {
        const view = props.snapshot().baseImages;
        return view.type === "ready" ? view.value.selectedImage : undefined;
    };
    return (
        <Show
            when={image()}
            fallback={
                <Banner tone="info" title="Preparing the build">
                    Fetching the selected image status.
                </Banner>
            }
        >
            {(selected) => (
                <>
                    <Show when={actionErrorFor(props.snapshot(), "baseImageRetry")}>
                        {(message) => (
                            <Banner tone="danger" title="Retry failed">
                                {message()}
                            </Banner>
                        )}
                    </Show>
                    <BuildProgressPanel
                        currentLogLine={selected().lastBuildLogLine}
                        error={selected().lastError}
                        log={selected().buildLog}
                        logTruncated={selected().buildLogTruncated}
                        onRetry={() => props.store.baseImageBuildRetry()}
                        progress={selected().buildProgress}
                        retrying={props.snapshot().pending.retryingBuild}
                        status={selected().status}
                        statusLabel={buildStatusLabel(
                            selected().status,
                            selected().lastBuildLogLine,
                        )}
                        title={selected().name}
                    />
                </>
            )}
        </Show>
    );
}

function RegistrationStep(props: { snapshot: Accessor<SetupSnapshot>; store: SetupStore }) {
    const choosing = () => props.snapshot().pending.choosingPolicy;
    return (
        <>
            <Show when={actionErrorFor(props.snapshot(), "policy")}>
                {(message) => (
                    <Banner tone="danger" title="Could not finish setup">
                        {message()}
                    </Banner>
                )}
            </Show>
            <SetupOptionCard
                description="Anyone who reaches the server can create an account."
                icon="users"
                onSelect={() => props.store.registrationPolicyChoose(true)}
                pending={choosing() === true}
                title="Open registration"
            />
            <SetupOptionCard
                description="Only you can sign in until you open registration later."
                icon="shield"
                onSelect={() => props.store.registrationPolicyChoose(false)}
                pending={choosing() === false}
                title="Keep registration closed"
            />
        </>
    );
}

function selectedImageStatus(snapshot: SetupSnapshot): string | undefined {
    const view = snapshot.baseImages;
    return view.type === "ready" ? view.value.selectedImage?.status : undefined;
}

/**
 * The durably selected sandbox provider. The validated step's metadata is the
 * authoritative source (`providerId`/`version`, surviving reload with no
 * discovery loaded); an already-loaded discovery supplies the friendlier display
 * name and fills in when only the earlier selected step is recorded.
 */
function selectedProvider(snapshot: SetupSnapshot): { name: string; version?: string } | undefined {
    let providerId: string | undefined;
    let version: string | undefined;
    if (snapshot.status.type === "ready") {
        const steps = snapshot.status.value.server.steps;
        const meta =
            steps.sandbox_provider_validated?.metadata ?? steps.sandbox_provider_selected?.metadata;
        if (typeof meta?.providerId === "string") providerId = meta.providerId;
        if (typeof meta?.version === "string") version = meta.version;
    }
    const discovery = snapshot.providers.type === "ready" ? snapshot.providers.value : undefined;
    const resolvedId = providerId ?? discovery?.selectedProviderId;
    if (!resolvedId) return undefined;
    const known = discovery?.providers.find((provider) => provider.id === resolvedId);
    return {
        name: known?.displayName ?? capitalize(resolvedId),
        version: version ?? known?.version,
    };
}

function capitalize(value: string): string {
    return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function healthStatus(health: SandboxProviderStatus["health"]) {
    switch (health) {
        case "healthy":
            return { label: "HEALTHY", variant: "success" as const, icon: "check-circle" as const };
        case "unhealthy":
            return { label: "UNHEALTHY", variant: "warning" as const };
        case "unavailable":
            return { label: "UNAVAILABLE", variant: "danger" as const };
        case "timed_out":
            return { label: "TIMED OUT", variant: "danger" as const };
    }
}

function builtinDescription(key: "daycare-full" | "daycare-minimal"): string {
    return key === "daycare-minimal"
        ? "A lean sandbox with the core agent toolchain."
        : "A complete sandbox with the full Daycare toolchain.";
}

function buildStatusLabel(status: string, logLine?: string): string {
    switch (status) {
        case "pending":
            return "Queued to build";
        case "building":
            return logLine ?? "Building the image";
        case "ready":
            return "Build complete";
        case "failed":
            return "Build failed";
        default:
            return "Building the image";
    }
}

function actionErrorFor(
    snapshot: SetupSnapshot,
    action: SetupSnapshot["actionErrorFor"],
): string | undefined {
    return snapshot.actionErrorFor === action ? snapshot.actionError?.message : undefined;
}

function errorMessage(snapshot: SetupSnapshot, resource: "status"): string {
    const loadable = snapshot[resource];
    return loadable.type === "error" ? loadable.error.message : "Something went wrong.";
}
