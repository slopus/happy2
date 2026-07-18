import type { UploadedFile } from "../../resources.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";

export interface AvatarUploadContext {
    readonly runtime: StateRuntime;
}

/** Uploads an avatar candidate without applying it, keeping upload and profile mutation explicit. */
export async function avatarUpload(
    context: AvatarUploadContext,
    body: FormData,
): Promise<UploadedFile> {
    const result = await context.runtime.operation("uploadAvatarFile", { body });
    return result.file;
}
