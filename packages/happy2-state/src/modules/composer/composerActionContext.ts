import type { ComposerOutput, ComposerSnapshot } from "./composerTypes.js";

export interface ComposerActionContext {
    readonly scopeId: string;
    snapshotGet(): ComposerSnapshot;
    snapshotUpdate(reducer: (snapshot: ComposerSnapshot) => ComposerSnapshot): void;
    output(event: ComposerOutput): void;
}
