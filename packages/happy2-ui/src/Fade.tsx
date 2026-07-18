import { type CSSProperties, type ReactNode } from "react";
export type FadeProps = {
    className?: string;
    "data-testid"?: string;
    /**
     * Identity of the content currently on screen. Changing it crossfades: the
     * new content mounts as a fresh layer that fades in over the outgoing one,
     * which is removed once the fade completes.
     */
    active: string | number;
    /** Builds the content for a key. Called once per layer, so each layer keeps
     * its own live bindings while the crossfade runs. */
    render: (key: string | number) => ReactNode;
    /** Fade-in duration in ms. Defaults to the design-system fade duration
     * (also the CSS `--happy2-fade-duration` fallback). */
    durationMs?: number;
};
/**
 * Fade — mounts one keyed screen and lets CSS fade the new screen in. Keeping a
 * single live layer avoids duplicate interactive controls and accessibility
 * content during auth and route transitions.
 */
export function Fade(props: FadeProps) {
    const layerStyle = (): CSSProperties | undefined =>
        props.durationMs === undefined
            ? undefined
            : ({ "--happy2-fade-duration": `${props.durationMs}ms` } as CSSProperties);
    return (
        <div
            className={["happy2-fade", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="fade"
            data-testid={props["data-testid"]}
        >
            <div
                key={props.active}
                className="happy2-fade__layer"
                data-happy2-ui="fade-layer"
                style={layerStyle()}
            >
                {props.render(props.active)}
            </div>
        </div>
    );
}
