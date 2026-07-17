import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { AgentImagesStoreBinding } from "./agentImagesStore.js";
import type { AgentImagesOutput } from "./agentImagesTypes.js";

export interface AgentImagesActionContext {
    readonly runtime: StateRuntime;
    readonly images: AgentImagesStoreBinding;
}

const generations = new WeakMap<AgentImagesStoreBinding, number>();
const detailsGenerations = new WeakMap<AgentImagesStoreBinding, number>();

/** Loads the image catalog and routes typed image actions through optimistic retained projections. */
export async function agentImagesLoad(context: AgentImagesActionContext): Promise<void> {
    const generation = (generations.get(context.images) ?? 0) + 1;
    generations.set(context.images, generation);
    context.images.agentImagesInput({ type: "imagesLoading" });
    try {
        const result = await context.runtime.operation("getAgentImages");
        if (generations.get(context.images) !== generation) return;
        context.images.agentImagesInput({
            type: "imagesLoaded",
            images: result.images,
            defaultImageId: result.defaultImageId,
        });
    } catch (error) {
        if (generations.get(context.images) === generation)
            context.images.agentImagesInput({ type: "imagesFailed", error: userError(error) });
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
            context.images.agentImagesInput({ type: "detailsLoading", imageId: event.imageId });
            const result = await context.runtime.operation("getAgentImage", {
                imageId: event.imageId,
            });
            if (
                detailsGenerations.get(context.images) !== generation ||
                context.images.store.get().selectedImageId !== event.imageId
            )
                return;
            context.images.agentImagesInput({ type: "detailsLoaded", details: result.image });
        } else if (event.type === "imageBuildSubmitted") {
            const catalogWasReady = context.images.store.get().images.type === "ready";
            const result = await context.runtime.operation("buildAgentImage", {
                imageId: event.imageId,
            });
            generations.set(context.images, (generations.get(context.images) ?? 0) + 1);
            context.images.agentImagesInput({
                type: "imageUpserted",
                image: result.image,
                completed: "build",
            });
            if (!catalogWasReady) await agentImagesLoad(context);
        } else if (event.type === "defaultImageSubmitted") {
            const catalogWasReady = context.images.store.get().images.type === "ready";
            const result = await context.runtime.operation("setDefaultAgentImage", {
                imageId: event.imageId,
            });
            generations.set(context.images, (generations.get(context.images) ?? 0) + 1);
            context.images.agentImagesInput({
                type: "imageUpserted",
                image: result.image,
                defaultImageId: result.defaultImageId,
                completed: "default",
            });
            if (!catalogWasReady) await agentImagesLoad(context);
        } else {
            const catalogWasReady = context.images.store.get().images.type === "ready";
            const result = await context.runtime.operation("createAgentImage", {
                name: event.name,
                dockerfile: event.dockerfile,
            });
            generations.set(context.images, (generations.get(context.images) ?? 0) + 1);
            context.images.agentImagesInput({
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
                context.images.store.get().selectedImageId !== event.imageId
            )
                return;
            context.images.agentImagesInput({
                type: "detailsFailed",
                imageId: event.imageId,
                error: userError(error),
            });
        } else {
            const displayableError = userError(error);
            if (event.type === "imageBuildSubmitted")
                context.images.agentImagesInput({
                    type: "imageActionFailed",
                    action: "build",
                    imageId: event.imageId,
                    error: displayableError,
                });
            else
                context.images.agentImagesInput({
                    type: "imageActionFailed",
                    action: event.type === "defaultImageSubmitted" ? "default" : "create",
                    error: displayableError,
                });
        }
    }
}
