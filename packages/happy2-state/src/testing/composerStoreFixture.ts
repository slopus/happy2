import { composerStoreCreate } from "../modules/composer/composerState.js";
import type { ComposerStoreOptions } from "../modules/composer/composerState.js";
import type { ComposerInput, ComposerStore } from "../modules/composer/composerState.js";

/** Test-only composer surface that exposes owner input without widening the application API. */
export interface ComposerStoreFixture extends ComposerStore, Disposable {
    input(event: ComposerInput): void;
}

/** Creates a deterministic composer fixture for Blueprint and package boundary tests. */
export function composerStoreFixtureCreate(
    scopeId: string,
    options: ComposerStoreOptions = {},
): ComposerStoreFixture {
    const store = composerStoreCreate(scopeId, options);
    return {
        ...store,
        input: (event) => store.getState().composerInput(event),
        [Symbol.dispose]: () => undefined,
    };
}

export type { ComposerInput as ComposerFixtureInput };
