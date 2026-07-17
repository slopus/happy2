import { createSignal } from "solid-js";
import { Fade } from "../../src/Fade";
import { ComponentPage, Specimen } from "../kit";

const screens = ["loading", "sign-in", "workspace"] as const;

function ScreenCard(props: { label: string }) {
    return (
        <div
            style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                width: "100%",
                height: "100%",
                color: "var(--happy2-text)",
                background: "var(--happy2-bg-app)",
                "font-family": "var(--happy2-font-ui)",
                "font-size": "18px",
                "font-weight": "600",
            }}
        >
            {props.label}
        </div>
    );
}

export function FadePage() {
    const [index, setIndex] = createSignal(0);
    const active = () => screens[index()];
    const advance = () => setIndex((current) => (current + 1) % screens.length);

    return (
        <ComponentPage
            number="C-057"
            title="Fade"
            summary="Crossfades between whole-screen content keyed by an id; the incoming layer fades in over the outgoing one, then the old layer is dropped."
        >
            <section aria-label="Fade crossfade specimen">
                <Specimen
                    number="57.1"
                    label="screen crossfade"
                    detail="advance to blend between screens"
                    stage="chrome"
                >
                    <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
                        <div
                            style={{
                                position: "relative",
                                width: "480px",
                                height: "240px",
                                overflow: "hidden",
                                "border-radius": "var(--happy2-radius-md)",
                                border: "1px solid var(--happy2-border)",
                            }}
                        >
                            <Fade
                                active={active()}
                                render={(key) => <ScreenCard label={String(key)} />}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={advance}
                            style={{
                                "align-self": "flex-start",
                                padding: "8px 16px",
                                color: "var(--happy2-text)",
                                background: "var(--happy2-bg-raised)",
                                border: "1px solid var(--happy2-border-strong)",
                                "border-radius": "var(--happy2-radius-sm)",
                                "font-family": "var(--happy2-font-ui)",
                                cursor: "pointer",
                            }}
                        >
                            Crossfade to next screen
                        </button>
                    </div>
                </Specimen>
            </section>
        </ComponentPage>
    );
}
