import { basename, posix } from "node:path";

const ATTACHMENT_DIRECTORY = "/workspace/.context/downloads";
const MAX_ATTACHMENT_NAME_BYTES = 160;

function boundedUtf8(value: string): string {
    let result = "";
    let bytes = 0;
    for (const character of value) {
        const characterBytes = Buffer.byteLength(character);
        if (bytes + characterBytes > MAX_ATTACHMENT_NAME_BYTES) break;
        result += character;
        bytes += characterBytes;
    }
    return result;
}

/** Returns the stable container path used for one turn attachment. */
export function agentTurnAttachmentPath(
    messageId: string,
    fileId: string,
    originalName: string | null,
): string {
    const supplied = originalName ? basename(originalName).replaceAll("\\", "_") : "attachment";
    const normalized = boundedUtf8(
        Array.from(supplied, (character) => {
            const code = character.codePointAt(0)!;
            return code <= 31 || code === 127 ? "_" : character;
        }).join(""),
    );
    const name =
        normalized && normalized !== "." && normalized !== ".." ? normalized : "attachment";
    return posix.join(ATTACHMENT_DIRECTORY, `happy2-attachment-${messageId}-${fileId}-${name}`);
}
