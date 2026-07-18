import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import "./styles.css";
import { expect, it } from "vitest";
import { FileAttachment } from "./FileAttachment";
import { DayDivider, Message, MessageList, SystemNotice } from "./Message";
import { assertParallelRoundedCorners, createRenderer, type RenderedElement } from "./testing";
/* Fixtures render on the app surface color so screenshots are representative. */
function stage(testid: string, children: ReactNode) {
    return (
        <div
            data-testid={testid}
            style={{
                background: "#17161c",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
/*
 * Glyph ink measured against the element's own painted pill background, for
 * parts that paint both (day-divider label, mention, code). Measuring the two
 * separately keeps the symmetric background mass from diluting glyph drift.
 */
async function glyphVsPill(part: () => RenderedElement<Element>) {
    const element = part().element as HTMLElement;
    const inlineColor = element.style.color;
    element.style.color = "transparent";
    await nextFrame();
    const bg = await part().visibleMetrics();
    element.style.color = inlineColor;
    const inlineBackground = element.style.background;
    element.style.background = "transparent";
    await nextFrame();
    const glyph = await part().visibleMetrics();
    element.style.background = inlineBackground;
    await nextFrame();
    expect(bg.pixelCount, "pill background pixels").toBeGreaterThan(0);
    expect(glyph.pixelCount, "pill glyph pixels").toBeGreaterThan(0);
    return {
        dx: glyph.center.x - (bg.bounds.x + bg.bounds.width / 2),
        dy: glyph.center.y - (bg.bounds.y + bg.bounds.height / 2),
    };
}
it("shows the audience pill in the meta row without shifting author or time vertically", async () => {
    const view = createRenderer()
        .render(
            () =>
                stage(
                    "message-audience",
                    <Message
                        audienceLabel="To agents · Happy + 1"
                        author="Ada Lovelace"
                        body="Agents, prepare the launch checklist."
                        initials="AL"
                        time="12:55 PM"
                        tone="mint"
                    />,
                ),
            { width: 620, height: 120, padding: 16 },
        )
        .render(
            () =>
                stage(
                    "message-plain",
                    <Message
                        author="Ada Lovelace"
                        body="Just a normal message."
                        initials="AL"
                        time="12:55 PM"
                        tone="mint"
                    />,
                ),
            { width: 620, height: 120, padding: 16 },
        )
        .render(
            () =>
                stage(
                    "message-grouped",
                    <Message
                        audienceLabel="To agents · Happy"
                        author="Ada Lovelace"
                        body="Grouped follow-up keeps the gutter only."
                        grouped
                        initials="AL"
                        time="12:56 PM"
                        tone="mint"
                    />,
                ),
            { width: 620, height: 80, padding: 16 },
        );
    await view.ready();
    const audience = view.$('[data-testid="message-audience"] [data-happy2-ui="message-audience"]');
    expect(audience.element.textContent).toBe("To agents · Happy + 1");
    expect(audience.bounds().height).toBe(16);
    expect(
        audience.computedStyles(["font-size", "font-weight", "border-radius", "color"]),
    ).toMatchObject({
        "font-size": "10px",
        "font-weight": "700",
        "border-radius": "999px",
        color: "rgb(168, 155, 255)",
    });
    const ink = await audience.visibleMetrics();
    expect(ink.pixelCount).toBeGreaterThan(0);
    // The pill sits in the meta row between the author and the timestamp.
    const author = view.$('[data-testid="message-audience"] [data-happy2-ui="message-author"]');
    const time = view.$('[data-testid="message-audience"] [data-happy2-ui="message-time"]');
    const plainAuthor = view.$('[data-testid="message-plain"] [data-happy2-ui="message-author"]');
    const plainTime = view.$('[data-testid="message-plain"] [data-happy2-ui="message-time"]');
    expect(author.bounds()).toMatchObject({
        x: plainAuthor.bounds().x,
        y: plainAuthor.bounds().y,
        width: plainAuthor.bounds().width,
        height: plainAuthor.bounds().height,
    });
    expect(time.bounds()).toMatchObject({
        y: plainTime.bounds().y,
        width: plainTime.bounds().width,
        height: plainTime.bounds().height,
    });
    expect(audience.bounds().x).toBeGreaterThan(author.bounds().x + author.bounds().width);
    expect(time.bounds().x).toBeGreaterThan(audience.bounds().x + audience.bounds().width);
    // The label never renders without a meta row or when absent.
    expect(
        view.container.querySelector(
            '[data-testid="message-plain"] [data-happy2-ui="message-audience"]',
        ),
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="message-grouped"] [data-happy2-ui="message-audience"]',
        ),
    ).toBeNull();
    await view.screenshot("Message.audience.test");
});
it("holds Message anatomy, segment styling, and affordances", async () => {
    const view = createRenderer();
    const selectedEmoji: string[] = [];
    let replies = 0;
    let adds = 0;
    view.render(
        () =>
            stage(
                "m1",
                <Message
                    author="Maya Johnson"
                    body={[
                        { kind: "text", text: "Standup: " },
                        { kind: "mention", text: "Claude" },
                        { kind: "text", text: " can you take " },
                        { kind: "code", text: "MOB-217" },
                        { kind: "text", text: " per the " },
                        { kind: "link", text: "launch checklist" },
                        { kind: "text", text: "?" },
                    ]}
                    onReactionSelect={(emoji) => selectedEmoji.push(emoji)}
                    onReactionAdd={() => (adds += 1)}
                    onReplySelect={() => (replies += 1)}
                    reactions={[
                        { count: 1, emoji: "👍" },
                        { active: true, count: 12, emoji: "🎉" },
                        { count: 128, emoji: "🚀" },
                    ]}
                    replyCount={3}
                    time="10:42"
                    tone="amber"
                />,
            ),
        { width: 560, height: 110 },
    );
    view.render(
        () =>
            stage(
                "m2",
                <Message
                    agent
                    author="Claude"
                    body="On it. I reproduced the drop and handed the fix to Codex."
                    initials="CL"
                    time="9:05"
                    tone="ember"
                >
                    <div
                        data-testid="attach"
                        style={{
                            background: "#1c1b22",
                            border: "1px solid rgba(255, 255, 255, 0.07)",
                            borderRadius: "10px",
                            boxSizing: "border-box",
                            height: "44px",
                        }}
                    />
                </Message>,
            ),
        { width: 560, height: 108 },
    );
    view.render(
        () =>
            stage(
                "m3",
                <Message
                    actionsVisible
                    compact
                    author="Claude"
                    body={[
                        { kind: "text", text: "Follow-up: tracking in " },
                        { kind: "code", text: "MOB-217" },
                        { kind: "text", text: " with " },
                        { kind: "mention", text: "Codex" },
                        { kind: "text", text: "." },
                    ]}
                    time="10:44"
                />,
            ),
        { width: 560, height: 28 },
    );
    view.render(
        () =>
            stage(
                "m4",
                <Message
                    grouped
                    author="Claude"
                    body="Conditional children resolved to no attachments."
                    children={[[], false, undefined] as ReactNode}
                    time="10:45"
                />,
            ),
        { width: 560, height: 26 },
    );
    await view.ready();
    /* ---- Root flex row + rhythm --------------------------------------- */
    const root = view.$('[data-testid="m1"] [data-happy2-ui="message"]');
    expect(root.bounds().width).toBe(560);
    expect(
        root.computedStyles([
            "box-sizing",
            "color",
            "align-items",
            "column-gap",
            "display",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
        ]),
    ).toEqual({
        "box-sizing": "border-box",
        "align-items": "flex-start",
        color: "rgb(237, 234, 242)",
        "column-gap": "12px",
        display: "flex",
        "padding-bottom": "6px",
        "padding-left": "20px",
        "padding-right": "20px",
        "padding-top": "6px",
    });
    const avatar = view.$('[data-testid="m1"] [data-happy2-ui="avatar"]');
    expect(avatar.bounds()).toEqual({ x: 20, y: 6, width: 36, height: 36 });
    const content = view.$('[data-testid="m1"] [data-happy2-ui="message-content"]');
    expect(content.bounds().x).toBe(68); /* 20 pad + 36 avatar + 12 gap */
    expect(content.bounds().width).toBe(560 - 68 - 20);
    expect(content.computedStyles(["display", "flex-direction", "flex-grow"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        "flex-grow": "1",
    });
    expect(
        view.container.querySelector('[data-testid="m1"] [data-happy2-ui="message-attachments"]'),
        "no empty attachment wrapper",
    ).toBeNull();
    expect(
        view.container.querySelector('[data-testid="m2"] [data-happy2-ui="message-attachments"]'),
        "supplied attachment wrapper",
    ).not.toBeNull();
    expect(
        view.$('[data-testid="m2"] [data-happy2-ui="message"]').bounds().height,
        "message height with a real attachment",
    ).toBe(108);
    expect(
        view.$('[data-testid="m3"] [data-happy2-ui="message"]').bounds().height,
        "grouped message height without phantom attachments",
    ).toBeLessThan(28);
    expect(
        view.container.querySelector('[data-testid="m4"] [data-happy2-ui="message-attachments"]'),
        "no attachment wrapper for conditional child placeholders",
    ).toBeNull();
    expect(
        view.$('[data-testid="m4"] [data-happy2-ui="message"]').bounds().height,
        "conditional child placeholders do not add attachment spacing",
    ).toBe(26);
    /* ---- Author row ---------------------------------------------------- */
    const author = view.$('[data-testid="m1"] [data-happy2-ui="message-author"]');
    const authorMetrics = author.textMetrics();
    expect(authorMetrics.text).toBe("Maya Johnson");
    expect(authorMetrics.font.family).toBe("happy2 Figtree, system-ui, sans-serif");
    expect(authorMetrics.font.size).toBe(14);
    expect(authorMetrics.font.weight).toBe("700");
    expect(authorMetrics.font.lineHeight).toBe(20);
    expect(authorMetrics.ink.width).toBeGreaterThan(0);
    const time = view.$('[data-testid="m1"] [data-happy2-ui="message-time"]');
    expect(time.computedStyles(["color", "font-size", "font-weight"])).toEqual({
        color: "rgb(117, 112, 133)",
        "font-size": "11px",
        "font-weight": "500",
    });
    expect(time.textMetrics().font.family).toBe("happy2 Mono, ui-monospace, monospace");
    /* Human message has no AGENT badge; agent message shows the accent one. */
    expect(view.container.querySelector('[data-testid="m1"] [data-happy2-ui="badge"]')).toBeNull();
    const badge = view.$('[data-testid="m2"] [data-happy2-ui="badge"]');
    expect(badge.element.getAttribute("data-variant")).toBe("accent");
    expect(badge.height()).toBe(18);
    expect(view.$('[data-testid="m2"] [data-happy2-ui="badge-label"]').textMetrics().text).toBe(
        "AGENT",
    );
    /* The badge pill centers in the 20px meta row, 8px after the author. */
    const m2Meta = view.$('[data-testid="m2"] [data-happy2-ui="message-meta"]');
    expect(m2Meta.height()).toBe(20);
    expect(badge.bounds().y - m2Meta.bounds().y).toBe(1);
    const m2Author = view.$('[data-testid="m2"] [data-happy2-ui="message-author"]');
    expect(badge.bounds().x - (m2Author.bounds().x + m2Author.bounds().width)).toBeCloseTo(8, 6);
    /* Agent avatar is the rounded-square type. */
    expect(
        view.$('[data-testid="m2"] [data-happy2-ui="avatar"]').element.getAttribute("data-type"),
    ).toBe("agent");
    /* ---- Body + segments ------------------------------------------------ */
    const body = view.$('[data-testid="m1"] [data-happy2-ui="message-body"]');
    expect(body.computedStyles(["color", "font-size", "line-height"])).toEqual({
        color: "rgb(237, 234, 242)",
        "font-size": "15px",
        "line-height": "22px",
    });
    const mention = view.$('[data-testid="m1"] [data-happy2-ui="message-mention"]');
    expect(mention.element.textContent).toBe("@Claude");
    expect(
        mention.computedStyles([
            "background-color",
            "border-radius",
            "color",
            "font-weight",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        "background-color": "rgba(139, 124, 247, 0.15)",
        "border-radius": "4px",
        color: "rgb(168, 155, 255)",
        "font-weight": "500",
        "padding-left": "5px",
        "padding-right": "5px",
    });
    expect((await mention.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const code = view.$('[data-testid="m1"] [data-happy2-ui="message-code"]');
    expect(code.computedStyles(["background-color", "border-radius", "font-size"])).toEqual({
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-radius": "4px",
        "font-size": "13px",
    });
    expect(code.textMetrics().font.family).toBe("happy2 Mono, ui-monospace, monospace");
    expect((await code.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const link = view.$('[data-testid="m1"] [data-happy2-ui="message-link"]');
    expect(link.computedStyles(["color", "text-decoration-line"])).toEqual({
        color: "rgb(139, 124, 247)",
        "text-decoration-line": "none",
    });
    expect((await link.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    /* ---- Reactions row --------------------------------------------------- */
    const reactions = view.$('[data-testid="m1"] [data-happy2-ui="message-reactions"]');
    expect(reactions.computedStyle("margin-top")).toBe("6px");
    /* Gecko's measured -0.5px body baseline correction shifts the body rect,
       so the visual gap reads 6.5 there; assert the rhythm with tolerance. */
    expect(
        Math.abs(reactions.bounds().y - (body.bounds().y + body.bounds().height) - 6),
    ).toBeLessThanOrEqual(0.5);
    const chips = view.container.querySelectorAll(
        '[data-testid="m1"] [data-happy2-ui="reaction-chip"]',
    );
    expect(chips.length).toBe(3);
    const chipA = view.$('[data-testid="m1"] [data-happy2-ui="reaction-chip"]:nth-of-type(1)');
    const chipB = view.$('[data-testid="m1"] [data-happy2-ui="reaction-chip"]:nth-of-type(2)');
    const chipC = view.$('[data-testid="m1"] [data-happy2-ui="reaction-chip"]:nth-of-type(3)');
    expect(chipA.height()).toBe(24);
    expect(chipB.height()).toBe(24);
    expect(chipC.height()).toBe(24);
    /* One row: 1, 2, and 3-digit counts all share the same 24px top edge. */
    expect(chipB.bounds().y).toBe(chipA.bounds().y);
    expect(chipC.bounds().y).toBe(chipA.bounds().y);
    /* `bounds()` resolves to 0.001px; retain that full precision when subtracting
     * independently rounded chip edges around the exact 6px flex gap. */
    expect(
        Math.abs(chipB.bounds().x - (chipA.bounds().x + chipA.bounds().width) - 6),
    ).toBeLessThanOrEqual(0.001);
    expect(
        Math.abs(chipC.bounds().x - (chipB.bounds().x + chipB.bounds().width) - 6),
    ).toBeLessThanOrEqual(0.001);
    expect(chipB.element.getAttribute("aria-pressed")).toBe("true");
    const addButton = view.$('[data-testid="m1"] [data-happy2-ui="message-react-add"]');
    expect(addButton.element.tagName).toBe("BUTTON");
    expect(addButton.bounds().width).toBe(24);
    expect(addButton.bounds().height).toBe(24);
    expect(addButton.bounds().y).toBe(chipA.bounds().y);
    expect(addButton.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "border-radius": "999px",
        color: "rgb(117, 112, 133)",
    });
    const addIcon = await view
        .$('[data-testid="m1"] [data-happy2-ui="message-react-add"] svg')
        .visibleMetrics();
    expect(addIcon.pixelCount).toBeGreaterThan(0);
    (chipA.element as HTMLButtonElement).click();
    (addButton.element as HTMLButtonElement).click();
    expect(selectedEmoji).toEqual(["👍"]);
    expect(adds).toBe(1);
    /* ---- Reply affordance ------------------------------------------------ */
    const repliesButton = view.$('[data-testid="m1"] [data-happy2-ui="message-replies"]');
    expect(repliesButton.element.tagName).toBe("BUTTON");
    expect(repliesButton.element.textContent).toBe("3 replies");
    expect(repliesButton.computedStyles(["color", "font-size", "font-weight"])).toEqual({
        color: "rgb(139, 124, 247)",
        "font-size": "12px",
        "font-weight": "700",
    });
    expect((await repliesButton.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    (repliesButton.element as HTMLButtonElement).click();
    expect(replies).toBe(1);
    /* ---- Attachment slot -------------------------------------------------- */
    const m2Body = view.$('[data-testid="m2"] [data-happy2-ui="message-body"]');
    const attachments = view.$('[data-testid="m2"] [data-happy2-ui="message-attachments"]');
    expect(attachments.computedStyles(["display", "flex-direction", "gap", "margin-top"])).toEqual({
        display: "flex",
        "flex-direction": "column",
        gap: "4px",
        "margin-top": "8px",
    });
    /* Tolerance for the Gecko -0.5px body baseline correction (see above). */
    expect(
        Math.abs(attachments.bounds().y - (m2Body.bounds().y + m2Body.bounds().height) - 8),
    ).toBeLessThanOrEqual(0.5);
    const m2Content = view.$('[data-testid="m2"] [data-happy2-ui="message-content"]');
    expect(view.$('[data-testid="attach"]').bounds().width).toBe(m2Content.bounds().width);
    /* ---- Compact follow-up (with rich segments) ---------------------------- */
    expect(view.container.querySelector('[data-testid="m3"] [data-happy2-ui="avatar"]')).toBeNull();
    expect(
        view.container.querySelector('[data-testid="m3"] [data-happy2-ui="message-meta"]'),
    ).toBeNull();
    const gutterTime = view.$('[data-testid="m3"] [data-happy2-ui="message-gutter-time"]');
    expect(gutterTime.computedStyles(["color", "font-size", "line-height"])).toEqual({
        color: "rgb(117, 112, 133)",
        "font-size": "11px",
        "line-height": "22px",
    });
    expect(gutterTime.textMetrics().font.family).toBe("happy2 Mono, ui-monospace, monospace");
    expect((await gutterTime.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    /* Compact body stays on the same 68px content column, segments intact. */
    expect(view.$('[data-testid="m3"] [data-happy2-ui="message-body"]').bounds().x).toBe(68);
    expect(
        (await view.$('[data-testid="m3"] [data-happy2-ui="message-code"]').visibleMetrics())
            .pixelCount,
    ).toBeGreaterThan(0);
    expect(
        (await view.$('[data-testid="m3"] [data-happy2-ui="message-mention"]').visibleMetrics())
            .pixelCount,
    ).toBeGreaterThan(0);
    await view.screenshot("Message.test");
});
it("makes the avatar and author name a profile affordance without shifting geometry", async () => {
    const view = createRenderer();
    let humanOpens = 0;
    const agentOpens: string[] = [];
    view.render(
        () =>
            stage(
                "id-human",
                <Message
                    author="Maya Johnson"
                    body="Open my profile from the avatar or my name."
                    onAuthorSelect={() => (humanOpens += 1)}
                    time="10:42"
                    tone="amber"
                />,
            ),
        { width: 560, height: 80 },
    );
    view.render(
        () =>
            stage(
                "id-agent",
                <Message
                    agent
                    author="Codex"
                    body="Agents open a profile too."
                    initials="CX"
                    onAuthorSelect={() => agentOpens.push("agent")}
                    time="10:43"
                    tone="mint"
                />,
            ),
        { width: 560, height: 80 },
    );
    /* A grouped follow-up renders no avatar/name, so it carries no affordance
       even when a handler is supplied. */
    view.render(
        () =>
            stage(
                "id-grouped",
                <Message
                    grouped
                    author="Codex"
                    body="No repeated identity to click."
                    onAuthorSelect={() => agentOpens.push("grouped")}
                    time="10:44"
                />,
            ),
        { width: 560, height: 40 },
    );
    await view.ready();
    /* ---- Avatar becomes a button but keeps the exact gutter geometry ------ */
    const identity = view.$('[data-testid="id-human"] [data-happy2-ui="message-identity"]');
    expect(identity.element.tagName).toBe("BUTTON");
    expect(identity.element.getAttribute("type")).toBe("button");
    expect(identity.element.getAttribute("aria-label")).toBe("View Maya Johnson’s profile");
    expect(
        identity.computedStyles(["cursor", "border-width", "padding-top", "background-color"]),
    ).toEqual({
        cursor: "pointer",
        "border-width": "0px",
        "padding-top": "0px",
        "background-color": "rgba(0, 0, 0, 0)",
    });
    /* Identical to the non-interactive anatomy fixture: 20px pad + 36px avatar. */
    const avatar = view.$('[data-testid="id-human"] [data-happy2-ui="avatar"]');
    expect(avatar.bounds()).toEqual({ x: 20, y: 6, width: 36, height: 36 });
    /* The button wraps the avatar tightly — no extra hit-area or offset. */
    expect(identity.bounds()).toEqual({ x: 20, y: 6, width: 36, height: 36 });
    const content = view.$('[data-testid="id-human"] [data-happy2-ui="message-content"]');
    expect(content.bounds().x).toBe(68);
    /* ---- Author name becomes a button with unchanged typography ----------- */
    const author = view.$('[data-testid="id-human"] [data-happy2-ui="message-author"]');
    expect(author.element.tagName).toBe("BUTTON");
    expect(author.element.getAttribute("aria-label")).toBe("View Maya Johnson’s profile");
    const authorMetrics = author.textMetrics();
    expect(authorMetrics.text).toBe("Maya Johnson");
    expect(authorMetrics.font.family).toBe("happy2 Figtree, system-ui, sans-serif");
    expect(authorMetrics.font.size).toBe(14);
    expect(authorMetrics.font.weight).toBe("700");
    expect(authorMetrics.font.lineHeight).toBe(20);
    expect(author.computedStyles(["color", "cursor", "text-align"])).toEqual({
        color: "rgb(237, 234, 242)",
        cursor: "pointer",
        "text-align": "left",
    });
    expect((await author.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    /* Both the avatar and the name activate the same profile handler. */
    (identity.element as HTMLButtonElement).click();
    (author.element as HTMLButtonElement).click();
    expect(humanOpens).toBe(2);
    /* ---- Agent identity: badge still sits 8px after the name -------------- */
    const agentAuthor = view.$('[data-testid="id-agent"] [data-happy2-ui="message-author"]');
    expect(agentAuthor.element.tagName).toBe("BUTTON");
    const badge = view.$('[data-testid="id-agent"] [data-happy2-ui="badge"]');
    expect(badge.bounds().x - (agentAuthor.bounds().x + agentAuthor.bounds().width)).toBeCloseTo(
        8,
        6,
    );
    const agentIdentity = view.$('[data-testid="id-agent"] [data-happy2-ui="message-identity"]');
    (agentIdentity.element as HTMLButtonElement).click();
    (agentAuthor.element as HTMLButtonElement).click();
    expect(agentOpens).toEqual(["agent", "agent"]);
    /* ---- Grouped follow-up exposes no identity affordance ----------------- */
    const groupedRoot = view.$('[data-testid="id-grouped"] [data-happy2-ui="message"]');
    expect(groupedRoot.element.querySelector('[data-happy2-ui="message-identity"]')).toBeNull();
    expect(groupedRoot.element.querySelector('[data-happy2-ui="message-author"]')).toBeNull();
    expect(groupedRoot.element.querySelector('[data-happy2-ui="avatar"]')).toBeNull();
    await view.screenshot("Message.identity.test");
});
it("keeps file attachments intrinsic inside the full-width attachment slot", async () => {
    const view = createRenderer();
    view.render(
        () =>
            stage(
                "file-message",
                <Message grouped author="Claude" body="" time="10:46">
                    <FileAttachment name="release-notes.txt" size="12 KB" />
                </Message>,
            ),
        { width: 560, height: 44 },
    );
    await view.ready();
    const file = view.$('[data-testid="file-message"] [data-happy2-ui="file-attachment"]');
    const content = view.$('[data-testid="file-message"] [data-happy2-ui="message-content"]');
    expect(file.computedStyle("align-self"), "file keeps intrinsic width").toBe("flex-start");
    expect(file.bounds().width, "file does not stretch across the message").toBeLessThan(
        content.bounds().width,
    );
});
it("exposes real hover actions and keeps grouped sending geometry stable", async () => {
    const view = createRenderer();
    const reactions: string[] = [];
    const menuSelections: string[] = [];
    let threadStarts = 0;
    const messageMenu = [
        { kind: "item" as const, id: "copy-link", icon: "link" as const, label: "Copy link" },
        { kind: "item" as const, id: "edit", icon: "edit" as const, label: "Edit message" },
    ];
    const reactionOptions = [
        { char: "👍", id: "👍", name: "Thumbs up" },
        { char: "🎉", id: "🎉", name: "Celebrate" },
        { char: "✅", id: "✅", name: "Done" },
    ];
    view.render(
        () =>
            stage(
                "actions",
                <Message
                    actionsVisible
                    author="Sasha K."
                    body="Review is green."
                    menuItems={messageMenu}
                    onMenuSelect={(id) => menuSelections.push(id)}
                    onReactionSelect={(id) => reactions.push(id)}
                    onReplySelect={() => (threadStarts += 1)}
                    reactionOptions={reactionOptions}
                    time="10:55"
                    tone="ocean"
                />,
            ),
        { width: 560, height: 260 },
    );
    view.render(
        () =>
            stage(
                "actionless",
                <Message
                    author="Sasha K."
                    body="No handlers means no controls."
                    menuItems={messageMenu}
                    reactionOptions={reactionOptions}
                    time="10:56"
                />,
            ),
        { width: 560, height: 70 },
    );
    view.render(
        () =>
            stage(
                "grouped-sent",
                <Message
                    author="Maya Johnson"
                    body="Waiting for acknowledgement."
                    grouped
                    time="11:03"
                />,
            ),
        { width: 560, height: 48 },
    );
    view.render(
        () =>
            stage(
                "grouped-sending",
                <Message
                    author="Maya Johnson"
                    body="Waiting for acknowledgement."
                    deliveryState="sending"
                    grouped
                    onReplySelect={() => {}}
                    time="11:03"
                />,
            ),
        { width: 560, height: 48 },
    );
    await view.ready();
    /* A message only exposes controls backed by callbacks and supplied data. */
    expect(
        view.container.querySelector(
            '[data-testid="actionless"] [data-happy2-ui="message-actions"]',
        ),
    ).toBeNull();
    const toolbar = view.$('[data-testid="actions"] [data-happy2-ui="message-actions"]');
    expect(toolbar.bounds()).toEqual({ x: 450, y: 4, width: 90, height: 34 });
    expect(
        toolbar.computedStyles([
            "background-color",
            "border-radius",
            "display",
            "opacity",
            "padding-bottom",
            "padding-left",
            "padding-right",
            "padding-top",
            "pointer-events",
            "position",
        ]),
    ).toEqual({
        "background-color": "rgb(36, 34, 43)",
        "border-radius": "6px",
        display: "flex",
        opacity: "1",
        "padding-bottom": "2px",
        "padding-left": "2px",
        "padding-right": "2px",
        "padding-top": "2px",
        "pointer-events": "auto",
        position: "absolute",
    });
    const actionButtons = toolbar.element.querySelectorAll<HTMLButtonElement>(
        '[data-happy2-ui="button"]',
    );
    expect(actionButtons.length).toBe(3);
    expect(Array.from(actionButtons, (button) => button.getAttribute("aria-label"))).toEqual([
        "Add reaction",
        "Start thread",
        "More message actions",
    ]);
    for (const button of actionButtons) {
        expect(button.getBoundingClientRect().width).toBe(28);
        expect(button.getBoundingClientRect().height).toBe(28);
    }
    /* Thread callback and the picker/menu popovers perform actual selections. */
    actionButtons[1]?.click();
    expect(threadStarts).toBe(1);
    actionButtons[0]?.click();
    await nextFrame();
    const picker = view.$('[data-testid="actions"] [data-happy2-ui="emoji-picker"]');
    assertParallelRoundedCorners(view.container);
    expect(picker.bounds().width).toBe(234);
    expect(picker.bounds().y).toBe(40);
    expect(actionButtons[0]?.getAttribute("aria-expanded")).toBe("true");
    await view.screenshot("MessageReactionPicker.test");
    const celebrate = view.$('[data-testid="actions"] [data-emoji-id="🎉"]');
    (celebrate.element as HTMLButtonElement).click();
    await nextFrame();
    expect(reactions).toEqual(["🎉"]);
    expect(
        view.container.querySelector('[data-testid="actions"] [data-happy2-ui="emoji-picker"]'),
    ).toBeNull();
    actionButtons[2]?.click();
    await nextFrame();
    const menu = view.$('[data-testid="actions"] [data-happy2-ui="menu"]');
    assertParallelRoundedCorners(view.container);
    expect(menu.bounds().width).toBe(196);
    expect(actionButtons[2]?.getAttribute("aria-expanded")).toBe("true");
    const edit = view.$('[data-testid="actions"] [data-item-id="edit"]');
    (edit.element as HTMLButtonElement).click();
    await nextFrame();
    expect(menuSelections).toEqual(["edit"]);
    expect(
        view.container.querySelector('[data-testid="actions"] [data-happy2-ui="menu"]'),
    ).toBeNull();
    /* Escape and an outside pointer both dismiss without selecting an action. */
    actionButtons[2]?.click();
    actionButtons[2]?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    await nextFrame();
    expect(
        view.container.querySelector('[data-testid="actions"] [data-happy2-ui="menu"]'),
    ).toBeNull();
    actionButtons[2]?.click();
    await nextFrame();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextFrame();
    expect(
        view.container.querySelector('[data-testid="actions"] [data-happy2-ui="menu"]'),
    ).toBeNull();
    /* Grouping suppresses repeated identity while retaining the shared gutter. */
    for (const testid of ["grouped-sent", "grouped-sending"] as const) {
        const root = view.$(`[data-testid="${testid}"] [data-happy2-ui="message"]`);
        expect(root.element.hasAttribute("data-grouped")).toBe(true);
        expect(
            root.element.querySelector('[data-happy2-ui="avatar"]'),
            `${testid} avatar`,
        ).toBeNull();
        expect(
            root.element.querySelector('[data-happy2-ui="message-meta"]'),
            `${testid} meta`,
        ).toBeNull();
        expect(
            root.element.querySelector('[data-happy2-ui="message-gutter-time"]'),
            `${testid} gutter time`,
        ).not.toBeNull();
    }
    /* Delivery paint changes without moving or resizing any row part. */
    const sentRoot = view.$('[data-testid="grouped-sent"] [data-happy2-ui="message"]');
    const sendingRoot = view.$('[data-testid="grouped-sending"] [data-happy2-ui="message"]');
    const sentContent = view.$('[data-testid="grouped-sent"] [data-happy2-ui="message-content"]');
    const sendingContent = view.$(
        '[data-testid="grouped-sending"] [data-happy2-ui="message-content"]',
    );
    expect(sendingRoot.bounds()).toEqual(sentRoot.bounds());
    expect(sendingContent.bounds()).toEqual(sentContent.bounds());
    expect(sendingRoot.element.getAttribute("aria-busy")).toBe("true");
    expect(sentContent.computedStyle("opacity")).toBe("1");
    expect(sendingContent.computedStyle("opacity")).toBe("0.56");
    expect(
        sendingRoot.element.querySelector('[data-happy2-ui="message-actions"]'),
        "actions remain unavailable before the message is durable",
    ).toBeNull();
    await view.screenshot("MessageActions.test");
});
it("centers painted ink optically in every Message text-in-a-box part", async () => {
    const view = createRenderer();
    view.render(
        () =>
            stage(
                "o1",
                <Message
                    agent
                    author="Maya Johnson"
                    body={[
                        { kind: "text", text: "Standup: " },
                        { kind: "mention", text: "Claude" },
                        { kind: "text", text: " take " },
                        { kind: "code", text: "MOB-217" },
                        { kind: "text", text: " now" },
                    ]}
                    time="10:42"
                    tone="amber"
                />,
            ),
        { width: 560, height: 80 },
    );
    /* Compact probe body is descender-free so its ink bottom reads the baseline. */
    view.render(
        () =>
            stage(
                "o2",
                <Message
                    actionsVisible
                    compact
                    author="Claude"
                    body="all checks came in clean here"
                    time="10:44"
                />,
            ),
        { width: 560, height: 48 },
    );
    view.render(() => stage("d1", <DayDivider label="Today" />), { width: 560, height: 44 });
    view.render(() => stage("d2", <DayDivider label="Wednesday" />), { width: 560, height: 44 });
    view.render(() => stage("d3", <DayDivider label="Mon, June 3" />), { width: 560, height: 44 });
    /* Pinned chip width puts the ghost add button on an integer x so its icon
       capture is not quantized by fractional emoji/count text advances. */
    view.render(
        () =>
            stage(
                "o3",
                <>
                    <style>{`[data-testid="o3"] .happy2-reaction-chip { width: 44px; }`}</style>
                    <Message
                        author="Sasha K."
                        body="shipping"
                        onReactionAdd={() => {}}
                        reactions={[{ count: 2, emoji: "👍" }]}
                        time="11:02"
                        tone="ocean"
                    />
                </>,
            ),
        { width: 560, height: 110 },
    );
    await view.ready();
    /* ---- Meta row: author + time ink vs the 20px row ---------------------- */
    const meta = view.$('[data-testid="o1"] [data-happy2-ui="message-meta"]');
    const metaRect = meta.element.getBoundingClientRect();
    /* Author is a word label (asymmetric ink left/right by content), so only
       the vertical centroid is asserted. Measured: +0.09 / +0.09 / +0.03. */
    const author = view.$('[data-testid="o1"] [data-happy2-ui="message-author"]');
    const authorInk = await author.visibleMetrics();
    expect(authorInk.pixelCount, "author pixels").toBeGreaterThan(0);
    const authorRowY = author.element.getBoundingClientRect().y - metaRect.y + authorInk.center.y;
    expect(Math.abs(authorRowY - metaRect.height / 2), "author optical y").toBeLessThanOrEqual(
        0.75,
    );
    /* Mono time digits are near-symmetric: both axes. Measured drift
       dx <= 0.31, dy <= 0.17 across engines. */
    const time = view.$('[data-testid="o1"] [data-happy2-ui="message-time"]');
    const timeInk = await time.visibleMetrics();
    expect(timeInk.pixelCount, "time pixels").toBeGreaterThan(0);
    const timeRect = time.element.getBoundingClientRect();
    expect(Math.abs(timeInk.center.x - timeRect.width / 2), "time optical x").toBeLessThanOrEqual(
        0.75,
    );
    const timeRowY = timeRect.y - metaRect.y + timeInk.center.y;
    expect(Math.abs(timeRowY - metaRect.height / 2), "time optical y").toBeLessThanOrEqual(0.75);
    /* AGENT badge pill box centers in the row beside the author (its internal
       label centering is asserted by the Badge suite). */
    const badge = view.$('[data-testid="o1"] [data-happy2-ui="badge"]');
    const badgeRect = badge.element.getBoundingClientRect();
    expect(badgeRect.y - metaRect.y).toBe(1);
    expect(badgeRect.height).toBe(18);
    /* ---- Inline pills: glyph ink centered in the pill background ---------- */
    /* "@Claude" / "MOB-217" ink is horizontally content-weighted (the dense @
       leads), so the pills assert the vertical centroid only. Measured dy:
       mention +0.25 / +0.01 / +0.19, code +0.00 / +0.00 / -0.06. */
    const mentionDrift = await glyphVsPill(() =>
        view.$('[data-testid="o1"] [data-happy2-ui="message-mention"]'),
    );
    expect(Math.abs(mentionDrift.dy), "mention glyph optical y").toBeLessThanOrEqual(0.75);
    const codeDrift = await glyphVsPill(() =>
        view.$('[data-testid="o1"] [data-happy2-ui="message-code"]'),
    );
    expect(Math.abs(codeDrift.dy), "code glyph optical y").toBeLessThanOrEqual(0.75);
    /* ---- Compact gutter time sits on the first body baseline -------------- */
    const gutterTime = view.$('[data-testid="o2"] [data-happy2-ui="message-gutter-time"]');
    const gutterInk = await gutterTime.visibleMetrics();
    expect(gutterInk.pixelCount, "gutter time pixels").toBeGreaterThan(0);
    const compactBody = view.$('[data-testid="o2"] [data-happy2-ui="message-body"]');
    const bodyInk = await compactBody.visibleMetrics();
    expect(bodyInk.pixelCount, "compact body pixels").toBeGreaterThan(0);
    /* Both inks are descender-free, so ink bottoms are baseline proxies.
       Measured delta: 0.00 / 0.26 / 0.00. */
    const gutterBaseline =
        gutterTime.element.getBoundingClientRect().y + gutterInk.bounds.y + gutterInk.bounds.height;
    const bodyBaseline =
        compactBody.element.getBoundingClientRect().y + bodyInk.bounds.y + bodyInk.bounds.height;
    expect(Math.abs(gutterBaseline - bodyBaseline), "gutter time baseline").toBeLessThanOrEqual(
        0.75,
    );
    /* ---- DayDivider pill ---------------------------------------------------- */
    /* "TODAY" is glyph-symmetric enough for both axes. Measured drift
       dx <= 0.16, dy <= 0.33 across engines. */
    const todayDrift = await glyphVsPill(() =>
        view.$('[data-testid="d1"] [data-happy2-ui="day-divider-label"]'),
    );
    expect(Math.abs(todayDrift.dx), "divider TODAY optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(todayDrift.dy), "divider TODAY optical y").toBeLessThanOrEqual(0.75);
    /* Long and punctuated labels have content-weighted ink ("MON," is denser
       than the lone "3"), so they assert the vertical centroid only. */
    for (const testid of ["d2", "d3"] as const) {
        const drift = await glyphVsPill(() =>
            view.$(`[data-testid="${testid}"] [data-happy2-ui="day-divider-label"]`),
        );
        expect(Math.abs(drift.dy), `divider ${testid} optical y`).toBeLessThanOrEqual(0.75);
    }
    /* The advance box is centered via the letter-spacing trim on the right pad. */
    const label = view.$('[data-testid="d1"] [data-happy2-ui="day-divider-label"]');
    expect(label.computedStyles(["letter-spacing", "padding-left", "padding-right"])).toEqual({
        "letter-spacing": "0.66px",
        "padding-left": "10px",
        "padding-right": "9.34px",
    });
    /* The pill is horizontally centered over the divider row. */
    const divider = view.$('[data-testid="d1"] [data-happy2-ui="day-divider"]');
    const dividerBounds = divider.bounds();
    const labelBounds = label.bounds();
    expect(
        Math.abs(
            labelBounds.x + labelBounds.width / 2 - (dividerBounds.x + dividerBounds.width / 2),
        ),
    ).toBeLessThanOrEqual(1);
    /* ---- Ghost add-reaction button: smile glyph centered ------------------- */
    const addButton = view.$('[data-testid="o3"] [data-happy2-ui="message-react-add"]');
    const addIconEl = view.$('[data-testid="o3"] [data-happy2-ui="message-react-add"] svg');
    const iconInk = await addIconEl.visibleMetrics();
    expect(iconInk.pixelCount, "add icon pixels").toBeGreaterThan(0);
    const buttonRect = addButton.element.getBoundingClientRect();
    const iconRect = addIconEl.element.getBoundingClientRect();
    const iconDx = iconRect.x - buttonRect.x + iconInk.center.x - buttonRect.width / 2;
    const iconDy = iconRect.y - buttonRect.y + iconInk.center.y - buttonRect.height / 2;
    expect(Math.abs(iconDx), "add icon optical x").toBeLessThanOrEqual(0.75);
    expect(Math.abs(iconDy), "add icon optical y").toBeLessThanOrEqual(0.75);
});
it("renders only http/https/mailto Markdown targets as live hrefs", async () => {
    const view = createRenderer();
    /* A `data:image` src (permitted by the library sanitizer for `<img>`), a
       `file:` link, and a bare `#fragment` link must all render inert — the
       navigation allowlist admits only absolute http/https/mailto targets. */
    view.render(
        () =>
            stage(
                "nav",
                <Message
                    agent
                    author="Codex"
                    body={
                        "![inline](data:image/svg+xml;base64,PHN2Zy8+)\n\n" +
                        "[local file](file:///etc/passwd) and " +
                        "[jump](#section) but [email](mailto:team@example.com) and " +
                        "[site](https://example.com/x) work."
                    }
                    generationStatus="complete"
                    initials="CX"
                    time="11:20"
                    tone="mint"
                />,
            ),
        { width: 560, height: 140 },
    );
    await view.ready();
    const navBody = view.$('[data-testid="nav"] [data-happy2-ui="message-body"]');
    const linkByText = (text: string) =>
        [...navBody.element.querySelectorAll<HTMLAnchorElement>("a")].find(
            (anchor) => anchor.textContent?.trim() === text,
        );
    /* A `data:image/svg+xml` image renders as an inert labelled link — never an
       implicit fetch and never a navigable data: href. */
    const dataImage = view.$('[data-testid="nav"] [data-happy2-ui="message-md-image"]');
    expect(dataImage.element.tagName).toBe("A");
    expect(dataImage.element.getAttribute("href"), "data:image href is stripped").toBeNull();
    expect(dataImage.element.getAttribute("data-md-src")).toBeNull();
    /* file: and bare #fragment targets are inert; http(s)/mailto navigate. */
    expect(linkByText("local file")?.getAttribute("href"), "file: href is stripped").toBeNull();
    expect(linkByText("jump")?.getAttribute("href"), "#fragment href is stripped").toBeNull();
    expect(linkByText("email")?.getAttribute("href")).toBe("mailto:team@example.com");
    expect(linkByText("site")?.getAttribute("href")).toBe("https://example.com/x");
});
it("anchors MessageList to the bottom and lays out sparse histories", async () => {
    const view = createRenderer();
    view.render(
        () =>
            stage(
                "sparse",
                <MessageList
                    intro={{
                        description: "Ship mobile v2 by Friday. Humans and agents coordinate here.",
                        title: "Welcome to #launch-week",
                    }}
                >
                    <DayDivider label="Today" />
                    <Message
                        author="Maya Johnson"
                        body="Standup: notifications bug is the last blocker."
                        data-testid="sparse-first"
                        time="10:42"
                        tone="amber"
                    />
                    <Message
                        compact
                        author="Maya Johnson"
                        body="Kicking off the fix now."
                        data-testid="sparse-last"
                        time="10:43"
                    />
                </MessageList>,
            ),
        { width: 620, height: 360 },
    );
    await view.ready();
    /* ---- Sparse history bottom-anchors ---------------------------------- */
    const sparse = view.$('[data-testid="sparse"] [data-happy2-ui="message-list"]');
    expect(sparse.bounds().height).toBe(360);
    /* Scrollport edge-to-edge; the inner content wrapper owns the 12px top/bottom
       breathing room. */
    expect(
        sparse.computedStyles([
            "display",
            "flex-direction",
            "overflow-y",
            "padding-bottom",
            "padding-top",
        ]),
    ).toEqual({
        display: "flex",
        "flex-direction": "column",
        "overflow-y": "auto",
        "padding-bottom": "0px",
        "padding-top": "0px",
    });
    expect(
        view
            .$('[data-testid="sparse"] [data-happy2-ui="message-list-content"]')
            .computedStyles(["padding-bottom", "padding-top"]),
    ).toEqual({
        "padding-bottom": "12px",
        "padding-top": "12px",
    });
    /* No scrolling needed. */
    expect(sparse.element.scrollHeight).toBe(sparse.element.clientHeight);
    expect(sparse.element.scrollTop).toBe(0);
    /* The spacer absorbs the free space above the history. */
    const spacer = view.$('[data-testid="sparse"] [data-happy2-ui="message-list-spacer"]');
    expect(spacer.bounds().height).toBe(0);
    const intro = view.$('[data-testid="sparse"] [data-happy2-ui="message-list-intro"]');
    expect(intro.offsets().top).toBeGreaterThan(80);
    /* The newest message sits exactly against the 12px bottom padding. */
    const lastMessage = view.$('[data-testid="sparse-last"]');
    const lastBottom = lastMessage.bounds().y + lastMessage.bounds().height;
    expect(Math.abs(lastBottom - (sparse.bounds().y + 360 - 12))).toBeLessThanOrEqual(1);
    /* Chronology preserved: intro, divider, first, last from top to bottom. */
    const divider = view.$('[data-testid="sparse"] [data-happy2-ui="day-divider"]');
    const firstMessage = view.$('[data-testid="sparse-first"]');
    expect(intro.bounds().y).toBeLessThan(divider.bounds().y);
    expect(divider.bounds().y).toBeLessThan(firstMessage.bounds().y);
    expect(firstMessage.bounds().y).toBeLessThan(lastMessage.bounds().y);
    /* Intro typography. */
    const title = view.$('[data-testid="sparse"] [data-happy2-ui="message-list-intro-title"]');
    expect(title.textMetrics().font.size).toBe(17);
    expect(title.textMetrics().font.weight).toBe("800");
    expect(title.textMetrics().font.lineHeight).toBe(24);
    expect((await title.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const description = view.$(
        '[data-testid="sparse"] [data-happy2-ui="message-list-intro-description"]',
    );
    expect(description.computedStyles(["color", "font-size", "line-height"])).toEqual({
        color: "rgb(165, 160, 176)",
        "font-size": "13px",
        "line-height": "20px",
    });
    expect((await description.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    /* ---- DayDivider geometry --------------------------------------------- */
    const label = view.$('[data-testid="sparse"] [data-happy2-ui="day-divider-label"]');
    expect(label.bounds().height).toBe(20);
    expect(
        label.computedStyles([
            "background-color",
            "border-radius",
            "color",
            "font-size",
            "font-weight",
            "text-transform",
        ]),
    ).toEqual({
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-radius": "999px",
        color: "rgb(165, 160, 176)",
        "font-size": "11px",
        "font-weight": "700",
        "text-transform": "uppercase",
    });
    expect(label.textMetrics().font.family).toBe("happy2 Mono, ui-monospace, monospace");
    const lines = view.container.querySelectorAll(
        '[data-testid="sparse"] [data-happy2-ui="day-divider-line"]',
    );
    expect(lines.length).toBe(2);
    const line = view.$('[data-testid="sparse"] [data-happy2-ui="day-divider-line"]');
    expect(line.bounds().height).toBe(1);
    expect(line.computedStyle("background-color")).toBe("rgba(255, 255, 255, 0.07)");
    await view.screenshot("MessageList.test");
});
it("virtualizes long MessageList histories with bounded mounted rows", async () => {
    const view = createRenderer();
    view.render(
        () =>
            stage(
                "virtual-feed",
                <MessageList virtualize>
                    {Array.from({ length: 1_000 }, (_, index) => (
                        <div data-testid={`virtual-${index}`} key={index} style={{ height: 44 }}>
                            Message {index + 1}
                        </div>
                    ))}
                </MessageList>,
            ),
        { width: 620, height: 360 },
    );
    await view.ready();
    await nextFrame();
    const list = view.$('[data-testid="virtual-feed"] [data-happy2-ui="message-list"]');
    const mounted = list.element.querySelectorAll(
        '[data-happy2-ui="message-list-virtual"] > [data-index]',
    );
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(80);
    expect(list.element.scrollHeight).toBeGreaterThan(40_000);
    expect(list.element.querySelector('[data-testid="virtual-0"]')).toBeNull();
    expect(list.element.querySelector('[data-testid="virtual-999"]')).not.toBeNull();
});
it("follows the newest content in MessageList unless the reader scrolled up", async () => {
    const view = createRenderer();
    let setExtra!: (extra: string[]) => void;
    function MessageFeedFixture() {
        const [extra, updateExtra] = useState<string[]>([]);
        setExtra = updateExtra;
        return stage(
            "feed",
            <MessageList>
                <DayDivider label="Yesterday" />
                {Array.from({ length: 14 }, (_, index) => (
                    <Message
                        key={index}
                        author={index % 2 === 0 ? "Maya Johnson" : "Sasha K."}
                        body={`Update ${index + 1}: cold-start retry landed, watching the device farm for regressions.`}
                        data-testid={`long-${index}`}
                        time={`10:${String(10 + index).padStart(2, "0")}`}
                        tone={index % 2 === 0 ? "amber" : "ocean"}
                    />
                ))}
                {extra.map((body, index) => (
                    <Message
                        key={index}
                        compact
                        author="Sasha K."
                        body={body}
                        data-testid={`extra-${index}`}
                        time="11:00"
                    />
                ))}
            </MessageList>,
        );
    }
    view.render(MessageFeedFixture, { width: 620, height: 360 });
    await view.ready();
    const list = view.$('[data-testid="feed"] [data-happy2-ui="message-list"]');
    const element = list.element as HTMLDivElement;
    const maxScroll = () => element.scrollHeight - element.clientHeight;
    const atBottom = () => Math.abs(element.scrollTop - maxScroll()) <= 1;
    /* Long history overflows and the spacer collapses. */
    expect(element.scrollHeight).toBeGreaterThan(element.clientHeight + 200);
    expect(
        view.$('[data-testid="feed"] [data-happy2-ui="message-list-spacer"]').bounds().height,
    ).toBe(0);
    /* The Slack-style scrollbar chrome (`.happy2-message-list` scrollbar-width /
       scrollbar-color and the ::-webkit-scrollbar thumb) is intentionally not
       asserted here: native scrollbar rendering is not measurable cross-engine
       — WebKit omits the standard properties, Chromium hides them behind
       pseudo-elements unreachable from computed style, and headless Firefox
       normalizes the value. It is a token-only, progressive-enhancement layer
       verified visually against the running app. */
    /* On mount the list shows the newest message: scrolled to the bottom,
       with the last message resting on the 12px bottom padding. */
    expect(atBottom(), "mounted at bottom").toBe(true);
    const lastLong = view.$('[data-testid="long-13"]');
    expect(
        Math.abs(lastLong.bounds().y + lastLong.bounds().height - (list.bounds().y + 360 - 12)),
    ).toBeLessThanOrEqual(1);
    /* Chronology preserved top to bottom. */
    expect(view.$('[data-testid="long-0"]').bounds().y).toBeLessThan(
        view.$('[data-testid="long-1"]').bounds().y,
    );
    /* Appending while at the bottom sticks to the bottom. */
    flushSync(() => setExtra(["Green on the device farm — merging."]));
    await nextFrame();
    expect(atBottom(), "still at bottom after append").toBe(true);
    const appended = view.$('[data-testid="extra-0"]');
    expect(
        Math.abs(appended.bounds().y + appended.bounds().height - (list.bounds().y + 360 - 12)),
    ).toBeLessThanOrEqual(1);
    /* Scrolling up parks the viewport; appending must not move it. */
    element.scrollTop = 40;
    await nextFrame();
    await nextFrame(); /* engines deliver the scroll event on the next frame */
    const parked = element.scrollTop;
    expect(parked).toBeLessThan(maxScroll() - 100);
    flushSync(() =>
        setExtra(["Green on the device farm — merging.", "Release notes are drafted."]),
    );
    await nextFrame();
    await nextFrame();
    expect(element.scrollTop, "parked reader stays parked").toBe(parked);
    /* Returning to the bottom re-engages following. */
    element.scrollTop = maxScroll();
    await nextFrame();
    await nextFrame();
    flushSync(() =>
        setExtra([
            "Green on the device farm — merging.",
            "Release notes are drafted.",
            "Tagged v2.0.0 — shipping.",
        ]),
    );
    await nextFrame();
    expect(atBottom(), "follows again after returning to bottom").toBe(true);
});
it("reveals the grouped gutter time on hover, tightens grouped rows, and lays out media without a text body", async () => {
    const view = createRenderer();
    const photo = (w: number, h: number) =>
        `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='rgb(139,124,247)'/></svg>`)}`;
    view.render(
        () => stage("g-hidden", <Message compact author="Ada" body="ok" time="12:55 AM" />),
        {
            width: 480,
            height: 60,
        },
    );
    view.render(
        () =>
            stage(
                "g-shown",
                <Message
                    actionsVisible
                    compact
                    author="Ada"
                    body="ok"
                    gutterTime="12:55"
                    time="12:55 AM"
                />,
            ),
        { width: 480, height: 60 },
    );
    view.render(() => stage("first", <Message author="Ada Lovelace" body="ok" time="12:55 AM" />), {
        width: 480,
        height: 80,
    });
    view.render(
        () =>
            stage(
                "photo-only",
                <Message
                    author="Ada"
                    body=""
                    images={[
                        { id: "p", url: photo(760, 420), alt: "shot", width: 760, height: 420 },
                    ]}
                    onImageOpen={() => {}}
                    time="11:14"
                />,
            ),
        { width: 480, height: 320 },
    );
    view.render(
        () =>
            stage(
                "photo-text",
                <Message
                    author="Ada"
                    body="look"
                    images={[
                        { id: "pt", url: photo(760, 420), alt: "shot", width: 760, height: 420 },
                    ]}
                    onImageOpen={() => {}}
                    time="11:14"
                />,
            ),
        { width: 480, height: 360 },
    );
    await view.ready();
    /* Grouped gutter time: hidden by default, revealed on hover / forced actions. */
    const hidden = view.$('[data-testid="g-hidden"] [data-happy2-ui="message-gutter-time"]');
    expect(hidden.computedStyle("opacity"), "grouped time hidden by default").toBe("0");
    const shown = view.$('[data-testid="g-shown"] [data-happy2-ui="message-gutter-time"]');
    expect(shown.computedStyle("opacity"), "grouped time revealed").toBe("1");
    /* The compact gutter time ("12:55", not the wide "12:55 AM") fits the 36px
       gutter and keeps the full 12px gutter gap to the body — never touching it. */
    expect(shown.element.textContent).toBe("12:55");
    expect(shown.bounds().width, "compact gutter time fits the gutter").toBeLessThanOrEqual(40);
    const shownRoot = view.$('[data-testid="g-shown"] [data-happy2-ui="message"]');
    const shownBody = view.$('[data-testid="g-shown"] [data-happy2-ui="message-body"]');
    const timeRight = shown.bounds().x + shown.bounds().width;
    expect(shownBody.bounds().x - timeRight, "gutter time → body gap").toBeGreaterThanOrEqual(8);
    expect(shown.bounds().x, "gutter time stays within the row").toBeGreaterThanOrEqual(
        shownRoot.bounds().x,
    );
    /* First message: inline time, always visible; no separate gutter time. */
    const firstTime = view.$('[data-testid="first"] [data-happy2-ui="message-time"]');
    expect(firstTime.computedStyle("opacity")).toBe("1");
    expect(
        view.container.querySelector(
            '[data-testid="first"] [data-happy2-ui="message-gutter-time"]',
        ),
    ).toBeNull();
    /* Grouped rows tighten symmetrically (2px top and bottom) so a run of
       follow-ups reads as one block and the single line of text stays centered
       in its hover row; a fresh author group keeps the standard 6px. */
    const groupedRoot = view.$('[data-testid="g-hidden"] [data-happy2-ui="message"]');
    expect(groupedRoot.computedStyle("padding-top")).toBe("2px");
    expect(groupedRoot.computedStyle("padding-bottom")).toBe("2px");
    expect(
        view.$('[data-testid="first"] [data-happy2-ui="message"]').computedStyle("padding-top"),
    ).toBe("6px");
    /* Body line-height contract, guarded against regression. */
    expect(shownBody.computedStyle("line-height")).toBe("22px");
    /* Photo-only messages use a small inset; media below text keeps the larger
       separation. The row's own padding supplies the shared trailing edge. */
    expect(
        view.container.querySelector('[data-testid="photo-only"] [data-happy2-ui="message-body"]'),
    ).toBeNull();
    expect(
        view
            .$('[data-testid="photo-only"] [data-happy2-ui="message-media"]')
            .computedStyle("margin-top"),
        "media inset without a body",
    ).toBe("4px");
    expect(
        view
            .$('[data-testid="photo-text"] [data-happy2-ui="message-media"]')
            .computedStyle("margin-top"),
        "media keeps its gap under a body",
    ).toBe("8px");
    /* A single photo with metadata reserves a stable, aspect-correct box. */
    const item = view.$('[data-testid="photo-only"] [data-happy2-ui="message-media-item"]');
    expect(item.element.hasAttribute("data-fixed"), "fixed box from metadata").toBe(true);
    const box = item.bounds();
    expect(
        Math.abs(box.width / box.height - 760 / 420),
        "box keeps the source aspect",
    ).toBeLessThanOrEqual(0.03);
    expect(box.width, "box width is capped").toBeLessThanOrEqual(380);
    expect(
        view
            .$('[data-testid="photo-only"] [data-happy2-ui="message-media-image"]')
            .computedStyle("object-fit"),
    ).toBe("cover");
});
it("renders string bodies as safe streaming Markdown", async () => {
    const view = createRenderer();
    /* Complete: full semantic Markdown — heading, list, emphasis, inline and
       fenced code, a safe link, and a deliberately unsafe javascript: link. */
    view.render(
        () =>
            stage(
                "md",
                <Message
                    agent
                    author="Codex"
                    body={
                        "## Cold-start fix\n\n" +
                        "Moved registration behind the **handshake** promise with `handshake.settled`.\n\n" +
                        "- Registers after settle\n" +
                        "- Retries on cold start\n\n" +
                        "```ts\nconst token = requestPushToken();\n```\n\n" +
                        "| Check | Result |\n| --- | --- |\n| Compiler | ~~pending~~ complete |\n\n" +
                        "Safe [launch checklist](https://example.com/launch) and " +
                        "unsafe [do not run](javascript:alert(1))."
                    }
                    generationStatus="complete"
                    initials="CX"
                    time="10:58"
                    tone="mint"
                />,
            ),
        { width: 560, height: 390 },
    );
    /* Untrusted raw HTML and Markdown images: none may create a live <img> or
       <script>, trigger an implicit network load, or nest interactive links. */
    view.render(
        () =>
            stage(
                "md-unsafe",
                <Message
                    agent
                    author="Codex"
                    body={
                        'Injected <img src=x onerror="window.__pwned=1"> and ' +
                        "<script>window.__pwned=1</script>.\n\n" +
                        "![diagram](https://cdn.example.com/diagram.png)\n\n" +
                        "[*![preview](https://cdn.example.com/preview.png)*]" +
                        "(https://example.com/full)"
                    }
                    generationStatus="complete"
                    initials="CX"
                    time="10:59"
                    tone="mint"
                />,
            ),
        { width: 560, height: 160 },
    );
    /* Streaming: an incomplete reply (open heading + unterminated fenced code)
       renders gracefully as it arrives, a caret marks the live cursor, and the
       content stays at full opacity. */
    view.render(
        () =>
            stage(
                "md-stream",
                <Message
                    agent
                    author="Codex"
                    body={"## Result\n\n```ts\nconst answer = 42"}
                    generationStatus="streaming"
                    initials="CX"
                    time="11:00"
                    tone="mint"
                />,
            ),
        { width: 560, height: 140 },
    );
    /* Complete but malformed: an unclosed `**live` now stays visible verbatim
       — final Markdown is never silently hidden. */
    view.render(
        () =>
            stage(
                "md-malformed",
                <Message
                    agent
                    author="Codex"
                    body={"Tracking totals **live"}
                    generationStatus="complete"
                    initials="CX"
                    time="11:00"
                    tone="mint"
                />,
            ),
        { width: 560, height: 90 },
    );
    /* Failed: a minimal danger marker; the partial body remains fully visible. */
    view.render(
        () =>
            stage(
                "md-failed",
                <Message
                    agent
                    author="Codex"
                    body={"Partial answer before the run failed."}
                    generationStatus="failed"
                    initials="CX"
                    time="11:01"
                    tone="mint"
                />,
            ),
        { width: 560, height: 90 },
    );
    await view.ready();
    /* ---- Semantic Markdown rendering ----------------------------------- */
    const mdBody = view.$('[data-testid="md"] [data-happy2-ui="message-body"]');
    expect(mdBody.element.getAttribute("data-markdown")).toBe("");
    expect(mdBody.computedStyles(["color", "font-size", "line-height"])).toEqual({
        color: "rgb(237, 234, 242)",
        "font-size": "15px",
        "line-height": "22px",
    });
    const mdRoot = view.$('[data-testid="md"] [data-happy2-ui="message"]');
    expect(mdRoot.element.getAttribute("data-generation-status")).toBe("complete");
    expect(mdRoot.element.getAttribute("aria-busy")).toBeNull();
    const heading = mdBody.element.querySelector("h2");
    expect(heading?.textContent).toBe("Cold-start fix");
    expect(heading?.hasAttribute("id")).toBe(false);
    const listItems = mdBody.element.querySelectorAll("ul > li");
    expect(listItems.length).toBe(2);
    expect(mdBody.element.querySelector("strong")?.textContent).toBe("handshake");
    const inlineCode = mdBody.element.querySelector("code:not(pre code)");
    expect(inlineCode?.textContent).toBe("handshake.settled");
    const preCode = mdBody.element.querySelector("pre code");
    expect(preCode?.textContent).toContain("const token = requestPushToken();");
    expect(preCode?.textContent).not.toContain("```");
    const table = mdBody.element.querySelector("table");
    expect(table?.querySelector("th")?.textContent).toBe("Check");
    expect(table?.querySelector("td")?.textContent).toBe("Compiler");
    expect(table?.querySelector("del")?.textContent).toBe("pending");
    expect((table as HTMLElement).scrollWidth).toBeGreaterThanOrEqual(
        (table as HTMLElement).clientWidth,
    );
    /* ---- Multi-block stacking: 8px gap between adjacent blocks ---------- */
    /* The Markdown renderer emits every block as a direct body child, so the
       body's `> * + *` 8px rule is truthful. Adjacent blocks must sit exactly
       8px apart (no leftover UA margin or wrapper masking the rule). */
    const mdBlocks = [...mdBody.element.children].filter(
        (node): node is HTMLElement =>
            node instanceof HTMLElement &&
            !node.classList.contains("happy2-message__caret") &&
            !node.classList.contains("happy2-message__gen-failed"),
    );
    expect(mdBlocks.length, "markdown compiled to direct block children").toBeGreaterThanOrEqual(4);
    for (let index = 1; index < mdBlocks.length; index += 1) {
        const previous = mdBlocks[index - 1]!.getBoundingClientRect();
        const current = mdBlocks[index]!.getBoundingClientRect();
        expect(
            Math.abs(current.top - previous.bottom - 8),
            `block ${index} sits 8px below block ${index - 1}`,
        ).toBeLessThanOrEqual(0.75);
    }
    /* ---- Safe links ---------------------------------------------------- */
    const links = [
        ...mdBody.element.querySelectorAll<HTMLAnchorElement>('[data-happy2-ui="message-md-link"]'),
    ];
    const safe = links.find((link) => link.textContent === "launch checklist");
    expect(safe).toBeDefined();
    expect(safe!.tagName).toBe("A");
    expect(safe!.getAttribute("href")).toBe("https://example.com/launch");
    expect(safe!.getAttribute("target")).toBe("_blank");
    expect(safe!.getAttribute("rel")).toContain("noopener");
    expect(safe!.getAttribute("rel")).toContain("noreferrer");
    /* A javascript: URL is stripped — the anchor renders but cannot navigate. */
    const unsafe = links.find((link) => link.textContent === "do not run");
    expect(unsafe).toBeDefined();
    expect(unsafe!.getAttribute("href")).toBeNull();
    /* ---- Raw HTML + image safety --------------------------------------- */
    const unsafeBody = view.$('[data-testid="md-unsafe"] [data-happy2-ui="message-body"]');
    expect(unsafeBody.element.querySelector("img"), "no live <img> from raw HTML").toBeNull();
    expect(unsafeBody.element.querySelector("script"), "no <script> from raw HTML").toBeNull();
    expect(unsafeBody.element.textContent).toContain("onerror");
    expect(
        (
            window as unknown as {
                __pwned?: number;
            }
        ).__pwned,
        "no injected handler executed",
    ).toBeUndefined();
    /* A Markdown image is a safe labelled link, never an implicit <img> fetch. */
    const mdImage = view.$('[data-testid="md-unsafe"] [data-happy2-ui="message-md-image"]');
    expect(mdImage.element.tagName).toBe("A");
    expect(mdImage.element.getAttribute("href")).toBe("https://cdn.example.com/diagram.png");
    expect(mdImage.element.getAttribute("data-md-src")).toBe("https://cdn.example.com/diagram.png");
    expect(mdImage.element.textContent).toBe("diagram");
    /* A linked image contributes labelled content to its one outer anchor;
       nested interactive elements are invalid and produce ambiguous focus. */
    const linkedImage = view.$(
        '[data-testid="md-unsafe"] [data-md-src="https://cdn.example.com/preview.png"]',
    );
    expect(linkedImage.element.tagName).toBe("SPAN");
    expect(linkedImage.element.textContent).toBe("preview");
    const linkedImageAnchor = linkedImage.element.closest("a");
    expect(linkedImageAnchor?.tagName).toBe("A");
    expect(linkedImageAnchor?.getAttribute("href")).toBe("https://example.com/full");
    expect(linkedImageAnchor?.querySelector("a"), "no nested anchor").toBeNull();
    /* ---- Streaming affordance + incomplete syntax ---------------------- */
    const streamRoot = view.$('[data-testid="md-stream"] [data-happy2-ui="message"]');
    expect(streamRoot.element.getAttribute("data-generation-status")).toBe("streaming");
    expect(streamRoot.element.getAttribute("aria-busy")).toBe("true");
    const streamBody = view.$('[data-testid="md-stream"] [data-happy2-ui="message-body"]');
    /* Incomplete markdown streams gracefully: the heading resolves and the
       unterminated fence still renders its partial code as a visible block. */
    expect(streamBody.element.querySelector("h2")?.textContent).toBe("Result");
    const streamCode = streamBody.element.querySelector("pre code");
    expect(streamCode?.textContent).toContain("const answer = 42");
    const caret = view.$('[data-testid="md-stream"] [data-happy2-ui="message-stream-caret"]');
    expect(caret.bounds().width).toBe(8);
    expect(caret.bounds().height).toBe(15);
    expect(caret.computedStyle("background-color")).toBe("rgb(139, 124, 247)");
    /* Streamed content is never dimmed — that treatment is reserved for delivery. */
    const streamContent = view.$('[data-testid="md-stream"] [data-happy2-ui="message-content"]');
    expect(streamContent.computedStyle("opacity")).toBe("1");
    /* The caret is excluded from the 8px block stack, so it lands directly after
       the trailing content (not dropped a block-gap below it) and stays visible
       inside the body row rather than clipped past its bottom. */
    const streamBlocks = [...streamBody.element.children].filter(
        (node): node is HTMLElement =>
            node instanceof HTMLElement && !node.classList.contains("happy2-message__caret"),
    );
    const lastStreamBlock = streamBlocks[streamBlocks.length - 1]!.getBoundingClientRect();
    const caretRect = caret.element.getBoundingClientRect();
    const streamBodyRect = streamBody.element.getBoundingClientRect();
    expect(
        caretRect.top - lastStreamBlock.bottom,
        "caret follows content without a block gap",
    ).toBeLessThan(8);
    expect(caretRect.bottom, "caret stays within the body row").toBeLessThanOrEqual(
        streamBodyRect.bottom + 0.75,
    );
    /* ---- Final malformed Markdown stays visible ------------------------ */
    const malformedRoot = view.$('[data-testid="md-malformed"] [data-happy2-ui="message"]');
    expect(malformedRoot.element.getAttribute("aria-busy")).toBeNull();
    const malformedBody = view.$('[data-testid="md-malformed"] [data-happy2-ui="message-body"]');
    expect(malformedBody.element.textContent).toContain("**live");
    expect(
        view.container.querySelector(
            '[data-testid="md-malformed"] [data-happy2-ui="message-stream-caret"]',
        ),
        "no caret once generation settles",
    ).toBeNull();
    /* ---- Failed marker ------------------------------------------------- */
    const failedRoot = view.$('[data-testid="md-failed"] [data-happy2-ui="message"]');
    expect(failedRoot.element.getAttribute("data-generation-status")).toBe("failed");
    expect(failedRoot.element.getAttribute("aria-busy")).toBeNull();
    const failed = view.$('[data-testid="md-failed"] [data-happy2-ui="message-generation-failed"]');
    expect(failed.element.getAttribute("aria-label")).toBe("Generation failed");
    expect(failed.computedStyle("background-color")).toBe("rgb(248, 113, 113)");
    const failedParagraph = view.$('[data-testid="md-failed"] [data-happy2-ui="message-body"] p');
    const failedParagraphBounds = failedParagraph.bounds();
    const failedBounds = failed.bounds();
    expect(failedBounds.y, "failure marker overlaps the final text line").toBeLessThan(
        failedParagraphBounds.y + failedParagraphBounds.height,
    );
    expect(
        failedBounds.y + failedBounds.height,
        "failure marker overlaps the final text line",
    ).toBeGreaterThan(failedParagraphBounds.y);
    /* The partial reply is still readable at full opacity. */
    const failedContent = view.$('[data-testid="md-failed"] [data-happy2-ui="message-content"]');
    expect(failedContent.computedStyle("opacity")).toBe("1");
    await view.screenshot("Message.markdown.test");
});
it("preserves Message DOM identity while a streamed Markdown body advances", async () => {
    let streamUpdate = (_next: { body: string; status: "streaming" | "complete" }) => {};
    function StreamingMessage() {
        const [stream, setStream] = useState<{
            body: string;
            status: "streaming" | "complete";
        }>({
            body: "Checking the **compiler**",
            status: "streaming",
        });
        streamUpdate = setStream;
        return stage(
            "stream-identity",
            <Message
                agent
                author="Codex"
                body={stream.body}
                generationStatus={stream.status}
                initials="CX"
                time="11:02"
                tone="mint"
            />,
        );
    }
    const view = createRenderer().render(() => <StreamingMessage />, {
        width: 560,
        height: 100,
    });
    await view.ready();
    const row = view.$('[data-testid="stream-identity"] [data-happy2-ui="message"]').element;
    const body = view.$('[data-testid="stream-identity"] [data-happy2-ui="message-body"]').element;
    expect(body.querySelector("strong")?.textContent).toBe("compiler");
    expect(body.querySelector('[data-happy2-ui="message-stream-caret"]')).not.toBeNull();

    flushSync(() => streamUpdate({ body: "The **compiler** is ready.", status: "complete" }));
    await nextFrame();

    expect(view.$('[data-testid="stream-identity"] [data-happy2-ui="message"]').element).toBe(row);
    expect(view.$('[data-testid="stream-identity"] [data-happy2-ui="message-body"]').element).toBe(
        body,
    );
    expect(body.textContent).toContain("The compiler is ready.");
    expect(body.querySelector('[data-happy2-ui="message-stream-caret"]')).toBeNull();
});
it("centers SystemNotice service lines and lifts @user / #channel refs", async () => {
    const view = createRenderer();
    view.render(() => stage("n1", <SystemNotice text="@ada joined #welcome" />), {
        width: 560,
        height: 44,
    });
    view.render(() => stage("n2", <SystemNotice text="@bob joined the server" />), {
        width: 560,
        height: 44,
    });
    view.render(
        () => stage("n3", <SystemNotice text="@caroline-ng was added to #announcements by @ada" />),
        { width: 560, height: 44 },
    );
    await view.ready();
    /* ---- Row contract: full-bleed, centered flex, 6/20 padding ------------ */
    const notice = view.$('[data-testid="n1"] [data-happy2-ui="system-notice"]');
    expect(
        notice.computedStyles([
            "display",
            "align-items",
            "justify-content",
            "box-sizing",
            "column-gap",
            "padding-top",
            "padding-bottom",
            "padding-left",
            "padding-right",
        ]),
    ).toEqual({
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "box-sizing": "border-box",
        "column-gap": "8px",
        "padding-top": "6px",
        "padding-bottom": "6px",
        "padding-left": "20px",
        "padding-right": "20px",
    });
    expect(notice.element.getAttribute("role")).toBe("note");
    expect(notice.element.getAttribute("aria-label")).toBe("@ada joined #welcome");
    /* ---- Text + ref color/weight contract --------------------------------- */
    const text = view.$('[data-testid="n1"] [data-happy2-ui="system-notice-text"]');
    expect(text.computedStyles(["color", "font-size", "font-weight", "line-height"])).toEqual({
        color: "rgb(117, 112, 133)",
        "font-size": "13px",
        "font-weight": "400",
        "line-height": "20px",
    });
    const refs = view.container.querySelectorAll(
        '[data-testid="n1"] [data-happy2-ui="system-notice-ref"]',
    );
    /* Tokenizer splits both the @user and #channel refs out of the plain runs. */
    expect(Array.from(refs, (node) => node.textContent)).toEqual(["@ada", "#welcome"]);
    const firstRef = view.$('[data-testid="n1"] [data-happy2-ui="system-notice-ref"]');
    expect(firstRef.computedStyles(["color", "font-weight"])).toEqual({
        color: "rgb(165, 160, 176)",
        "font-weight": "500",
    });
    /* The by-@ada actor and both refs survive in a multi-ref line. */
    const refs3 = view.container.querySelectorAll(
        '[data-testid="n3"] [data-happy2-ui="system-notice-ref"]',
    );
    expect(Array.from(refs3, (node) => node.textContent)).toEqual([
        "@caroline-ng",
        "#announcements",
        "@ada",
    ]);
    /* ---- Leading glyph: faint, 14px, painted -------------------------------- */
    const iconSlot = view.$('[data-testid="n1"] [data-happy2-ui="system-notice-icon"]');
    expect(iconSlot.computedStyle("color")).toBe("rgb(85, 81, 95)");
    const iconSvg = view.$('[data-testid="n1"] [data-happy2-ui="system-notice-icon"] svg');
    const iconBounds = iconSvg.bounds();
    expect(iconBounds.width).toBe(14);
    expect(iconBounds.height).toBe(14);
    const iconInk = await iconSvg.visibleMetrics();
    expect(iconInk.pixelCount, "notice icon pixels").toBeGreaterThan(0);
    /* ---- The icon+text group is centered as a unit over the row ----------- */
    const noticeBounds = notice.bounds();
    const textBounds = text.bounds();
    const groupLeft = iconBounds.x;
    const groupRight = textBounds.x + textBounds.width;
    const groupCenter = (groupLeft + groupRight) / 2;
    expect(
        Math.abs(groupCenter - (noticeBounds.x + noticeBounds.width / 2)),
        "notice content group optical x",
    ).toBeLessThanOrEqual(1);
    /* The glyph slot centers vertically against the text line box. */
    const iconCenterY = iconBounds.y + iconBounds.height / 2;
    const textCenterY = textBounds.y + textBounds.height / 2;
    expect(
        Math.abs(iconCenterY - textCenterY),
        "notice glyph vs text center y",
    ).toBeLessThanOrEqual(1);
    await view.screenshot("Message.systemNotice.test");
});
