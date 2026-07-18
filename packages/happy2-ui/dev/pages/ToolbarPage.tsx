import { type ReactNode } from "react";
import { Button } from "../../src/Button";
import { Toolbar } from "../../src/Toolbar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};
function trailing() {
    return (
        <>
            <Button aria-label="Filter" icon="filter" iconOnly size="small" variant="ghost" />
            <Button aria-label="More" icon="more" iconOnly size="small" variant="ghost" />
        </>
    );
}
function Frame(props: { children: ReactNode; width: number }) {
    return <div style={{ width: `${props.width}px` }}>{props.children}</div>;
}
export function ToolbarPage() {
    return (
        <ComponentPage
            number="C-026"
            summary="Panel/section header bar — a 48px strip with a title, optional subtitle, an optional leading slot, and a right-pinned actions cluster holding an inset search well and a trailing slot."
            title="Toolbar"
        >
            <Specimen
                detail="48px high · 16px x-pad · bottom hairline · title 15/700 + subtitle 12/500"
                label="Full panel toolbar"
                number="01"
                stage="surface"
            >
                <div style={column}>
                    <Frame width={760}>
                        <Toolbar
                            search={{
                                value: "",
                                onChange: () => {},
                                placeholder: "Filter members",
                            }}
                            subtitle="24 people · 3 admins"
                            title="Members"
                            trailing={trailing()}
                        />
                    </Frame>
                    <DimensionRule label="48 px high · 16 px x-pad" />
                </div>
            </Specimen>

            <Specimen
                detail="Title only · title + subtitle — the heading rides the lane center"
                label="Heading states"
                number="02"
                stage="surface"
            >
                <div style={{ ...column, width: "520px" }}>
                    <Toolbar title="Audit log" />
                    <Toolbar subtitle="Manage roles and access" title="Members" />
                </div>
            </Specimen>

            <Specimen
                detail="Trailing ghost icon buttons pin flush to the 16px right content edge"
                label="Trailing actions"
                number="03"
                stage="surface"
            >
                <div style={column}>
                    <Frame width={560}>
                        <Toolbar title="Integrations" trailing={trailing()} />
                    </Frame>
                    <DimensionRule label="trailing right edge = width − 16" />
                </div>
            </Specimen>

            <Specimen
                detail="220px inset search well · 14px search glyph · 13px input · hairline border"
                label="Search slot"
                number="04"
                stage="surface"
            >
                <div style={column}>
                    <Frame width={640}>
                        <Toolbar
                            search={{ value: "", onChange: () => {}, placeholder: "Search roles" }}
                            subtitle="Manage roles and access"
                            title="Members"
                        />
                    </Frame>
                    <DimensionRule label="search well 220 × 28 · radius 6" />
                </div>
            </Specimen>

            <Specimen
                detail="Leading slot before the heading; search + trailing on the right"
                label="Leading slot"
                number="05"
                stage="surface"
            >
                <Frame width={640}>
                    <Toolbar
                        leading={
                            <Button
                                aria-label="Back"
                                icon="chevron-right"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                        }
                        search={{ value: "", onChange: () => {}, placeholder: "Filter" }}
                        subtitle="Filtered view"
                        title="General"
                        trailing={trailing()}
                    />
                </Frame>
            </Specimen>

            <Specimen
                detail="height prop overrides the 48px default (here 56px)"
                label="Custom height"
                number="06"
                stage="surface"
            >
                <div style={column}>
                    <Frame width={420}>
                        <Toolbar height={56} subtitle="Custom 56px height" title="Big header" />
                    </Frame>
                    <DimensionRule label="height = 56" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
