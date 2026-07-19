import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type PluginInstallationSummary,
    type PluginPrepareProgress,
    type PreparedPluginSummary,
} from "../../resources.js";
import { UserError } from "../../types.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface PluginInstallActionContext {
    readonly runtime: StateRuntime;
    readonly install: PluginInstallStore;
}

const generations = new WeakMap<PluginInstallStore, number>();
const prepareStreams = new WeakMap<PluginInstallStore, () => void>();

/** The ZIP archive chosen for upload preparation; the bytes stay out of every snapshot log. */
export interface PluginArchiveDraft {
    readonly name: string;
    readonly size: number;
    readonly file: File;
}

export type PluginPrepareSource =
    | { readonly kind: "upload"; readonly file: File; readonly fileName: string }
    | { readonly kind: "zip_url"; readonly url: string }
    | { readonly kind: "github"; readonly url: string };

export type PluginInstallSourceKind = "upload" | "zip_url" | "github";

export type PluginInstallStep =
    | { readonly step: "source" }
    | { readonly step: "preparing"; readonly progress?: PluginPrepareProgress }
    | { readonly step: "choose"; readonly candidates: readonly PreparedPluginSummary[] }
    | {
          readonly step: "configure";
          readonly candidate: PreparedPluginSummary;
          readonly candidates: readonly PreparedPluginSummary[];
      }
    | {
          readonly step: "installing";
          readonly candidate: PreparedPluginSummary;
          readonly candidates: readonly PreparedPluginSummary[];
      }
    | { readonly step: "installed"; readonly installation: PluginInstallationSummary }
    | { readonly step: "failed"; readonly error: UserError };

export interface PluginInstallSnapshot {
    readonly step: PluginInstallStep;
    /** The source tab selected on the source step. */
    readonly sourceKind: PluginInstallSourceKind;
    readonly urlDraft: string;
    /** Local URL validation error; cleared on the next edit or submit. */
    readonly urlError?: string;
    /** The selected ZIP awaiting upload preparation. */
    readonly archive?: PluginArchiveDraft;
    /** The source of the most recent preparation, retained for retry. */
    readonly source?: PluginPrepareSource;
    /** Terminal install failure shown on the configure step; cleared on the next submit. */
    readonly installError?: UserError;
    /** Guidance shown on the source step after an expired or consumed prepared token. */
    readonly notice?: string;
}

export type PluginInstallOutput =
    | { readonly type: "pluginPrepareSubmitted"; readonly source: PluginPrepareSource }
    | { readonly type: "pluginPrepareCancelled" }
    | {
          readonly type: "pluginInstallPreparedSubmitted";
          readonly preparedToken: string;
          readonly variables: Readonly<Record<string, string>>;
          readonly containerImageId?: string;
      };

export type PluginInstallInput =
    | { readonly type: "pluginPrepareProgressed"; readonly progress: PluginPrepareProgress }
    | {
          readonly type: "pluginPrepared";
          readonly selectionRequired: boolean;
          readonly candidates: readonly PreparedPluginSummary[];
      }
    | { readonly type: "pluginPrepareFailed"; readonly error: UserError }
    | {
          readonly type: "pluginInstallSucceeded";
          readonly installation: PluginInstallationSummary;
      }
    | {
          readonly type: "pluginInstallFailed";
          readonly error: UserError;
          readonly tokenExpired: boolean;
      };

export interface PluginInstallState extends PluginInstallSnapshot {
    sourceKindUpdate(kind: PluginInstallSourceKind): void;
    sourceUrlUpdate(value: string): void;
    archiveSelect(file: File): void;
    archiveClear(): void;
    /** Validates the selected source locally, then submits it for verified preparation. */
    prepareSubmit(): void;
    /** Abandons an in-flight preparation and returns to the source step. */
    prepareCancel(): void;
    /** Re-submits the retained source after a preparation failure. */
    prepareRetry(): void;
    candidateChoose(preparedToken: string): void;
    /** Returns from the configure step to the GitHub candidate list. */
    candidateListReturn(): void;
    /**
     * Submits the verified candidate for durable installation. Variable values
     * (including secrets) exist only transiently inside the typed output event
     * and are never written to this snapshot.
     */
    installSubmit(variables: Readonly<Record<string, string>>, containerImageId?: string): void;
    /** Clears the whole flow back to the source step; used when the dialog opens. */
    flowReset(): void;
    pluginInstallInput(event: PluginInstallInput): void;
}

