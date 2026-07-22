import "./styles.css";
import { expect, it, vi } from "vitest";
import { ChannelDirectoryList } from "./ChannelDirectoryList";
import { createRenderer } from "./testing";

const channels = [
    {
        id: "eng",
        name: "Engineering",
        projectName: "Product",
        visibility: "public" as const,
    },
    {
        id: "release",
        name: "Release checklist",
        parentName: "Engineering",
        projectName: "Product",
        visibility: "public" as const,
    },
    {
        id: "hiring",
        name: "Hiring plan",
        parentName: "Founders",
        visibility: "private" as const,
    },
];

it("renders eligible public/private channels with parent context and explicit Join actions", async () => {
    const onJoin = vi.fn();
    const view = createRenderer().render(
        () => (
            <div style={{ width: "400px" }}>
                <ChannelDirectoryList channels={channels} data-testid="directory" onJoin={onJoin} />
            </div>
        ),
        { width: 440, height: 240, padding: 20 },
    );
    await view.ready();

    const list = view.$('[data-testid="directory"]');
    expect(list.computedStyles(["display", "flex-direction", "border-radius"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        "border-radius": "8px",
    });
    const release = view.$('[data-channel-id="release"]');
    expect(release.element.getAttribute("data-visibility")).toBe("public");
    expect(
        view.$('[data-channel-id="release"] [data-happy2-ui="channel-directory-row-meta"]').element
            .textContent,
    ).toBe("Product · Public · Inherits #Engineering");
    const hiring = view.$('[data-channel-id="hiring"]');
    expect(hiring.element.getAttribute("data-visibility")).toBe("private");
    expect(
        view.$('[data-channel-id="hiring"] [data-happy2-ui="channel-directory-row-meta"]').element
            .textContent,
    ).toBe("Private · Inherits #Founders");
    expect(release.computedStyle("border-top-width")).toBe("1px");
    expect(hiring.computedStyle("border-top-width")).toBe("1px");
    expect(hiring.computedStyle("border-bottom-width")).toBe("0px");
    expect(view.container.textContent).not.toContain("message history");

    view.container
        .querySelector<HTMLButtonElement>('[aria-label="Join Release checklist"]')!
        .click();
    expect(onJoin).toHaveBeenCalledWith("release");
    await view.screenshot("ChannelDirectoryList.eligible.test");
});

it("holds every action while one join is pending and exposes the supplied error", async () => {
    const view = createRenderer().render(
        () => (
            <div style={{ width: "400px" }}>
                <ChannelDirectoryList
                    channels={channels}
                    error="Could not join this channel."
                    joiningId="hiring"
                    onJoin={() => {}}
                />
            </div>
        ),
        { width: 440, height: 260, padding: 20 },
    );
    await view.ready();
    expect(view.$('[aria-label="Join Hiring plan"]').element.textContent).toContain("Joining…");
    for (const button of view.container.querySelectorAll<HTMLButtonElement>("button"))
        expect(button.disabled).toBe(true);
    expect(view.$('[data-happy2-ui="channel-directory-error"]').element.textContent).toBe(
        "Could not join this channel.",
    );
    const rows = view.container.querySelectorAll('[data-happy2-ui="channel-directory-row"]');
    expect(rows[0]!.getBoundingClientRect().bottom).toBe(rows[1]!.getBoundingClientRect().top);
    expect(rows[1]!.getBoundingClientRect().bottom).toBe(rows[2]!.getBoundingClientRect().top);
    expect(
        view.$('[data-happy2-ui="channel-directory-error"]').computedStyle("border-top-width"),
    ).toBe("1px");
    await view.screenshot("ChannelDirectoryList.pending.test");
});
