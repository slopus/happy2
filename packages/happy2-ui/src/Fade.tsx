import { For, createEffect, createSignal, on, onCleanup, type JSX } from "solid-js";

export type FadeProps = {
    class?: string;
    "data-testid"?: string;
    /**
     * Identity of the content currently on screen. Changing it crossfades: the
     * new content mounts as a fresh layer that fades in over the outgoing one,
     * which is removed once the fade completes.
     */
    active: string | number;
    /** Builds the content for a key. Called once per layer, so each layer keeps
     * its own live bindings while the crossfade runs. */
    render: (key: string | number) => JSX.Element;
    /** Crossfade duration in ms. Defaults to the design-system fade duration
     * (also the CSS `--happy2-fade-duration` fallback). */
    durationMs?: number;
};

/* Mirrors the `--happy2-fade-duration` fallback in styles/fade.css: long enough
 * to read as a deliberate crossfade, short enough not to feel sluggish. */
const DEFAULT_DURATION_MS = 360;

type Layer = { id: number; key: string | number };

/**
 * Fade — crossfades between whole-screen content keyed by `active`.
 *
 * Layers stack in a positioned box; the newest is last in the DOM so it paints
 * above the previous one and fades in over it, giving a true crossfade rather
 * than a hard cut. Once the incoming layer is opaque the outgoing layers are
 * dropped. The component owns no product state: the app supplies the `active`
 * key and a `render` function for each screen.
 */
export function Fade(props: FadeProps) {
    const [layers, setLayers] = createSignal<Layer[]>([{ id: 0, key: props.active }]);
    let nextId = 1;

    createEffect(
        on(
            () => props.active,
            (key) => {
                const id = nextId++;
                setLayers((current) => [...current, { id, key }]);
                /* Once this layer has finished fading in it fully covers every
                 * older layer, so they can be removed. Keeping `id` and anything
                 * newer keeps rapid successive changes safe. */
                const settle = setTimeout(
                    () => setLayers((current) => current.filter((layer) => layer.id >= id)),
                    props.durationMs ?? DEFAULT_DURATION_MS,
                );
                onCleanup(() => clearTimeout(settle));
            },
            { defer: true },
        ),
    );

    const layerStyle = (): JSX.CSSProperties | undefined =>
        props.durationMs === undefined
            ? undefined
            : { "--happy2-fade-duration": `${props.durationMs}ms` };

    return (
        <div
            class={["happy2-fade", props.class].filter(Boolean).join(" ")}
            data-happy2-ui="fade"
            data-testid={props["data-testid"]}
        >
            <For each={layers()}>
                {(layer) => (
                    <div
                        class="happy2-fade__layer"
                        data-happy2-ui="fade-layer"
                        style={layerStyle()}
                    >
                        {props.render(layer.key)}
                    </div>
                )}
            </For>
        </div>
    );
}
