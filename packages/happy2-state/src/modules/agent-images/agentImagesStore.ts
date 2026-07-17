import { storeCreate } from "../../kernel/store.js";
import type {
    AgentImagesInput,
    AgentImagesOutput,
    AgentImagesSnapshot,
    AgentImagesStore,
} from "./agentImagesTypes.js";

export interface AgentImagesStoreBinding {
    readonly store: AgentImagesStore;
    agentImagesInput(event: AgentImagesInput): void;
    dispose(): void;
}

/** Creates one agent-image admin surface with retained details in the same coarse subscription. */
export function agentImagesStoreCreateBinding(
    output: (event: AgentImagesOutput) => void = () => undefined,
): AgentImagesStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<AgentImagesSnapshot>({
        images: { type: "unloaded" },
        details: {},
        pending: { buildImageIds: [], creating: false },
    });
    let disposed = false;
    return {
        store: {
            ...readonlyStore,
            imageSelect(imageId): void {
                if (disposed) return;
                writer.update((snapshot) => ({ ...snapshot, selectedImageId: imageId }));
                output({ type: "imageSelected", imageId });
            },
            imageBuild(imageId): void {
                if (disposed) return;
                if (readonlyStore.get().pending.buildImageIds.includes(imageId)) return;
                writer.update((snapshot) => ({
                    ...snapshot,
                    pending: {
                        ...snapshot.pending,
                        buildImageIds: snapshot.pending.buildImageIds.includes(imageId)
                            ? snapshot.pending.buildImageIds
                            : [...snapshot.pending.buildImageIds, imageId],
                    },
                    actionError: undefined,
                }));
                output({ type: "imageBuildSubmitted", imageId });
            },
            defaultImageSet(imageId): void {
                if (disposed) return;
                if (readonlyStore.get().pending.defaultImageId !== undefined) return;
                writer.update((snapshot) => ({
                    ...snapshot,
                    pending: { ...snapshot.pending, defaultImageId: imageId },
                    actionError: undefined,
                }));
                output({ type: "defaultImageSubmitted", imageId });
            },
            imageCreate(name, dockerfile): void {
                if (disposed) return;
                if (readonlyStore.get().pending.creating) return;
                writer.update((snapshot) => ({
                    ...snapshot,
                    pending: { ...snapshot.pending, creating: true },
                    actionError: undefined,
                }));
                output({ type: "imageCreateSubmitted", name, dockerfile });
            },
        },
        agentImagesInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
                if (event.type === "imagesLoading")
                    return { ...snapshot, images: { type: "loading" } };
                if (event.type === "imagesFailed")
                    return { ...snapshot, images: { type: "error", error: event.error } };
                if (event.type === "imagesLoaded")
                    return {
                        ...snapshot,
                        images: { type: "ready", value: event.images },
                        defaultImageId: event.defaultImageId,
                    };
                if (event.type === "imageActionFailed")
                    return {
                        ...snapshot,
                        pending: {
                            buildImageIds:
                                event.action === "build"
                                    ? snapshot.pending.buildImageIds.filter(
                                          (imageId) => imageId !== event.imageId,
                                      )
                                    : snapshot.pending.buildImageIds,
                            defaultImageId:
                                event.action === "default"
                                    ? undefined
                                    : snapshot.pending.defaultImageId,
                            creating: event.action === "create" ? false : snapshot.pending.creating,
                        },
                        actionError: event.error,
                    };
                if (event.type === "imageUpserted") {
                    const values =
                        snapshot.images.type === "ready" ? [...snapshot.images.value] : undefined;
                    if (values) {
                        const index = values.findIndex((image) => image.id === event.image.id);
                        if (index < 0) values.push(event.image);
                        else values[index] = event.image;
                    }
                    return {
                        ...snapshot,
                        images: values ? { type: "ready", value: values } : snapshot.images,
                        defaultImageId: event.defaultImageId ?? snapshot.defaultImageId,
                        pending: {
                            buildImageIds:
                                event.completed === "build"
                                    ? snapshot.pending.buildImageIds.filter(
                                          (imageId) => imageId !== event.image.id,
                                      )
                                    : snapshot.pending.buildImageIds,
                            defaultImageId:
                                event.completed === "default"
                                    ? undefined
                                    : snapshot.pending.defaultImageId,
                            creating:
                                event.completed === "create" ? false : snapshot.pending.creating,
                        },
                        actionError: undefined,
                    };
                }
                if (event.type === "detailsLoading")
                    return {
                        ...snapshot,
                        details: { ...snapshot.details, [event.imageId]: { type: "loading" } },
                    };
                if (event.type === "detailsFailed")
                    return {
                        ...snapshot,
                        details: {
                            ...snapshot.details,
                            [event.imageId]: { type: "error", error: event.error },
                        },
                    };
                return {
                    ...snapshot,
                    details: {
                        ...snapshot.details,
                        [event.details.id]: { type: "ready", value: event.details },
                    },
                };
            });
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            writer.dispose();
        },
    };
}
