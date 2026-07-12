import { expect, it, vi } from "vitest";
import { AgentMentionPicker, type MentionableAgent } from "./index";
import { createRenderer } from "./testing";

const agents: MentionableAgent[] = [
    {
        id: "forge",
        name: "Forge",
        initials: "F",
        avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
        description: "Implements scoped product work",
        status: "ready",
    },
    {
        id: "scout",
        name: "Scout",
        initials: "S",
        avatarClass: "bg-[linear-gradient(145deg,#3296a4,#4d67bd)]",
        description: "Researches context and findings",
        status: "working",
    },
];

it("holds AgentMentionPicker geometry and selection states", async () => {
    const onSelect = vi.fn();
    const view = createRenderer()
        .render(
            () => (
                <AgentMentionPicker
                    data-testid="picker-list"
                    agents={agents}
                    onSelect={onSelect}
                    query=""
                />
            ),
            { width: 360, height: 240, padding: 12 },
        )
        .render(
            () => (
                <AgentMentionPicker
                    data-testid="picker-empty"
                    agents={agents}
                    onSelect={onSelect}
                    query="missing"
                />
            ),
            { width: 360, height: 160, padding: 12 },
        );
    await view.ready();

    const picker = view.$('[data-testid="picker-list"]');
    const empty = view.$('[data-testid="picker-empty"]');
    expect(picker.bounds()).toEqual({ x: 12, y: 12, width: 320, height: 168 });
    expect(empty.bounds()).toEqual({ x: 12, y: 12, width: 320, height: 116 });
    expect(
        picker.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "overflow-x",
            "overflow-y",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "11px",
        "border-top-color": "rgb(213, 206, 216)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
        width: "320px",
    });

    const rows = picker.element.querySelectorAll<HTMLElement>('[role="option"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.getBoundingClientRect().height).toBe(52);
    expect(rows[1]!.getBoundingClientRect().height).toBe(52);
    rows[0]!.click();
    expect(onSelect).toHaveBeenCalledWith(agents[0]);

    const readyDot = view.$(
        '[data-testid="picker-list"] [role="option"] [data-rigged-ui="agent-status"]',
    );
    expect(readyDot.bounds()).toMatchObject({ width: 6, height: 6 });
    expect(readyDot.computedStyle("background-color")).toBe("rgb(69, 169, 104)");
    expect(empty.element.textContent).toContain("No matching agents.");

    await view.screenshot("AgentMentionPicker.test");
});
