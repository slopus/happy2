import { type DraftSummary } from "../../resources.js";
import { type ComposerStore } from "../composer/composerState.js";
import { type StateRuntime } from "../runtime/runtimeState.js";

const DRAFT_SAVE_DEBOUNCE_MS = 500;

export interface DraftCoordinatorContext {
    readonly runtime: StateRuntime;
    composerGet(scopeId: string): ComposerStore | undefined;
}

/**
 * Owns the personal draft projection and serialized per-chat writes. A server row replaces local
 * text only while the control is unfocused and no interaction occurred at or after that update.
 */
export class DraftCoordinator {
    private readonly drafts = new Map<string, DraftSummary>();
    private readonly queuedText = new Map<string, string>();
    private readonly saving = new Map<string, Promise<void>>();
    private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly inFlight = new Map<string, { readonly text: string; supersededBy?: string }>();
    private loaded = false;
    private serverClockOffsetMs = 0;

    constructor(
        private readonly context: DraftCoordinatorContext,
        private readonly saveDebounceMs = DRAFT_SAVE_DEBOUNCE_MS,
    ) {}

    /** Loads the complete personal projection and reconciles only composers safe to replace. */
    async load(): Promise<void> {
        if (!this.context.runtime.connected) return;
        const requestedAt = this.context.runtime.now();
        const result = await this.context.runtime.operation("getDrafts");
        const receivedAt = this.context.runtime.now();
        const serverTime = Date.parse(result.serverTime);
        if (!Number.isNaN(serverTime))
            this.serverClockOffsetMs = (requestedAt + receivedAt) / 2 - serverTime;
        for (const draft of result.drafts) this.reconcile(draft);
        this.loaded = true;
    }

    /** Seeds a composer from the latest queued, in-flight, or authoritative per-chat text. */
    textGet(scopeId: string): string | undefined {
        if (this.queuedText.has(scopeId)) return this.queuedText.get(scopeId);
        const inFlight = this.inFlight.get(scopeId);
        if (inFlight) return inFlight.supersededBy ?? inFlight.text;
        return this.drafts.get(scopeId)?.text;
    }

    /** Debounces a local keystroke (including empty text) for durable last-write-wins persistence. */
    textUpdate(scopeId: string, text: string): void {
        this.queuedText.set(scopeId, text);
        const inFlight = this.inFlight.get(scopeId);
        if (inFlight && inFlight.text !== text) inFlight.supersededBy = text;
        const timer = this.saveTimers.get(scopeId);
        if (timer) clearTimeout(timer);
        if (!this.context.runtime.connected) return;
        if (this.saveDebounceMs <= 0) {
            this.saveTimers.delete(scopeId);
            this.flush(scopeId);
            return;
        }
        this.saveTimers.set(
            scopeId,
            setTimeout(() => {
                this.saveTimers.delete(scopeId);
                this.flush(scopeId);
            }, this.saveDebounceMs),
        );
    }

    /** Cancels pending debounce timers when the owning HappyState lifetime ends. */
    [Symbol.dispose](): void {
        for (const timer of this.saveTimers.values()) clearTimeout(timer);
        this.saveTimers.clear();
    }

    private flush(scopeId: string): void {
        if (this.saving.has(scopeId) || !this.context.runtime.active) return;
        const saving = this.save(scopeId).finally(() => {
            if (this.saving.get(scopeId) === saving) this.saving.delete(scopeId);
            // If the debounce elapsed while the previous write was still in flight,
            // flush the already-quiet trailing value now. A still-armed timer owns
            // newer typing and must not be pulled forward by the response.
            if (this.queuedText.has(scopeId) && !this.saveTimers.has(scopeId)) this.flush(scopeId);
        });
        this.saving.set(scopeId, saving);
        this.context.runtime.background(saving);
    }

    /** Retries unsaved current text on a later focus transition without rewriting saved drafts. */
    textTouch(scopeId: string, text: string): void {
        if (!this.loaded) return;
        const known = this.drafts.get(scopeId);
        if ((!known && text === "") || known?.text === text) return;
        if (this.queuedText.get(scopeId) === text) return;
        const inFlight = this.inFlight.get(scopeId);
        if (inFlight?.text === text && inFlight.supersededBy === undefined) return;
        this.textUpdate(scopeId, text);
    }

    private reconcile(draft: DraftSummary): void {
        const known = this.drafts.get(draft.chatId);
        if (known && revisionCompare(known.revision, draft.revision) >= 0) return;
        this.drafts.set(draft.chatId, draft);
        const composer = this.context.composerGet(draft.chatId);
        if (!composer) return;
        const snapshot = composer.getState();
        if (snapshot.text === draft.text) return;
        const inFlight = this.inFlight.get(draft.chatId);
        if (inFlight?.supersededBy !== undefined && inFlight.text === draft.text) return;
        const arrivedAt = Date.parse(draft.updatedAt) + this.serverClockOffsetMs;
        if (
            snapshot.focused ||
            // Server timestamps have millisecond precision; an equal instant is ambiguous, so
            // preserve the user's local input instead of risking a destructive replacement.
            (snapshot.lastInteractionAt !== undefined && snapshot.lastInteractionAt >= arrivedAt)
        ) {
            this.textUpdate(draft.chatId, snapshot.text);
            return;
        }
        this.queuedText.delete(draft.chatId);
        if (inFlight && inFlight.text !== draft.text) {
            inFlight.supersededBy = draft.text;
            this.queuedText.set(draft.chatId, draft.text);
        }
        snapshot.composerInput({ type: "textReconciled", text: draft.text });
    }

    private async save(scopeId: string): Promise<void> {
        if (!this.queuedText.has(scopeId) || !this.context.runtime.active) return;
        const text = this.queuedText.get(scopeId)!;
        this.queuedText.delete(scopeId);
        const write = { text };
        this.inFlight.set(scopeId, write);
        const result = await this.context.runtime
            .operation("updateDraft", {
                chatId: scopeId,
                text,
            })
            .finally(() => {
                if (this.inFlight.get(scopeId) === write) this.inFlight.delete(scopeId);
            });
        const known = this.drafts.get(scopeId);
        if (!known || revisionCompare(known.revision, result.draft.revision) < 0)
            this.drafts.set(scopeId, result.draft);
    }
}

function revisionCompare(left: string, right: string): number {
    try {
        const leftValue = BigInt(left);
        const rightValue = BigInt(right);
        return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    } catch {
        return left.localeCompare(right);
    }
}
