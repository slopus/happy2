import type { UploadedFile } from "../../resources.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";

export interface FileUploadContext {
    readonly runtime: StateRuntime;
}

/** Uploads one attachment through the authenticated runtime and returns its durable file identity. */
export async function fileUpload(
    context: FileUploadContext,
    body: FormData,
): Promise<UploadedFile> {
    const result = await context.runtime.operation("uploadFile", { body });
    return result.file;
}
