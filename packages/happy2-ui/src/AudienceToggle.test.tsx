import { useState } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/audience-toggle.css";
import { AudienceToggle, type AudienceValue } from "./AudienceToggle";
import { createRenderer } from "./testing";

function Harness(props: { initial: AudienceValue; testid: string }) {
    const [value, setValue] = useState<AudienceValue>(props.initial);
    return <AudienceToggle data-testid={props.testid} onChange={setValue} value={value} />;
}

it("renders the current audience as a compact text control with the alternate shortcut", async () => {
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
        expect(root.bounds().height).toBe(20);
        expect(root.element.textContent).toBe(
            testid === "audience-people" ? "Talk to people" : "Talk to agents",
        );
        expect(root.element.getAttribute("title")).toBe(
            testid === "audience-people"
                ? "Shift+Tab switches to talk to agents"
                : "Shift+Tab switches to talk to people",
        );
        expect(root.computedStyle("opacity")).toBe("0.5");
        expect(root.element.querySelector("svg")).toBeNull();
        const labelInk = await root.visibleMetrics();
        expect(labelInk.pixelCount).toBeGreaterThan(0);
    }
    expect(view.$('[data-testid="audience-people"]').element.getAttribute("data-value")).toBe(
        "people",
    );
    expect(view.$('[data-testid="audience-agents"]').element.getAttribute("data-value")).toBe(
        "agents",
    );
    expect(view.$('[data-testid="audience-disabled"]').element).toBeDisabled();
    const people = view.$('[data-testid="audience-people"]');
    await userEvent.hover(people.element);
    for (const animation of people.element.getAnimations()) animation.finish();
    expect(people.computedStyle("opacity")).toBe("1");
    expect(people.computedStyle("text-decoration-line")).toBe("none");
    await view.screenshot("AudienceToggle.test");
});

it("reports typed audience changes from text clicks", async () => {
    const view = createRenderer().render(
        () => <Harness initial="people" testid="audience-live" />,
        { width: 260, height: 68, padding: 20 },
    );
    await view.ready();
    const root = () => view.$('[data-testid="audience-live"]').element;
    expect(root().getAttribute("data-value")).toBe("people");
    await userEvent.click(root());
    expect(root().getAttribute("data-value")).toBe("agents");
    await userEvent.click(root());
    expect(root().getAttribute("data-value")).toBe("people");
});
