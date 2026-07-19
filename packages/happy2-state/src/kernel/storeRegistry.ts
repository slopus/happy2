interface RegistryEntry<Value> {
    readonly value: Value;
    acquisitions: number;
}

/** Deduplicates keyed on-demand store bindings without knowing their product semantics. */
export class StoreRegistry<Key, Value> {
    private readonly entries = new Map<Key, RegistryEntry<Value>>();

    getOrCreate(key: Key, create: () => Value): Value {
        const existing = this.entries.get(key);
        if (existing) {
            existing.acquisitions += 1;
            return existing.value;
        }
        const value = create();
        this.entries.set(key, { value, acquisitions: 1 });
        return value;
    }

    get(key: Key): Value | undefined {
        return this.entries.get(key)?.value;
    }

    /** Iterates only currently retained values; callers cannot mutate registry ownership. */
    *values(): IterableIterator<readonly [Key, Value]> {
        for (const [key, entry] of this.entries) yield [key, entry.value] as const;
    }

    release(key: Key): boolean {
        const entry = this.entries.get(key);
        if (!entry) return false;
        entry.acquisitions -= 1;
        if (entry.acquisitions > 0) return false;
        this.entries.delete(key);
        return true;
    }

    dispose(): void {
        this.entries.clear();
    }
}
