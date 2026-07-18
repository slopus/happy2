import { EventCard } from "../../src/EventCard";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "680px",
};

const noop = () => {};

export function EventCardPage() {
    return (
        <ComponentPage
            number="C-015"
            summary="Compact 44px status-transition row — icon chip, truncating title with inline meta, right-aligned from → to lane or badge, mono time."
            title="EventCard"
        >
            <Specimen
                detail="44px row · radius 8 · 24px inset chip · from muted → to accent-strong · mono time"
                label="Status transition"
                number="01"
                stage="app"
            >
                <div style={column}>
                    <EventCard
                        from="In progress"
                        icon="tasks"
                        meta="MOB-217"
                        onSelect={noop}
                        time="1h"
                        title="Push notifications drop on cold start"
                        to="In review"
                    />
                    <DimensionRule label="680 px max · 44 px high" />
                </div>
            </Specimen>

            <Specimen
                detail="badge slot replaces the transition lane"
                label="Badge variant"
                number="02"
                stage="app"
            >
                <div style={column}>
                    <EventCard
                        badge={{ label: "MERGED", variant: "success" }}
                        icon="merge"
                        onSelect={noop}
                        time="3h"
                        title="fix/auth-flake into main"
                    />
                    <EventCard
                        badge={{ label: "FAILED", variant: "danger" }}
                        icon="terminal"
                        onSelect={noop}
                        time="5h"
                        title="Nightly build"
                        meta="#4812"
                    />
                    <EventCard
                        badge={{ label: "QUEUED", variant: "neutral" }}
                        icon="clock"
                        time="2m"
                        title="Weekly triage sweep"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Title-only rows stay 44px; no chip, no side lane"
                label="Minimal"
                number="03"
                stage="app"
            >
                <div style={column}>
                    <EventCard title="Workspace exported" />
                </div>
            </Specimen>

            <Specimen
                detail="Feed composition — mixed transitions and badges, 8px stack"
                label="In context"
                number="04"
                stage="app"
            >
                <div style={column}>
                    <EventCard
                        from="Backlog"
                        icon="tasks"
                        meta="ENG-479"
                        onSelect={noop}
                        time="5h"
                        title="Rate limiter returns 500 not 429"
                        to="Done"
                    />
                    <EventCard
                        badge={{ label: "POSTED", variant: "accent" }}
                        icon="spark"
                        onSelect={noop}
                        time="6h"
                        title="SUP-88 triage summary"
                    />
                    <EventCard
                        from="In review"
                        icon="branch"
                        meta="ENG-482"
                        onSelect={noop}
                        time="8h"
                        title="Fix flaky auth token refresh tests"
                        to="Merged"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Fluid below the 680px clamp — long titles truncate, the lane holds"
                label="Narrow container (440px)"
                number="05"
                stage="app"
            >
                <div style={{ ...column, width: "440px" }}>
                    <EventCard
                        from="Queued"
                        icon="clock"
                        onSelect={noop}
                        time="2m"
                        title="Nightly triage sweep across all support channels"
                        to="Running"
                    />
                    <DimensionRule label="440 px container" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
