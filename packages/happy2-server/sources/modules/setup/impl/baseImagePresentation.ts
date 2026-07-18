import type { AgentImageDetails, AgentImageSummary } from "../../chat/types.js";
import type { SetupBaseImageBuildMode, SetupBaseImageSource } from "../types.js";

export interface SetupBaseImagePresentation {
    buildLabel: "Build" | "Download and build";
    buildMode: SetupBaseImageBuildMode;
    source: SetupBaseImageSource;
}

export type SetupBaseImageSummary = AgentImageSummary & SetupBaseImagePresentation;
export type SetupBaseImageDetails = AgentImageDetails & SetupBaseImagePresentation;

export function baseImagePresentation(
    image: AgentImageSummary | AgentImageDetails,
): SetupBaseImagePresentation {
    return image.builtinKey
        ? {
              buildLabel: "Download and build",
              buildMode: "download_and_build",
              source: "builtin",
          }
        : {
              buildLabel: "Build",
              buildMode: "build",
              source: "custom",
          };
}

export function asSetupBaseImageSummary(image: AgentImageSummary): SetupBaseImageSummary {
    return { ...image, ...baseImagePresentation(image) };
}

export function asSetupBaseImageDetails(image: AgentImageDetails): SetupBaseImageDetails {
    return { ...image, ...baseImagePresentation(image) };
}
