interface RegistryEntry<Value> {
    readonly value: Value;
    acquisitions: number;
    lastAccess: number;
}

export interface StoreRegistryOptions {
    /** Number of detached values retained in least-recently-used order. */
    readonly maxDetachedEntries?: number;
}

/** Deduplicates keyed stores while tracking attachment separately from cached residency. */
export class StoreRegistry<Key, Value> {
    private readonly entries = new Map<Key, RegistryEntry<Value>>();
    private readonly maxDetachedEntries: number;
    private accessSequence = 0;

    constructor(options: StoreRegistryOptions = {}) {
        const maxDetachedEntries = options.maxDetachedEntries ?? 0;
        if (!Number.isSafeInteger(maxDetachedEntries) || maxDetachedEntries < 0)
            throw new RangeError("maxDetachedEntries must be a non-negative safe integer.");
        this.maxDetachedEntries = maxDetachedEntries;
    }

    getOrCreate(key: Key, create: () => Value): Value {
        const existing = this.entries.get(key);
        if (existing) {
            existing.acquisitions += 1;
            existing.lastAccess = this.accessNext();
            return existing.value;
        }
        const value = create();
        this.entries.set(key, { value, acquisitions: 1, lastAccess: this.accessNext() });
        return value;
    }

    get(key: Key): Value | undefined {
        return this.entries.get(key)?.value;
    }

    /** Iterates only currently retained values; callers cannot mutate registry ownership. */
    *values(): IterableIterator<readonly [Key, Value]> {
        for (const [key, entry] of this.entries) yield [key, entry.value] as const;
    }

    /** Iterates values with one or more current UI attachments. */
    *attachedValues(): IterableIterator<readonly [Key, Value]> {
        for (const [key, entry] of this.entries)
            if (entry.acquisitions > 0) yield [key, entry.value] as const;
    }

    isAttached(key: Key): boolean {
        return (this.entries.get(key)?.acquisitions ?? 0) > 0;
    }

    /** Releases one attachment and reports whether the value became fully detached. */
    release(key: Key): boolean {
        const entry = this.entries.get(key);
        if (!entry || entry.acquisitions === 0) return false;
        entry.acquisitions -= 1;
        if (entry.acquisitions > 0) return false;
        entry.lastAccess = this.accessNext();
        this.trimDetachedEntries();
        return true;
    }

    dispose(): void {
        this.entries.clear();
    }

    private accessNext(): number {
        this.accessSequence += 1;
        return this.accessSequence;
    }

    private trimDetachedEntries(): void {
        const detached = [...this.entries].filter(([, entry]) => entry.acquisitions === 0);
        if (detached.length <= this.maxDetachedEntries) return;
        detached.sort((left, right) => left[1].lastAccess - right[1].lastAccess);
        for (const [key] of detached.slice(0, detached.length - this.maxDetachedEntries))
            this.entries.delete(key);
    }
}
