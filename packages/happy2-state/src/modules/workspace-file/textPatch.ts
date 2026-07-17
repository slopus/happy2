import { UserError, type WorkspaceTextPatch } from "../../types.js";

export function textPatchApply(content: string, patch: WorkspaceTextPatch): string {
    let cursor = 0;
    let result = "";
    for (const edit of patch.edits) {
        if (
            !Number.isSafeInteger(edit.start) ||
            !Number.isSafeInteger(edit.end) ||
            edit.start < cursor ||
            edit.end < edit.start ||
            edit.end > content.length
        )
            throw new UserError(
                "Workspace file edits must be sorted, non-overlapping, and within the file.",
                "workspace_invalid_patch",
            );
        result += content.slice(cursor, edit.start) + edit.text;
        cursor = edit.end;
    }
    return result + content.slice(cursor);
}

export function textPatchFromContents(base: string, desired: string): WorkspaceTextPatch {
    if (base === desired) return { edits: [] };
    let prefix = 0;
    const prefixLimit = Math.min(base.length, desired.length);
    while (prefix < prefixLimit && base[prefix] === desired[prefix]) prefix += 1;
    let suffix = 0;
    const suffixLimit = Math.min(base.length - prefix, desired.length - prefix);
    while (
        suffix < suffixLimit &&
        base[base.length - suffix - 1] === desired[desired.length - suffix - 1]
    )
        suffix += 1;
    return {
        edits: [
            {
                start: prefix,
                end: base.length - suffix,
                text: desired.slice(prefix, desired.length - suffix),
            },
        ],
    };
}

export function textPatchRebase(
    base: string,
    current: string,
    local: WorkspaceTextPatch,
): WorkspaceTextPatch | undefined {
    textPatchApply(base, local);
    const remote = textPatchFromContents(base, current).edits[0];
    if (!remote) return local;
    const delta = remote.text.length - (remote.end - remote.start);
    const edits = [] as { start: number; end: number; text: string }[];
    for (const edit of local.edits) {
        const sameInsertion =
            edit.start === edit.end && remote.start === remote.end && edit.start === remote.start;
        if (sameInsertion) return undefined;
        if (edit.end <= remote.start) edits.push(edit);
        else if (edit.start >= remote.end)
            edits.push({ ...edit, start: edit.start + delta, end: edit.end + delta });
        else return undefined;
    }
    return { edits };
}
