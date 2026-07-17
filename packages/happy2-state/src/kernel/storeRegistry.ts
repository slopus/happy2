export interface RegistryValue {
    dispose(): void;
}

interface RegistryEntry<Value> {
    readonly value: Value;
    acquisitions: number;
}

/** Deduplicates keyed on-demand store bindings without knowing their product semantics. */
export class StoreRegistry<Key, Value extends RegistryValue> {
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

    release(key: Key): void {
        const entry = this.entries.get(key);
        if (!entry) return;
        entry.acquisitions -= 1;
        if (entry.acquisitions > 0) return;
        this.entries.delete(key);
        entry.value.dispose();
    }

    dispose(): void {
        const entries = [...this.entries.values()];
        this.entries.clear();

        let firstError: unknown;
        let failed = false;
        for (const entry of entries) {
            try {
                entry.value.dispose();
            } catch (error) {
                if (failed) continue;
                firstError = error;
                failed = true;
            }
        }
        if (failed) throw firstError;
    }
}
