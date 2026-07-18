import { storeCreate } from "../../kernel/store.js";
import type {
    SetupAction,
    SetupInput,
    SetupOutput,
    SetupPending,
    SetupSnapshot,
    SetupStore,
} from "./setupTypes.js";

export interface SetupStoreBinding {
    readonly store: SetupStore;
    setupInput(event: SetupInput): void;
    dispose(): void;
}

const idlePending: SetupPending = { selectingImage: false, retryingBuild: false };

/**
 * Creates the single onboarding surface store. It retains the durable combined
 * status alongside the sandbox-provider and base-image sub-resources so one
 * coarse subscription drives every centered setup screen, and it keeps in-flight
 * command state locally so a transient failure never discards typed form intent.
 */
export function setupStoreCreateBinding(
    output: (event: SetupOutput) => void = () => undefined,
): SetupStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<SetupSnapshot>({
        status: { type: "unloaded" },
        providers: { type: "unloaded" },
        baseImages: { type: "unloaded" },
        pending: idlePending,
    });
    let disposed = false;
    return {
        store: {
            ...readonlyStore,
            sandboxProviderSelect(providerId): void {
                if (disposed) return;
                if (readonlyStore.get().pending.selectingProviderId !== undefined) return;
                writer.update((snapshot) => ({
                    ...snapshot,
                    pending: { ...snapshot.pending, selectingProviderId: providerId },
                    actionError: undefined,
                    actionErrorFor: undefined,
                }));
                output({ type: "sandboxProviderSelectSubmitted", providerId });
            },
            baseImageSelect(selection): void {
                if (disposed) return;
                if (readonlyStore.get().pending.selectingImage) return;
                writer.update((snapshot) => ({
                    ...snapshot,
                    pending: { ...snapshot.pending, selectingImage: true },
                    actionError: undefined,
                    actionErrorFor: undefined,
                }));
                output({ type: "baseImageSelectSubmitted", selection });
            },
            baseImageBuildRetry(): void {
                if (disposed) return;
                if (readonlyStore.get().pending.retryingBuild) return;
                writer.update((snapshot) => ({
                    ...snapshot,
                    pending: { ...snapshot.pending, retryingBuild: true },
                    actionError: undefined,
                    actionErrorFor: undefined,
                }));
                output({ type: "baseImageBuildRetrySubmitted" });
            },
            registrationPolicyChoose(enabled): void {
                if (disposed) return;
                if (readonlyStore.get().pending.choosingPolicy !== undefined) return;
                writer.update((snapshot) => ({
                    ...snapshot,
                    pending: { ...snapshot.pending, choosingPolicy: enabled },
                    actionError: undefined,
                    actionErrorFor: undefined,
                }));
                output({ type: "registrationPolicyChooseSubmitted", enabled });
            },
        },
        setupInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
                switch (event.type) {
                    case "statusLoading":
                        return snapshot.status.type === "ready"
                            ? snapshot
                            : { ...snapshot, status: { type: "loading" } };
                    case "statusLoaded":
                        return { ...snapshot, status: { type: "ready", value: event.status } };
                    case "statusFailed":
                        return snapshot.status.type === "ready"
                            ? snapshot
                            : { ...snapshot, status: { type: "error", error: event.error } };
                    case "providersLoading":
                        return snapshot.providers.type === "ready"
                            ? snapshot
                            : { ...snapshot, providers: { type: "loading" } };
                    case "providersLoaded":
                        return {
                            ...snapshot,
                            providers: { type: "ready", value: event.providers },
                        };
                    case "providersFailed":
                        return snapshot.providers.type === "ready"
                            ? snapshot
                            : { ...snapshot, providers: { type: "error", error: event.error } };
                    case "baseImagesLoading":
                        return snapshot.baseImages.type === "ready"
                            ? snapshot
                            : { ...snapshot, baseImages: { type: "loading" } };
                    case "baseImagesLoaded":
                        return {
                            ...snapshot,
                            baseImages: { type: "ready", value: event.baseImages },
                        };
                    case "baseImagesFailed":
                        return snapshot.baseImages.type === "ready"
                            ? snapshot
                            : { ...snapshot, baseImages: { type: "error", error: event.error } };
                    case "sandboxProviderSelectSucceeded": {
                        const providers =
                            snapshot.providers.type === "ready"
                                ? {
                                      type: "ready" as const,
                                      value: {
                                          ...snapshot.providers.value,
                                          selectedProviderId: event.provider.id,
                                      },
                                  }
                                : snapshot.providers;
                        return {
                            ...snapshot,
                            status: { type: "ready", value: event.status },
                            providers,
                            pending: { ...snapshot.pending, selectingProviderId: undefined },
                            actionError: undefined,
                            actionErrorFor: undefined,
                        };
                    }
                    case "baseImageSelectSucceeded":
                        return {
                            ...snapshot,
                            status: { type: "ready", value: event.status },
                            baseImages: { type: "ready", value: event.baseImages },
                            pending: { ...snapshot.pending, selectingImage: false },
                            actionError: undefined,
                            actionErrorFor: undefined,
                        };
                    case "baseImageBuildRetrySucceeded":
                        return {
                            ...snapshot,
                            status: { type: "ready", value: event.status },
                            baseImages: { type: "ready", value: event.baseImages },
                            pending: { ...snapshot.pending, retryingBuild: false },
                            actionError: undefined,
                            actionErrorFor: undefined,
                        };
                    case "registrationPolicyChooseSucceeded":
                        return {
                            ...snapshot,
                            status: { type: "ready", value: event.status },
                            pending: { ...snapshot.pending, choosingPolicy: undefined },
                            actionError: undefined,
                            actionErrorFor: undefined,
                        };
                    case "actionFailed":
                        return {
                            ...snapshot,
                            pending: clearPending(snapshot.pending, event.action),
                            actionError: event.error,
                            actionErrorFor: event.action,
                        };
                }
            });
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            writer.dispose();
        },
    };
}

function clearPending(pending: SetupPending, action: SetupAction): SetupPending {
    switch (action) {
        case "sandboxProvider":
            return { ...pending, selectingProviderId: undefined };
        case "baseImageSelect":
            return { ...pending, selectingImage: false };
        case "baseImageRetry":
            return { ...pending, retryingBuild: false };
        case "policy":
            return { ...pending, choosingPolicy: undefined };
    }
}
