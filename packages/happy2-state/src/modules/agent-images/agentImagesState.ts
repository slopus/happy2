import { createStore, type StoreApi } from "zustand/vanilla";
import { type AgentImageDetails, type AgentImageSummary } from "../../resources.js";
import { type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface AgentImagesActionContext {
    readonly runtime: StateRuntime;
    readonly images: AgentImagesStore;
}

const generations = new WeakMap<AgentImagesStore, number>();

const detailsGenerations = new WeakMap<AgentImagesStore, number>();

/** Loads the image catalog and routes typed image actions through optimistic retained projections. */
export async function agentImagesLoad(context: AgentImagesActionContext): Promise<void> {
    const generation = (generations.get(context.images) ?? 0) + 1;
    generations.set(context.images, generation);
    context.images.getState().agentImagesInput({ type: "imagesLoading" });
    try {
        const result = await context.runtime.operation("getAgentImages");
        if (generations.get(context.images) !== generation) return;
        context.images.getState().agentImagesInput({
            type: "imagesLoaded",
            images: result.images,
            defaultImageId: result.defaultImageId,
        });
    } catch (error) {
        if (generations.get(context.images) === generation)
            context.images
                .getState()
                .agentImagesInput({ type: "imagesFailed", error: userError(error) });
    }
}

export async function agentImagesOutputRoute(
    context: AgentImagesActionContext,
    event: AgentImagesOutput,
): Promise<void> {
    let detailGeneration: number | undefined;
    try {
        if (event.type === "imageSelected") {
            const generation = (detailsGenerations.get(context.images) ?? 0) + 1;
            detailGeneration = generation;
            detailsGenerations.set(context.images, generation);
            context.images
                .getState()
                .agentImagesInput({ type: "detailsLoading", imageId: event.imageId });
            const result = await context.runtime.operation("getAgentImage", {
                imageId: event.imageId,
            });
            if (
                detailsGenerations.get(context.images) !== generation ||
                context.images.getState().selectedImageId !== event.imageId
            )
                return;
            context.images
                .getState()
                .agentImagesInput({ type: "detailsLoaded", details: result.image });
        } else if (event.type === "imageBuildSubmitted") {
            const catalogWasReady = context.images.getState().images.type === "ready";
            const result = await context.runtime.operation("buildAgentImage", {
                imageId: event.imageId,
            });
            generations.set(context.images, (generations.get(context.images) ?? 0) + 1);
            context.images.getState().agentImagesInput({
                type: "imageUpserted",
                image: result.image,
                completed: "build",
            });
            if (!catalogWasReady) await agentImagesLoad(context);
        } else if (event.type === "defaultImageSubmitted") {
            const catalogWasReady = context.images.getState().images.type === "ready";
            const result = await context.runtime.operation("setDefaultAgentImage", {
                imageId: event.imageId,
            });
            generations.set(context.images, (generations.get(context.images) ?? 0) + 1);
            context.images.getState().agentImagesInput({
                type: "imageUpserted",
                image: result.image,
                defaultImageId: result.defaultImageId,
                completed: "default",
            });
            if (!catalogWasReady) await agentImagesLoad(context);
        } else {
            const catalogWasReady = context.images.getState().images.type === "ready";
            const result = await context.runtime.operation("createAgentImage", {
                name: event.name,
                dockerfile: event.dockerfile,
            });
            generations.set(context.images, (generations.get(context.images) ?? 0) + 1);
            context.images.getState().agentImagesInput({
                type: "imageUpserted",
                image: result.image,
                completed: "create",
            });
            if (!catalogWasReady) await agentImagesLoad(context);
        }
    } catch (error) {
        if (event.type === "imageSelected") {
            if (
                detailsGenerations.get(context.images) !== detailGeneration ||
                context.images.getState().selectedImageId !== event.imageId
            )
                return;
            context.images.getState().agentImagesInput({
                type: "detailsFailed",
                imageId: event.imageId,
                error: userError(error),
            });
        } else {
            const displayableError = userError(error);
            if (event.type === "imageBuildSubmitted")
                context.images.getState().agentImagesInput({
                    type: "imageActionFailed",
                    action: "build",
                    imageId: event.imageId,
                    error: displayableError,
                });
            else
                context.images.getState().agentImagesInput({
                    type: "imageActionFailed",
                    action: event.type === "defaultImageSubmitted" ? "default" : "create",
                    error: displayableError,
                });
        }
    }
}

/** Creates one agent-image admin surface with retained details in the same coarse subscription. */
export function agentImagesStoreCreate(
    output: (event: AgentImagesOutput) => void = () => undefined,
): AgentImagesStore {
    return createStore<AgentImagesState>()((set, get) => ({
        images: { type: "unloaded" },
        details: {},
        pending: { buildImageIds: [], creating: false },
        imageSelect(imageId): void {
            set({ selectedImageId: imageId });
            output({ type: "imageSelected", imageId });
        },
        imageBuild(imageId): void {
            if (get().pending.buildImageIds.includes(imageId)) return;
            set((snapshot) => ({
                pending: {
                    ...snapshot.pending,
                    buildImageIds: [...snapshot.pending.buildImageIds, imageId],
                },
                actionError: undefined,
            }));
            output({ type: "imageBuildSubmitted", imageId });
        },
        defaultImageSet(imageId): void {
            if (get().pending.defaultImageId !== undefined) return;
            set((snapshot) => ({
                pending: { ...snapshot.pending, defaultImageId: imageId },
                actionError: undefined,
            }));
            output({ type: "defaultImageSubmitted", imageId });
        },
        imageCreate(name, dockerfile): void {
            if (get().pending.creating) return;
            set((snapshot) => ({
                pending: { ...snapshot.pending, creating: true },
                actionError: undefined,
            }));
            output({ type: "imageCreateSubmitted", name, dockerfile });
        },
        agentImagesInput(event): void {
            set((snapshot) => {
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
    }));
}

export interface AgentImagesSnapshot {
    readonly images: Loadable<readonly AgentImageSummary[]>;
    readonly defaultImageId?: string;
    readonly selectedImageId?: string;
    readonly details: Readonly<Record<string, Loadable<AgentImageDetails>>>;
    readonly pending: {
        readonly buildImageIds: readonly string[];
        readonly defaultImageId?: string;
        readonly creating: boolean;
    };
    readonly actionError?: UserError;
}

export type AgentImagesOutput =
    | { readonly type: "imageSelected"; readonly imageId: string }
    | { readonly type: "imageBuildSubmitted"; readonly imageId: string }
    | { readonly type: "defaultImageSubmitted"; readonly imageId: string }
    | { readonly type: "imageCreateSubmitted"; readonly name: string; readonly dockerfile: string };

export type AgentImagesInput =
    | { readonly type: "imagesLoading" }
    | {
          readonly type: "imagesLoaded";
          readonly images: readonly AgentImageSummary[];
          readonly defaultImageId?: string;
      }
    | { readonly type: "imagesFailed"; readonly error: import("../../types.js").UserError }
    | {
          readonly type: "imageUpserted";
          readonly image: AgentImageSummary;
          readonly defaultImageId?: string;
          readonly completed: "build" | "default" | "create";
      }
    | { readonly type: "detailsLoading"; readonly imageId: string }
    | { readonly type: "detailsLoaded"; readonly details: AgentImageDetails }
    | {
          readonly type: "detailsFailed";
          readonly imageId: string;
          readonly error: import("../../types.js").UserError;
      }
    | {
          readonly type: "imageActionFailed";
          readonly action: "build";
          readonly imageId: string;
          readonly error: UserError;
      }
    | {
          readonly type: "imageActionFailed";
          readonly action: "default" | "create";
          readonly error: UserError;
      };

export interface AgentImagesState extends AgentImagesSnapshot {
    imageSelect(imageId: string): void;
    imageBuild(imageId: string): void;
    defaultImageSet(imageId: string): void;
    imageCreate(name: string, dockerfile: string): void;
    agentImagesInput(event: AgentImagesInput): void;
}

export type AgentImagesStore = StoreApi<AgentImagesState>;