export type PluginInstallStore = StoreApi<PluginInstallState>;

const initialSnapshot: PluginInstallSnapshot = {
    step: { step: "source" },
    sourceKind: "upload",
    urlDraft: "",
};

function urlValidate(value: string): string | undefined {
    const trimmed = value.trim();
    if (!trimmed) return "Enter an https:// URL.";
    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return "This is not a valid URL.";
    }
    if (parsed.protocol !== "https:") return "Plugin sources must use https://.";
    if (parsed.username || parsed.password) return "Plugin source URLs must not embed credentials.";
    return undefined;
}

/**
 * Creates the external plugin install flow surface: source selection, verified
 * preparation with live progress, GitHub candidate choice, the pre-install
 * preview/configuration step, and the durable prepared-token install. Secret
 * variable values never enter this snapshot; they travel only inside the typed
 * install output event.
 */
export function pluginInstallStoreCreate(
    output: (event: PluginInstallOutput) => void = () => undefined,
): PluginInstallStore {
    return createStore<PluginInstallState>()((set, get) => ({
        ...initialSnapshot,
        sourceKindUpdate(kind): void {
            set((snapshot) => ({ ...snapshot, sourceKind: kind, urlError: undefined }));
        },
        sourceUrlUpdate(value): void {
            set((snapshot) => ({ ...snapshot, urlDraft: value, urlError: undefined }));
        },
        archiveSelect(file): void {
            set((snapshot) => ({
                ...snapshot,
                sourceKind: "upload",
                archive: { name: file.name, size: file.size, file },
            }));
        },
        archiveClear(): void {
            set((snapshot) => ({ ...snapshot, archive: undefined }));
        },
        prepareSubmit(): void {
            const snapshot = get();
            if (snapshot.step.step !== "source" && snapshot.step.step !== "failed") return;
            let source: PluginPrepareSource;
            if (snapshot.sourceKind === "upload") {
                if (!snapshot.archive) return;
                source = {
                    kind: "upload",
                    file: snapshot.archive.file,
                    fileName: snapshot.archive.name,
                };
            } else {
                const urlError = urlValidate(snapshot.urlDraft);
                if (urlError) {
                    set((current) => ({ ...current, urlError }));
                    return;
                }
                source = { kind: snapshot.sourceKind, url: snapshot.urlDraft.trim() };
            }
            set((current) => ({
                ...current,
                step: { step: "preparing" },
                source,
                urlError: undefined,
                installError: undefined,
                notice: undefined,
            }));
            output({ type: "pluginPrepareSubmitted", source });
        },
        prepareCancel(): void {
            if (get().step.step !== "preparing") return;
            set((snapshot) => ({ ...snapshot, step: { step: "source" } }));
            output({ type: "pluginPrepareCancelled" });
        },
        prepareRetry(): void {
            const snapshot = get();
            if (snapshot.step.step !== "failed" || !snapshot.source) return;
            const source = snapshot.source;
            set((current) => ({
                ...current,
                step: { step: "preparing" },
                installError: undefined,
                notice: undefined,
            }));
            output({ type: "pluginPrepareSubmitted", source });
        },
        candidateChoose(preparedToken): void {
            const step = get().step;
            if (step.step !== "choose") return;
            const candidate = step.candidates.find(
                (entry) => entry.preparedToken === preparedToken,
            );
            if (!candidate) return;
            set((current) => ({
                ...current,
                step: { step: "configure", candidate, candidates: step.candidates },
                installError: undefined,
            }));
        },
        candidateListReturn(): void {
            const step = get().step;
            if (step.step !== "configure" || step.candidates.length < 2) return;
            set((current) => ({
                ...current,
                step: { step: "choose", candidates: step.candidates },
                installError: undefined,
            }));
        },
        installSubmit(variables, containerImageId): void {
            const snapshot = get();
            if (snapshot.step.step !== "configure") return;
            const candidate = snapshot.step.candidate;
            const candidates = snapshot.step.candidates;
            if (candidate.variables.some((variable) => !(variables[variable.key] ?? "").length))
                return;
            if (candidate.mcp?.container === "selection_required" && !containerImageId) return;
            set((current) => ({
                ...current,
                step: {
                    step: "installing",
                    candidate,
                    candidates,
                },
                installError: undefined,
            }));
            output({
                type: "pluginInstallPreparedSubmitted",
                preparedToken: candidate.preparedToken,
                variables,
                ...(containerImageId ? { containerImageId } : {}),
            });
        },
        flowReset(): void {
            const preparing = get().step.step === "preparing";
            set((snapshot) => ({
                ...snapshot,
                ...initialSnapshot,
                archive: undefined,
                source: undefined,
                urlError: undefined,
                installError: undefined,
                notice: undefined,
            }));
            if (preparing) output({ type: "pluginPrepareCancelled" });
        },
        pluginInstallInput(event): void {
            set((snapshot) => {
                switch (event.type) {
                    case "pluginPrepareProgressed":
                        return snapshot.step.step === "preparing"
                            ? {
                                  ...snapshot,
                                  step: { step: "preparing", progress: event.progress },
                              }
                            : snapshot;
                    case "pluginPrepared": {
                        if (snapshot.step.step !== "preparing") return snapshot;
                        const [first] = event.candidates;
                        if (!first)
                            return {
                                ...snapshot,
                                step: {
                                    step: "failed",
                                    error: new UserError(
                                        "Preparation returned no installable plugin.",
                                    ),
                                },
                            };
                        return {
                            ...snapshot,
                            step:
                                event.selectionRequired || event.candidates.length > 1
                                    ? { step: "choose", candidates: event.candidates }
                                    : {
                                          step: "configure",
                                          candidate: first,
                                          candidates: event.candidates,
                                      },
                        };
                    }
                    case "pluginPrepareFailed":
                        return snapshot.step.step === "preparing"
                            ? { ...snapshot, step: { step: "failed", error: event.error } }
                            : snapshot;
                    case "pluginInstallSucceeded":
                        return snapshot.step.step === "installing"
                            ? {
                                  ...snapshot,
                                  step: { step: "installed", installation: event.installation },
                              }
                            : snapshot;
                    case "pluginInstallFailed": {
                        if (snapshot.step.step !== "installing") return snapshot;
                        if (event.tokenExpired)
                            return {
                                ...snapshot,
                                step: { step: "source" },
                                notice: "The prepared package expired or was already used. Prepare the plugin again to install it.",
                            };
                        return {
                            ...snapshot,
                            step: {
                                step: "configure",
                                candidate: snapshot.step.candidate,
                                candidates: snapshot.step.candidates,
                            },
                            installError: event.error,
                        };
                    }
                }
            });
        },
    }));
}

