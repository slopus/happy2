import { Checkbox } from "../../src/Checkbox";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export function CheckboxPage() {
    return (
        <ComponentPage
            number="C-021"
            summary="18px control box on the 4px grid — reused Icon check glyph, symmetric indeterminate bar, accent fill, focus ring; the real state rides a hidden native checkbox."
            title="Checkbox"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="unchecked · checked · indeterminate · disabled"
                    label="States"
                    number="C-021a"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            "align-items": "flex-start",
                            gap: "16px",
                            padding: "28px",
                        }}
                    >
                        <Checkbox checked={false} label="Enable notifications" />
                        <Checkbox checked label="Enable notifications" />
                        <Checkbox checked={false} indeterminate label="Enable notifications" />
                        <Checkbox checked={false} disabled label="Enable notifications" />
                        <Checkbox checked disabled label="Enable notifications" />
                    </div>
                </Specimen>

                <Specimen
                    detail="18×18 box · 6px radius · 1px hairline · accent fill"
                    label="Control box"
                    number="C-021b"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "grid",
                            gap: "12px",
                            "justify-items": "center",
                            padding: "28px",
                        }}
                    >
                        <DimensionRule label="box 18 · gap 8" />
                        <div style={{ display: "flex", "align-items": "center", gap: "20px" }}>
                            <Checkbox aria-label="Unchecked" checked={false} />
                            <Checkbox aria-label="Checked" checked />
                            <Checkbox aria-label="Mixed" checked={false} indeterminate />
                        </div>
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="selection column — mirrors DataTable header + rows"
                    label="In context"
                    number="C-021c"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "grid",
                            gap: "10px",
                            padding: "28px",
                            width: "320px",
                            "justify-items": "start",
                        }}
                    >
                        <Checkbox checked={false} indeterminate label="Select all (3 of 5)" />
                        <Checkbox checked label="ENG-482 · Deploy checklist" />
                        <Checkbox checked label="ENG-511 · Umbrella retrospective" />
                        <Checkbox checked={false} label="ENG-530 · Access review" />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
