import { useLayoutEffect, useReducer, type ReactNode } from "react";
import {
    Banner,
    BuildProgressPanel,
    Button,
    DefaultAgentModal,
    OnboardingScreen,
    SetupOptionCard,
    StoreSurface,
    TextField,
    WindowDragRegion,
    onboardingBackgroundUrl,
    type OnboardingStep,
} from "happy2-ui";
import {
    DEFAULT_AGENT_PROPOSED,
    defaultAgentNameError,
    defaultAgentUsernameError,
    pickDefaultAgentIdentity,
} from "../onboarding/defaultAgentIdentity";
import type {
    HappyState,
    SandboxProviderStatus,
    SetupBaseImageSummary,
    SetupSnapshot,
    SetupStore,
} from "happy2-state";
import type { DesktopNavigation, DesktopOnboardingStep } from "../navigation/desktopRouteTypes";
import { useDesktopNavigation } from "../navigation/useDesktopNavigation";
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
const SERVER_STAGES: {
    step: DesktopOnboardingStep;
    label: string;
}[] = [
    { step: "sandbox-provider", label: "Sandbox" },
    { step: "base-image", label: "Base image" },
    { step: "build-progress", label: "Build" },
    { step: "default-agent", label: "Agent" },
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
            {props.showWindowDragRegion ? <WindowDragRegion /> : null}
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
    snapshot: SetupSnapshot;
    state: HappyState;
    store: SetupStore;
}) {
    const { navigation, onComplete, snapshot, state } = props;
    const route = useDesktopNavigation(navigation);
    const status = snapshot.status;
    const resolution = status.type === "ready" ? onboardingStepForStatus(status.value) : undefined;
    const canonicalStep: DesktopOnboardingStep | undefined =
        resolution?.kind === "step" ? resolution.step : undefined;
    const urlStep: DesktopOnboardingStep | undefined =
        route.primary.kind === "onboarding" ? route.primary.step : undefined;
    // Hand off to the main application the moment server setup is durably
    // complete, moving the URL off the onboarding path so the workspace opens on
    // a real destination instead of a stale setup route.
    useLayoutEffect(() => {
        if (resolution?.kind !== "app") return;
        if (urlStep !== undefined)
            navigation.navigate(
                { ...route, primary: { kind: "home" }, panel: undefined, overlay: undefined },
                { replace: true },
            );
        onComplete();
    }, [resolution?.kind, urlStep, route, navigation, onComplete]);
    // Reflect the durable step into the URL. A manually entered later route or a
    // stale reload URL is replaced with the first incomplete prerequisite.
    useLayoutEffect(() => {
        if (!canonicalStep || urlStep === canonicalStep) return;
        navigation.navigate(
            {
                ...route,
                primary: { kind: "onboarding", step: canonicalStep },
                panel: undefined,
                overlay: undefined,
            },
            { replace: true },
        );
    }, [canonicalStep, urlStep, route, navigation]);
    // Load the data each step needs on entry, once, without a manual refresh.
    useLayoutEffect(() => {
        if (canonicalStep === "sandbox-provider" && snapshot.providers.type === "unloaded")
            state.setupProvidersReload();
        if (
            (canonicalStep === "base-image" || canonicalStep === "build-progress") &&
            snapshot.baseImages.type === "unloaded"
        )
            state.setupBaseImagesReload();
    }, [canonicalStep, snapshot.providers.type, snapshot.baseImages.type, state]);
    // Live build progress: SSE reconciles the surface, and a bounded poll while a
    // build is actually running covers long, quiet layers. It stops the moment the
    // build leaves the running state or the surface unmounts.
    useLayoutEffect(() => {
        const building =
            canonicalStep === "build-progress" &&
            selectedImageStatus(props.snapshot) === "building";
        if (!building) return;
        const timer = setInterval(() => {
            props.state.setupBaseImagesReload();
            props.state.setupStatusReload();
        }, BUILD_POLL_MS);
        return () => clearInterval(timer);
    }, [canonicalStep, props.snapshot, props.state]);
    // Provider health is a fresh probe, so re-probe on a bounded poll while the
    // sandbox screen is visible. A user who follows the remediation and starts the
    // engine then sees the card clear without a manual refresh. The poll stops the
    // moment the step changes or the surface unmounts; SSE remains the durable
    // reconciliation path for every other setup change.
    useLayoutEffect(() => {
        if (canonicalStep !== "sandbox-provider") return;
        const timer = setInterval(() => props.state.setupProvidersReload(), PROVIDER_POLL_MS);
        return () => clearInterval(timer);
    }, [canonicalStep, props.state]);
    // The selected sandbox is explained on later non-modal administrator steps.
    // The modal-hosted default-agent step receives the same durable context in
    // its own description below, so the scrim cannot hide it on reload-resume.
    const providerNote = (() => {
        if (
            canonicalStep !== "base-image" &&
            canonicalStep !== "build-progress" &&
            canonicalStep !== "completion"
        )
            return undefined;
        const provider = selectedProvider(props.snapshot);
        if (!provider) return undefined;
        return provider.version
            ? `Agent code runs inside the ${provider.name} sandbox (version ${provider.version}).`
            : `Agent code runs inside the ${provider.name} sandbox.`;
    })();
    const steps: OnboardingStep[] = (() => {
        const currentIndex = SERVER_STAGES.findIndex((stage) => stage.step === canonicalStep);
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
    })();
    const headline = (): {
        kicker: string;
        title: string;
        copy?: string;
    } => {
        switch (canonicalStep) {
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
            case "default-agent":
                return {
                    kicker: "Server setup",
                    title: "Name your agent",
                    copy: "Create the built-in agent that runs your workspace before you finish setup.",
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
    const loadingState = status.type !== "ready" || canonicalStep === undefined;
    return (
        <OnboardingScreen
            backgroundUrl={onboardingBackgroundUrl}
            brand={{ name: "Happy (2)" }}
            copy={headline().copy}
            data-testid="server-onboarding"
            kicker={headline().kicker}
            loadingLabel="Loading server setup…"
            state={loadingState ? "loading" : "form"}
            steps={canonicalStep === "waiting" ? undefined : steps}
            title={headline().title}
            width={canonicalStep === "build-progress" ? "large" : "medium"}
        >
            {status.type === "error" ? (
                <Banner tone="danger" title="Could not load setup">
                    {errorMessage(props.snapshot, "status")}
                    <Button
                        onClick={() => props.state.setupStatusReload()}
                        size="small"
                        variant="secondary"
                    >
                        Try again
                    </Button>
                </Banner>
            ) : null}
            {providerNote
                ? ((note) => (
                      <Banner data-testid="provider-note" icon="shield" tone="info">
                          {note}
                      </Banner>
                  ))(providerNote)
                : null}
            <Switchboard
                snapshot={props.snapshot}
                state={props.state}
                step={canonicalStep}
                store={props.store}
            />
        </OnboardingScreen>
    );
}
// The active step's banners and option cards flatten into the OnboardingScreen
// body's one flex-gap flow (a fragment, not a nested wrapper), so the provider
// notice, any error banner, and the first SetupOptionCard are separated by the
// same declared 12px grid gap the option cards use between themselves — whether
// or not the optional banners are present.
function Switchboard(props: {
    snapshot: SetupSnapshot;
    state: HappyState;
    step: DesktopOnboardingStep | undefined;
    store: SetupStore;
}): ReactNode {
    return (
        <>
            {props.step === "sandbox-provider" ? (
                <SandboxProviderStep snapshot={props.snapshot} store={props.store} />
            ) : null}
            {props.step === "base-image" ? (
                <BaseImageStep snapshot={props.snapshot} store={props.store} />
            ) : null}
            {props.step === "build-progress" ? (
                <BuildStep snapshot={props.snapshot} store={props.store} />
            ) : null}
            {props.step === "default-agent" ? (
                <DefaultAgentStep snapshot={props.snapshot} store={props.store} />
            ) : null}
            {props.step === "completion" ? (
                <RegistrationStep snapshot={props.snapshot} store={props.store} />
            ) : null}
            {props.step === "waiting" ? (
                <Banner tone="info" title="Waiting for the administrator">
                    You will enter the workspace automatically once server setup is complete.
                </Banner>
            ) : null}
        </>
    );
}
function SandboxProviderStep(props: { snapshot: SetupSnapshot; store: SetupStore }) {
    const providers = props.snapshot.providers;
    const discovery = providers.type === "ready" ? providers.value : undefined;
    return (
        <>
            {actionErrorFor(props.snapshot, "sandboxProvider")
                ? ((message) => (
                      <Banner tone="danger" title="Provider unavailable">
                          {message}
                      </Banner>
                  ))(actionErrorFor(props.snapshot, "sandboxProvider"))
                : null}
            {discovery
                ? discovery.providers.map((provider: SandboxProviderStatus) => (
                      <SetupOptionCard
                          key={provider.id}
                          description={provider.detail}
                          disabled={provider.health !== "healthy"}
                          hint={provider.remediation}
                          hintTone="warning"
                          icon="terminal"
                          meta={provider.version ? `Version ${provider.version}` : undefined}
                          onSelect={() => props.store.getState().sandboxProviderSelect(provider.id)}
                          pending={props.snapshot.pending.selectingProviderId === provider.id}
                          recommended={discovery?.recommendedProviderId === provider.id}
                          selected={discovery?.selectedProviderId === provider.id}
                          status={healthStatus(provider.health)}
                          title={provider.displayName}
                      />
                  ))
                : null}
        </>
    );
}
function BaseImageStep(props: { snapshot: SetupSnapshot; store: SetupStore }) {
    const baseImages = props.snapshot.baseImages;
    const imageView = baseImages.type === "ready" ? baseImages.value : undefined;
    // The custom-image draft lives in stable local reducer state owned by this step, so
    // it survives every background base-image reload (which replaces the loadable
    // reference and remounts the keyed built-in list) and every transient submit
    // failure. It is never derived from the changing snapshot.
    const [draft, draftUpdate] = useReducer(
        (
            current: {
                showCustom: boolean;
                customName: string;
                customDockerfile: string;
                attempted: boolean;
            },
            patch: Partial<{
                showCustom: boolean;
                customName: string;
                customDockerfile: string;
                attempted: boolean;
            }>,
        ) => ({ ...current, ...patch }),
        { showCustom: false, customName: "", customDockerfile: "", attempted: false },
    );
    const { showCustom, customName, customDockerfile, attempted } = draft;
    const pending = () => props.snapshot.pending.selectingImage;
    const nameError = () => (attempted && !customName.trim() ? "Enter an image name." : undefined);
    const dockerfileError = () =>
        attempted && !customDockerfile.trim() ? "Enter the Dockerfile contents." : undefined;
    const submitCustom = () => {
        draftUpdate({ attempted: true });
        if (!customName.trim() || !customDockerfile.trim()) return;
        props.store.getState().baseImageSelect({
            custom: { name: customName.trim(), dockerfile: customDockerfile },
        });
    };
    return (
        <>
            {actionErrorFor(props.snapshot, "baseImageSelect")
                ? ((message) => (
                      <Banner tone="danger" title="Could not start the build">
                          {message}
                      </Banner>
                  ))(actionErrorFor(props.snapshot, "baseImageSelect"))
                : null}
            {imageView
                ? imageView.images.map((image: SetupBaseImageSummary) => (
                      <SetupOptionCard
                          key={image.id}
                          description={
                              image.builtinKey ? builtinDescription(image.builtinKey) : undefined
                          }
                          icon="image"
                          meta={image.buildLabel}
                          onSelect={() =>
                              image.builtinKey
                                  ? props.store.getState().baseImageSelect({
                                        builtinKey: image.builtinKey,
                                    })
                                  : undefined
                          }
                          pending={pending()}
                          selected={imageView.selectedImageId === image.id}
                          title={image.name}
                      />
                  ))
                : null}
            <SetupOptionCard
                data-testid="custom-image-option"
                description="Build a sandbox from your own Dockerfile."
                icon="code"
                meta="Build"
                onSelect={() => draftUpdate({ showCustom: !showCustom })}
                selected={showCustom}
                title="Custom Dockerfile"
            />
            {showCustom ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        submitCustom();
                    }}
                    style={{ display: "flex", flexDirection: "column", gap: "12px" }}
                >
                    <TextField
                        disabled={pending()}
                        error={nameError()}
                        fullWidth
                        label="Image name"
                        name="custom-image-name"
                        onValueChange={(value) => draftUpdate({ customName: value })}
                        required
                        value={customName}
                    />
                    <TextField
                        disabled={pending()}
                        error={dockerfileError()}
                        fullWidth
                        label="Dockerfile"
                        multiline
                        name="custom-image-dockerfile"
                        onValueChange={(value) => draftUpdate({ customDockerfile: value })}
                        required
                        rows={6}
                        value={customDockerfile}
                    />
                    <Button disabled={pending()} fullWidth type="submit">
                        {pending() ? "Starting build…" : "Build custom image"}
                    </Button>
                </form>
            ) : null}
        </>
    );
}
function BuildStep(props: { snapshot: SetupSnapshot; store: SetupStore }) {
    const image = () => {
        const view = props.snapshot.baseImages;
        return view.type === "ready" ? view.value.selectedImage : undefined;
    };
    return image() ? (
        ((selected) => (
            <>
                {actionErrorFor(props.snapshot, "baseImageRetry")
                    ? ((message) => (
                          <Banner tone="danger" title="Retry failed">
                              {message}
                          </Banner>
                      ))(actionErrorFor(props.snapshot, "baseImageRetry"))
                    : null}
                <BuildProgressPanel
                    currentLogLine={selected.lastBuildLogLine}
                    error={selected.lastError}
                    log={selected.buildLog}
                    logTruncated={selected.buildLogTruncated}
                    onRetry={() => props.store.getState().baseImageBuildRetry()}
                    progress={selected.buildProgress}
                    retrying={props.snapshot.pending.retryingBuild}
                    status={selected.status}
                    statusLabel={buildStatusLabel(selected.status, selected.lastBuildLogLine)}
                    title={selected.name}
                />
            </>
        ))(image()!)
    ) : (
        <Banner tone="info" title="Preparing the build">
            Fetching the selected image status.
        </Banner>
    );
}
function DefaultAgentStep(props: { snapshot: SetupSnapshot; store: SetupStore }) {
    // The typed identity draft lives in a local reducer owned by this step so it
    // survives every background status reload and transient submit failure; it is
    // never derived from the changing snapshot. It opens on the proposed default.
    const [draft, draftUpdate] = useReducer(
        (
            current: { name: string; username: string; attempted: boolean },
            patch: Partial<{ name: string; username: string; attempted: boolean }>,
        ) => ({ ...current, ...patch }),
        {
            name: DEFAULT_AGENT_PROPOSED.name,
            username: DEFAULT_AGENT_PROPOSED.username,
            attempted: false,
        },
    );
    const submitting = () => props.snapshot.pending.creatingDefaultAgent === true;
    const nameError = () => (draft.attempted ? defaultAgentNameError(draft.name) : undefined);
    const usernameError = () =>
        draft.attempted ? defaultAgentUsernameError(draft.username) : undefined;
    const invalid = () =>
        defaultAgentNameError(draft.name) !== undefined ||
        defaultAgentUsernameError(draft.username) !== undefined;
    const description = () => {
        const provider = selectedProvider(props.snapshot);
        const sandbox = provider
            ? provider.version
                ? ` It will run inside the ${provider.name} sandbox (version ${provider.version}).`
                : ` It will run inside the ${provider.name} sandbox.`
            : "";
        return `This agent is the built-in identity that runs your workspace and posts every automated update.${sandbox} Pick a name and handle you’ll recognize.`;
    };
    const submit = () => {
        draftUpdate({ attempted: true });
        if (invalid()) return;
        props.store
            .getState()
            .defaultAgentCreate({ name: draft.name.trim(), username: draft.username });
    };
    return (
        <DefaultAgentModal
            description={description()}
            formError={actionErrorFor(props.snapshot, "defaultAgent")}
            name={draft.name}
            nameError={nameError()}
            onLucky={() => {
                const pick = pickDefaultAgentIdentity(Math.random, draft);
                draftUpdate({ name: pick.name, username: pick.username });
            }}
            onNameChange={(value) => draftUpdate({ name: value })}
            onSubmit={submit}
            onUsernameChange={(value) => draftUpdate({ username: value.toLowerCase() })}
            submitDisabled={draft.attempted && invalid()}
            submitting={submitting()}
            username={draft.username}
            usernameError={usernameError()}
        />
    );
}
function RegistrationStep(props: { snapshot: SetupSnapshot; store: SetupStore }) {
    const choosing = () => props.snapshot.pending.choosingPolicy;
    return (
        <>
            {actionErrorFor(props.snapshot, "policy")
                ? ((message) => (
                      <Banner tone="danger" title="Could not finish setup">
                          {message}
                      </Banner>
                  ))(actionErrorFor(props.snapshot, "policy"))
                : null}
            <SetupOptionCard
                description="Anyone who reaches the server can create an account."
                icon="users"
                onSelect={() => props.store.getState().registrationPolicyChoose(true)}
                pending={choosing() === true}
                title="Open registration"
            />
            <SetupOptionCard
                description="Only you can sign in until you open registration later."
                icon="shield"
                onSelect={() => props.store.getState().registrationPolicyChoose(false)}
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
function selectedProvider(snapshot: SetupSnapshot):
    | {
          name: string;
          version?: string;
      }
    | undefined {
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
