import { storeCreate } from "../../kernel/store.js";
import { attachmentAdd } from "./attachmentAdd.js";
import { attachmentRemove } from "./attachmentRemove.js";
import type { ComposerActionContext } from "./composerActionContext.js";
import { composerInputApply } from "./composerInputApply.js";
import type {
    ComposerAttachment,
    ComposerInput,
    ComposerOutput,
    ComposerSnapshot,
    ComposerStore,
    StandaloneComposerStore,
} from "./composerTypes.js";
import { textSubmit } from "./textSubmit.js";
import { textUpdate } from "./textUpdate.js";

export interface ComposerStoreOptions {
    readonly text?: string;
    readonly attachments?: readonly ComposerAttachment[];
    readonly output?: (event: ComposerOutput) => void;
}

export interface ComposerStoreBinding {
    readonly store: ComposerStore;
    composerInput(event: ComposerInput): void;
    dispose(): void;
}

export function composerStoreCreateBinding(
    scopeId: string,
    options: ComposerStoreOptions = {},
): ComposerStoreBinding {
    const output = options.output ?? (() => undefined);
    let disposed = false;
    const { store: readonlyStore, writer } = storeCreate<ComposerSnapshot>({
        scopeId,
        text: options.text ?? "",
        attachments: options.attachments?.map((attachment) => ({ ...attachment })) ?? [],
        revision: 0,
        submission: { status: "idle" },
    });
    const context: ComposerActionContext = {
        scopeId,
        snapshotGet: readonlyStore.get,
        snapshotUpdate: writer.update,
        output,
    };

    const store: ComposerStore = {
        ...readonlyStore,
        textUpdate(text): void {
            if (disposed) return;
            textUpdate(context, text);
        },
        attachmentAdd(attachment): void {
            if (disposed) return;
            attachmentAdd(context, attachment);
        },
        attachmentRemove(attachmentId): void {
            if (disposed) return;
            attachmentRemove(context, attachmentId);
        },
        textSubmit(): void {
            if (disposed) return;
            textSubmit(context);
        },
    };

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        writer.dispose();
    }

    return {
        store,
        composerInput: (event) => {
            if (!disposed) composerInputApply(writer, event);
        },
        dispose,
    };
}

/** Creates a fully interactive standalone composer with an optional typed output listener. */
export function composerStoreCreate(
    scopeId: string,
    options: ComposerStoreOptions = {},
): StandaloneComposerStore {
    const binding = composerStoreCreateBinding(scopeId, options);
    return {
        ...binding.store,
        [Symbol.dispose]: () => binding.dispose(),
    };
}
