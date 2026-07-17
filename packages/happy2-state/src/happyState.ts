import { StoreRegistry } from "./kernel/storeRegistry.js";
import {
    composerStoreCreateBinding,
    type ComposerStoreBinding,
    type ComposerStoreOptions,
} from "./modules/composer/composerStore.js";
import {
    composerOutputRoute,
    type ComposerOutputContext,
} from "./modules/composer/composerOutputRoute.js";
import type { ComposerOutput, ComposerStore } from "./modules/composer/composerTypes.js";
import {
    draftUpdate,
    type DraftActionContext,
    type DraftUpdated,
} from "./modules/draft/draftUpdate.js";

export interface HappyStateOptions {
    readonly composerOutput?: (event: ComposerOutput) => void;
    readonly draftUpdated?: (event: DraftUpdated) => void;
}

/**
 * Owns keyed feature-store lifetimes and binds module actions to shared dependencies. It is not a
 * render store and intentionally has no aggregate snapshot or product reducer.
 */
export class HappyState implements Disposable {
    private readonly composers = new StoreRegistry<string, ComposerStoreBinding>();
    private readonly context: ComposerOutputContext;

    constructor(options: HappyStateOptions = {}) {
        this.context = {
            composerGet: (scopeId) => this.composers.get(scopeId),
            composerOutput: options.composerOutput ?? (() => undefined),
            draftUpdated: options.draftUpdated ?? (() => undefined),
        };
    }

    composer(scopeId: string, options: ComposerStoreOptions = {}): ComposerStore {
        return this.composers.getOrCreate(scopeId, () =>
            composerStoreCreateBinding(scopeId, {
                ...options,
                output: (event) => {
                    options.output?.(event);
                    composerOutputRoute(this.context, event);
                },
            }),
        ).store;
    }

    composerRelease(scopeId: string): void {
        this.composers.release(scopeId);
    }

    draftUpdate(scopeId: string, text: string): void {
        draftUpdate(this.context satisfies DraftActionContext, scopeId, text);
    }

    [Symbol.dispose](): void {
        this.composers.dispose();
    }
}

export function happyStateCreate(options: HappyStateOptions = {}): HappyState {
    return new HappyState(options);
}