/**
 * Routes one typed install-flow intent to its server work: opens the verified
 * preparation SSE stream (multipart upload or JSON source), cancels it, or
 * performs the durable prepared-token install. Exactly one preparation stream
 * is open per store; submitting again or cancelling closes the previous one.
 * An expired or consumed prepared token returns the flow to the source step
 * through the private writer.
 */
export async function pluginInstallOutputRoute(
    context: PluginInstallActionContext,
    event: PluginInstallOutput,
): Promise<void> {
    switch (event.type) {
        case "pluginPrepareSubmitted":
            await prepareStreamOpen(context, event.source);
            return;
        case "pluginPrepareCancelled":
            prepareStreamStop(context.install);
            return;
        case "pluginInstallPreparedSubmitted": {
            try {
                const result = await context.runtime.operation("installPreparedPlugin", {
                    preparedToken: event.preparedToken,
                    ...(Object.keys(event.variables).length ? { variables: event.variables } : {}),
                    ...(event.containerImageId ? { containerImageId: event.containerImageId } : {}),
                });
                context.install.getState().pluginInstallInput({
                    type: "pluginInstallSucceeded",
                    installation: result.installation,
                });
            } catch (error) {
                const failure = userError(error);
                context.install.getState().pluginInstallInput({
                    type: "pluginInstallFailed",
                    error: failure,
                    tokenExpired: failure.code === "not_found",
                });
            }
            return;
        }
    }
}

