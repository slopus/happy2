import { useState } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/segmented-control.css";
import "./styles/audience-toggle.css";
import { AudienceToggle, type AudienceValue } from "./AudienceToggle";
import { createRenderer } from "./testing";

function Harness(props: { initial: AudienceValue; testid: string }) {
    const [value, setValue] = useState<AudienceValue>(props.initial);
    return <AudienceToggle data-testid={props.testid} onChange={setValue} value={value} />;
}

it("holds the two-segment audience contract in both modes", async () => {
    const view = createRenderer()
        .render(() => <AudienceToggle data-testid="audience-people" value="people" />, {
            width: 260,
            height: 68,
            padding: 20,
        })
        .render(() => <AudienceToggle data-testid="audience-agents" value="agents" />, {
            width: 260,
            height: 68,
            padding: 20,
        })
        .render(() => <AudienceToggle data-testid="audience-disabled" disabled value="agents" />, {
            width: 260,
            height: 68,
            padding: 20,
        });
    await view.ready();
    for (const testid of ["audience-people", "audience-agents"]) {
        const root = view.$(`[data-testid="${testid}"]`);
        expect(root.computedStyle("display")).toBe("inline-flex");
        const segments = Array.from(
            view.container.querySelectorAll<HTMLButtonElement>(
                `[data-testid="${testid}"] .happy2-segmented-control__segment`,
            ),
        );
        expect(segments.map((segment) => segment.textContent)).toEqual(["People", "Agents"]);
        const control = view.$(`[data-testid="${testid}"] [data-happy2-ui="segmented-control"]`);
        expect(control.element.getAttribute("data-size")).toBe("small");
        expect(control.bounds().height).toBe(28);
        // The raised pill covers exactly the selected segment's box.
        const selectedIndex = testid === "audience-people" ? 0 : 1;
        const pill = view.$(`[data-testid="${testid}"] [data-happy2-ui="segmented-control-pill"]`);
        const selected = segments[selectedIndex]!.getBoundingClientRect();
        const pillRect = pill.element.getBoundingClientRect();
        expect(Math.abs(pillRect.x - selected.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(pillRect.width - selected.width)).toBeLessThanOrEqual(1);
        expect(segments[selectedIndex]!.getAttribute("aria-pressed")).toBe("true");
        expect(segments[1 - selectedIndex]!.getAttribute("aria-pressed")).toBe("false");
        const labelInk = await view
            .$(`[data-testid="${testid}"] .happy2-segmented-control__segment`)
            .visibleMetrics();
        expect(labelInk.pixelCount).toBeGreaterThan(0);
    }
    expect(view.$('[data-testid="audience-people"]').element.getAttribute("data-value")).toBe(
        "people",
    );
    expect(view.$('[data-testid="audience-agents"]').element.getAttribute("data-value")).toBe(
        "agents",
    );
    expect(
        view
            .$('[data-testid="audience-disabled"] [data-happy2-ui="segmented-control"]')
            .element.hasAttribute("data-disabled"),
    ).toBe(true);
    await view.screenshot("AudienceToggle.test");
});

it("reports typed audience changes from segment clicks", async () => {
    const view = createRenderer().render(
        () => <Harness initial="people" testid="audience-live" />,
        { width: 260, height: 68, padding: 20 },
    );
    await view.ready();
    const root = () => view.$('[data-testid="audience-live"]').element;
    const segment = (label: string) =>
        Array.from(
            view.container.querySelectorAll<HTMLButtonElement>(
                '[data-testid="audience-live"] .happy2-segmented-control__segment',
            ),
        ).find((candidate) => candidate.textContent === label)!;
    expect(root().getAttribute("data-value")).toBe("people");
    await userEvent.click(segment("Agents"));
    expect(root().getAttribute("data-value")).toBe("agents");
    await userEvent.click(segment("People"));
    expect(root().getAttribute("data-value")).toBe("people");
});
