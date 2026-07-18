import { safeMetadata } from "./safeMetadata.js";

export function baseImageSelectedId(metadataJson: string | null): string | undefined {
    const imageId = safeMetadata(metadataJson)?.imageId;
    return typeof imageId === "string" && imageId ? imageId : undefined;
}