/** Cancels the in-flight preparation stream, if any; used on cancel, resubmit, and disposal. */
export function pluginInstallPrepareStop(install: PluginInstallStore): void {
    prepareStreamStop(install);
}

function prepareStreamStop(install: PluginInstallStore): void {
    generations.set(install, (generations.get(install) ?? 0) + 1);
    const cancel = prepareStreams.get(install);
    if (cancel) {
        prepareStreams.delete(install);
        cancel();
    }
}

function prepareStreamOpen(
    context: PluginInstallActionContext,
    source: PluginPrepareSource,
): Promise<void> {
    prepareStreamStop(context.install);
    const generation = generations.get(context.install) ?? 0;
    const current = () => generations.get(context.install) === generation;
    let terminalResolve!: () => void;
    const terminal = new Promise<void>((resolve) => {
        terminalResolve = resolve;
    });
    let settled = false;
    let registered: (() => void) | undefined;
    const settle = () => {
        if (settled) return;
        settled = true;
        if (registered && prepareStreams.get(context.install) === registered)
            prepareStreams.delete(context.install);
        terminalResolve();
    };
    const input = (event: PluginInstallInput) => {
        if (current()) context.install.getState().pluginInstallInput(event);
    };
    const observer = {
        onEvent: (event: { readonly event: string; readonly data: unknown }) => {
            if (settled || !current()) return;
            if (event.event === "progress") {
                input({
                    type: "pluginPrepareProgressed",
                    progress: event.data as PluginPrepareProgress,
                });
                return;
            }
            if (event.event === "prepared" || event.event === "selection_required") {
                const data = event.data as {
                    readonly selectionRequired: boolean;
                    readonly candidates: readonly PreparedPluginSummary[];
                };
                input({
                    type: "pluginPrepared",
                    selectionRequired: data.selectionRequired,
                    candidates: data.candidates,
                });
                settle();
                return;
            }
            if (event.event === "failed") {
                const data = event.data as { readonly error?: string; readonly message?: string };
                input({
                    type: "pluginPrepareFailed",
                    error: new UserError(data.message ?? "Plugin preparation failed.", data.error),
                });
                settle();
            }
        },
        onEnd: () => {
            if (settled) return;
            input({
                type: "pluginPrepareFailed",
                error: new UserError("Preparation ended before a result arrived."),
            });
            settle();
        },
        onError: (error: UserError) => {
            if (settled) return;
            input({ type: "pluginPrepareFailed", error });
            settle();
        },
    };
    let cancel: () => void;
    if (source.kind === "upload") {
        const body = new FormData();
        body.append("plugin", source.file, source.fileName);
        cancel = context.runtime.operationStream("preparePluginUpload", { body }, observer);
    } else {
        cancel = context.runtime.operationStream(
            "preparePluginSource",
            { source: { kind: source.kind, url: source.url } },
            observer,
        );
    }
    if (settled) return terminal;
    registered = () => {
        settled = true;
        cancel();
        terminalResolve();
    };
    prepareStreams.set(context.install, registered);
    return terminal;
}
