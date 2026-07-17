import { composerStoreCreateBinding } from "../modules/composer/composerStore.js";
import type { ComposerStoreOptions } from "../modules/composer/composerStore.js";
import type { ComposerInput, ComposerStore } from "../modules/composer/composerTypes.js";

/** Test-only composer surface that exposes owner input without widening the application API. */
export interface ComposerStoreFixture extends ComposerStore, Disposable {
    input(event: ComposerInput): void;
}

/** Creates a deterministic composer fixture for Blueprint and package boundary tests. */
export function composerStoreFixtureCreate(
    scopeId: string,
    options: ComposerStoreOptions = {},
): ComposerStoreFixture {
    const binding = composerStoreCreateBinding(scopeId, options);
    return {
        ...binding.store,
        input: binding.composerInput,
        [Symbol.dispose]: binding.dispose,
    };
}

export type { ComposerInput as ComposerFixtureInput };
