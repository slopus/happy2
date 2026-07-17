import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { AgentImageDetails, AgentImageSummary } from "../../resources.js";
import type { Loadable } from "../chat/chatTypes.js";
import type { UserError } from "../../types.js";

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

export interface AgentImagesStore extends ReadonlyStore<AgentImagesSnapshot> {
    imageSelect(imageId: string): void;
    imageBuild(imageId: string): void;
    defaultImageSet(imageId: string): void;
    imageCreate(name: string, dockerfile: string): void;
}
