import { Button } from "../../src/Button";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export function ButtonPage() {
    return (
        <ComponentPage
            number="C-003"
            summary="Relay action control — five variants, three contract heights, leading-icon and icon-only forms."
            title="Button"
        >
            <div class="specimen-grid specimen-grid--sizes">
                <Specimen detail="28px high · 12px label" label="Small" number="B-01" stage="app">
                    <div class="dimensioned-button">
                        <DimensionRule label="height 28" />
                        <Button size="small">Request changes</Button>
                    </div>
                </Specimen>
                <Specimen detail="36px high · 13px label" label="Medium" number="B-02" stage="app">
                    <div class="dimensioned-button">
                        <DimensionRule label="height 36" />
                        <Button size="medium">Request changes</Button>
                    </div>
                </Specimen>
                <Specimen detail="44px high · 14px label" label="Large" number="B-03" stage="app">
                    <div class="dimensioned-button">
                        <DimensionRule label="height 44" />
                        <Button size="large">Request changes</Button>
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="primary · secondary · ghost · danger · success"
                    label="Variants"
                    number="B-04"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "12px",
                            padding: "28px",
                        }}
                    >
                        <Button variant="primary">Approve &amp; merge</Button>
                        <Button variant="secondary">Request changes</Button>
                        <Button variant="ghost">Dismiss</Button>
                        <Button variant="danger">Delete run</Button>
                        <Button variant="success">Review diff</Button>
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="leading icon 14/16/18 by size · 6px gap"
                    label="Leading icon"
                    number="B-05"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "12px",
                            padding: "28px",
                        }}
                    >
                        <Button icon="plus" size="small" variant="secondary">
                            New task
                        </Button>
                        <Button icon="send" size="medium" variant="primary">
                            Send to agent
                        </Button>
                        <Button icon="check" size="large" variant="success">
                            Approve run
                        </Button>
                    </div>
                </Specimen>
                <Specimen
                    detail="square 28/36/44 · glyph optically centered"
                    label="Icon only"
                    number="B-06"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            "align-items": "flex-end",
                            gap: "12px",
                            padding: "28px",
                        }}
                    >
                        <Button
                            aria-label="Add"
                            icon="plus"
                            iconOnly
                            size="small"
                            variant="secondary"
                        />
                        <Button
                            aria-label="Send"
                            icon="send"
                            iconOnly
                            size="medium"
                            variant="primary"
                        />
                        <Button
                            aria-label="Settings"
                            icon="settings"
                            iconOnly
                            size="large"
                            variant="ghost"
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="fullWidth · width prop · disabled"
                    label="Widths and states"
                    number="B-07"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "grid",
                            width: "360px",
                            gap: "12px",
                            padding: "28px",
                            "justify-items": "stretch",
                        }}
                    >
                        <div style={{ display: "grid", gap: "6px" }}>
                            <DimensionRule label="fullWidth — 360px container" />
                            <Button fullWidth variant="primary">
                                Approve &amp; merge
                            </Button>
                        </div>
                        <div style={{ display: "grid", gap: "6px", "justify-items": "start" }}>
                            <div style={{ width: "200px" }}>
                                <DimensionRule label="width = 200" />
                            </div>
                            <Button variant="secondary" width={200}>
                                Open in #eng-core
                            </Button>
                        </div>
                        <div style={{ "justify-self": "start" }}>
                            <Button disabled variant="primary">
                                Disabled
                            </Button>
                        </div>
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
