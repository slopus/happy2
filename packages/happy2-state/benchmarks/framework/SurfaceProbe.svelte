<script lang="ts">
    import { onMount } from "svelte";
    import type { BenchmarkStore } from "../surface-store-engines.js";

    interface ValueSnapshot {
        readonly value: number;
    }

    interface Props {
        readonly primary: BenchmarkStore<ValueSnapshot>;
        readonly secondary: BenchmarkStore<ValueSnapshot>;
        readonly observed: (state: string) => void;
    }

    let { primary, secondary, observed }: Props = $props();
    let primarySnapshot = $state<ValueSnapshot>();
    let secondarySnapshot = $state<ValueSnapshot>();

    onMount(() => {
        primarySnapshot = primary.get();
        secondarySnapshot = secondary.get();
        const primaryUnsubscribe = primary.subscribe(() => {
            primarySnapshot = primary.get();
        });
        const secondaryUnsubscribe = secondary.subscribe(() => {
            secondarySnapshot = secondary.get();
        });
        return () => {
            primaryUnsubscribe();
            secondaryUnsubscribe();
        };
    });

    $effect(() => {
        if (primarySnapshot && secondarySnapshot) {
            observed(`${primarySnapshot.value}:${secondarySnapshot.value}`);
        }
    });
</script>

<output data-state={`${primarySnapshot?.value ?? -1}:${secondarySnapshot?.value ?? -1}`}>
    {primarySnapshot?.value ?? -1}:{secondarySnapshot?.value ?? -1}
</output>
