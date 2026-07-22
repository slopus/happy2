import { type ReactNode } from "react";
import "./styles.css";
import { expect, it } from "vitest";
import { ChannelAccessSummary } from "./ChannelAccessSummary";
import { createRenderer } from "./testing";
function stage(testid: string, children: ReactNode) {
    return (
        <div
            data-testid={testid}
            style={{
                background: "#f5f5f5",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "16px",
                width: "320px",
            }}
        >
            {children}
        </div>
    );
}
it("states public access with a creator and never an owner", { timeout: 90000 }, async () => {
    const view = createRenderer().render(
        () =>
            stage(
                "s",
                <ChannelAccessSummary
                    data-testid="public"
                    steward={{ name: "Maya Johnson" }}
                    visibility="public"
                />,
            ),
        { width: 360, height: 200 },
    );
    await view.ready();
    const root = view.$('[data-testid="public"]');
    expect(root.element.getAttribute("data-visibility")).toBe("public");
    expect(
        view.$('[data-testid="public"] [data-happy2-ui="channel-access-title"]').element
            .textContent,
    ).toBe("Public channel");
    /* The access rule names discovery + free joining. */
    expect(
        view.$('[data-testid="public"] [data-happy2-ui="channel-access-access"]').element
            .textContent,
    ).toContain("join");
    /* Credit is "Created by", not "Owned by": a public channel has no owner. */
    const steward = view.$('[data-testid="public"] [data-happy2-ui="channel-access-steward"]');
    expect(steward.element.textContent).toContain("Created by");
    expect(steward.element.textContent).toContain("Maya Johnson");
    expect(steward.element.textContent).not.toContain("Owned by");
    /* No inheritance note on a top-level channel. */
    expect(
        view.container.querySelector(
            '[data-testid="public"] [data-happy2-ui="channel-access-inherited"]',
        ),
    ).toBeNull();
    await view.screenshot("ChannelAccessSummary.public.test");
});
it("distinguishes listed and unlisted public top-level channels", { timeout: 90000 }, async () => {
    const view = createRenderer().render(
        () =>
            stage(
                "s",
                <>
                    <ChannelAccessSummary
                        data-testid="listed"
                        directoryListed
                        visibility="public"
                    />
                    <ChannelAccessSummary
                        data-testid="unlisted"
                        directoryListed={false}
                        visibility="public"
                    />
                </>,
            ),
        { width: 360, height: 200 },
    );
    await view.ready();
    expect(
        view.$('[data-testid="listed"] [data-happy2-ui="channel-access-access"]').element
            .textContent,
    ).toBe("Anyone can find this channel in the directory and join it.");
    expect(
        view.$('[data-testid="unlisted"] [data-happy2-ui="channel-access-access"]').element
            .textContent,
    ).toBe("This channel is not listed in the directory, but anyone who can reach it can join.");
    await view.screenshot("ChannelAccessSummary.listing.test");
});
it("states private access with a single owner", { timeout: 90000 }, async () => {
    const view = createRenderer().render(
        () =>
            stage(
                "s",
                <ChannelAccessSummary
                    data-testid="private"
                    steward={{ name: "Nora Kim" }}
                    visibility="private"
                />,
            ),
        { width: 360, height: 200 },
    );
    await view.ready();
    expect(view.$('[data-testid="private"]').element.getAttribute("data-visibility")).toBe(
        "private",
    );
    expect(
        view.$('[data-testid="private"] [data-happy2-ui="channel-access-title"]').element
            .textContent,
    ).toBe("Private channel");
    const steward = view.$('[data-testid="private"] [data-happy2-ui="channel-access-steward"]');
    expect(steward.element.textContent).toContain("Owned by");
    expect(steward.element.textContent).toContain("Nora Kim");
    await view.screenshot("ChannelAccessSummary.private.test");
});
it(
    "states inherited visibility and independent membership for a child",
    { timeout: 90000 },
    async () => {
        const view = createRenderer().render(
            () =>
                stage(
                    "s",
                    <>
                        <ChannelAccessSummary
                            data-testid="private-child"
                            inheritedFrom="#launch-week"
                            visibility="private"
                        />
                        <ChannelAccessSummary
                            data-testid="public-child"
                            directoryListed={false}
                            inheritedFrom="#launch-week"
                            visibility="public"
                        />
                    </>,
                ),
            { width: 360, height: 200 },
        );
        await view.ready();
        const inherited = view.$(
            '[data-testid="private-child"] [data-happy2-ui="channel-access-inherited"]',
        );
        expect(inherited.element.textContent).toContain("#launch-week");
        expect(inherited.element.textContent).toContain("independent");
        expect(
            view.$('[data-testid="private-child"] [data-happy2-ui="channel-access-access"]').element
                .textContent,
        ).toContain("Eligible parent members");
        expect(
            view.$('[data-testid="public-child"] [data-happy2-ui="channel-access-access"]').element
                .textContent,
        ).toBe("Eligible parent members can find and join this subchannel.");
        /* With no steward supplied, the credit line is omitted rather than guessed. */
        expect(
            view.container.querySelector(
                '[data-testid="private-child"] [data-happy2-ui="channel-access-steward"]',
            ),
        ).toBeNull();
        await view.screenshot("ChannelAccessSummary.child.test");
    },
);
