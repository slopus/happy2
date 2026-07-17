import { expect, it } from "vitest";
import "./theme.css";
import "./styles/member-list.css";
import "./styles/avatar.css";
import "./styles/badge.css";
import "./styles/button.css";
import "./styles/icon.css";
import { Button } from "./Button";
import { MemberList, type MemberItem } from "./MemberList";
import { createRenderer, type RenderedElement } from "./testing";

/*
 * MemberList introduces no glyphs of its own: every painted mark (Avatar,
 * Badge, Button) is a primitive that is already optically tuned in its own
 * test, so this file asserts LAYOUT — the 56px row grid, lane geometry,
 * typography contract, role-badge tokens, and trailing right-alignment — plus
 * the one symmetric optical center MemberList is responsible for placing: the
 * filled avatar disc centered in its row. Word ink (names, badge labels) is
 * asymmetric, so it is checked as line-box symmetry / paint, never centroid.
 */
const OPTICAL = 0.4;

const fontFamily = "happy2 Figtree, system-ui, sans-serif";

/* 1×1 PNG data URI: deterministic, no network dependency in the fixture. */
const IMG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const rosterMembers: MemberItem[] = [
    {
        id: "ada",
        initials: "AL",
        name: "Ada Lovelace",
        presence: "online",
        role: "owner",
        title: "Founder & CEO",
        tone: "violet",
    },
    {
        id: "grace",
        initials: "GH",
        name: "Grace Hopper",
        presence: "offline",
        role: "admin",
        title: "Systems Lead",
        tone: "ocean",
    },
    {
        id: "linus",
        initials: "LT",
        name: "Linus Torvalds",
        presence: "online",
        role: "member",
        tone: "amber",
        username: "linus",
    },
    {
        id: "katherine",
        initials: "KJ",
        name: "Katherine Johnson",
        presence: "offline",
        role: "member",
        title: "Mathematician",
        tone: "mint",
    },
];

const rowIds = ["ada", "grace", "linus", "katherine"] as const;

const subtitleText: Record<string, string> = {
    ada: "Founder & CEO",
    grace: "Systems Lead",
    linus: "@linus",
    katherine: "Mathematician",
};

const roleSpec: Record<string, { bg: string; color: string; label: string; variant: string }> = {
    ada: {
        bg: "rgba(139, 124, 247, 0.15)",
        color: "rgb(168, 155, 255)",
        label: "Owner",
        variant: "accent",
    },
    grace: {
        bg: "rgba(96, 165, 250, 0.13)",
        color: "rgb(96, 165, 250)",
        label: "Admin",
        variant: "info",
    },
    linus: {
        bg: "rgba(255, 255, 255, 0.05)",
        color: "rgb(165, 160, 176)",
        label: "Member",
        variant: "neutral",
    },
    katherine: {
        bg: "rgba(255, 255, 255, 0.05)",
        color: "rgb(165, 160, 176)",
        label: "Member",
        variant: "neutral",
    },
};

/* Alpha-weighted ink centroid of `el`, expressed in its 56px row's coordinates. */
async function rowInk(el: RenderedElement<Element>, row: RenderedElement<Element>) {
    const ink = await el.visibleMetrics();
    expect(ink.pixelCount).toBeGreaterThan(0);
    const b = el.bounds();
    const rb = row.bounds();
    return { ink, x: b.x - rb.x + ink.center.x, y: b.y - rb.y + ink.center.y };
}

it("holds MemberList geometry, typography, role badges, and optical alignment", async () => {
    const actions: string[] = [];
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ background: "var(--happy2-bg-surface)", width: "100%" }}>
                <MemberList
                    actionLabel="Message"
                    data-testid="roster"
                    members={rosterMembers}
                    onAction={(id) => actions.push(id)}
                />
            </div>
        ),
        { width: 400, height: 264, padding: 20 },
    );
    await view.ready();

    const sel = (rest: string) => `[data-testid="roster"] ${rest}`;
    const row = (id: string) => view.$(sel(`[data-member-id="${id}"]`));

    /* ---- Root contract -------------------------------------------------- */

    const root = view.$('[data-testid="roster"]');
    expect(root.element.tagName).toBe("UL");
    expect(root.bounds()).toEqual({ x: 20, y: 20, width: 360, height: 224 });
    expect(
        root.computedStyles([
            "background-color",
            "box-sizing",
            "display",
            "flex-direction",
            "list-style-type",
            "margin",
            "padding",
        ]),
    ).toEqual({
        "background-color": "rgba(0, 0, 0, 0)",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "list-style-type": "none",
        margin: "0px",
        padding: "0px",
    });

    /* ---- Row grid ------------------------------------------------------- */

    rowIds.forEach((id, index) => {
        const r = row(id);
        expect(r.element.tagName, id).toBe("LI");
        expect(r.bounds(), id).toEqual({ x: 20, y: 20 + index * 56, width: 360, height: 56 });
        expect(
            r.computedStyles(["align-items", "column-gap", "display", "height", "padding"]),
            id,
        ).toEqual({
            "align-items": "center",
            "column-gap": "12px",
            display: "flex",
            height: "56px",
            padding: "0px 12px",
        });
    });
    expect(row("ada").element.getAttribute("data-role")).toBe("owner");
    expect(row("ada").element.getAttribute("data-presence")).toBe("online");
    expect(row("grace").element.getAttribute("data-presence")).toBe("offline");

    /* Hairline divider between rows (pseudo-element, no layout impact). The
     * first row has no divider; every following row draws --happy2-border. */
    expect(getComputedStyle(row("ada").element, "::before").content).toBe("none");
    expect(getComputedStyle(row("grace").element, "::before").backgroundColor).toBe(
        "rgba(255, 255, 255, 0.07)",
    );

    /* ---- Avatar lane ---------------------------------------------------- */

    for (const id of rowIds) {
        const avatar = view.$(sel(`[data-member-id="${id}"] [data-happy2-ui="avatar"]`));
        expect(avatar.bounds().width, id).toBe(36);
        expect(avatar.bounds().height, id).toBe(36);
        const off = avatar.offsets();
        expect(off.left, `${id} avatar left`).toBe(12);
        expect(off.top, `${id} avatar top`).toBe(10);
        expect(off.bottom, `${id} avatar bottom`).toBe(10);
        expect(avatar.computedStyle("border-radius"), id).toBe("999px");
    }

    /* Filled avatar disc is symmetric painted content: its centroid lands on
     * the avatar-box center (row-x 30, row-y 28). Measured on the offline rows
     * so a presence dot cannot pull the centroid off-box. */
    for (const id of ["grace", "katherine"] as const) {
        const avatar = view.$(sel(`[data-member-id="${id}"] [data-happy2-ui="avatar"]`));
        const c = await rowInk(avatar, row(id));
        expect(Math.abs(c.x - 30), `${id} avatar optical x`).toBeLessThanOrEqual(OPTICAL);
        expect(Math.abs(c.y - 28), `${id} avatar optical y`).toBeLessThanOrEqual(OPTICAL);
    }

    /* Presence: online rows carry the dot, offline rows do not. */
    expect(
        view.$(sel('[data-member-id="ada"] [data-happy2-ui="avatar-presence"]')).bounds().width,
    ).toBe(8);
    expect(
        view.container.querySelector(
            sel('[data-member-id="grace"] [data-happy2-ui="avatar-presence"]'),
        ),
    ).toBeNull();

    /* ---- Identity block ------------------------------------------------- */

    for (const id of rowIds) {
        const identity = view.$(sel(`[data-member-id="${id}"] [data-happy2-ui="member-identity"]`));
        const off = identity.offsets();
        /* Text lane begins one 12px gutter past the 36px avatar at the 12px pad. */
        expect(off.left, `${id} identity left`).toBe(60);
        /* Box-symmetric in the row: the identity stack is vertically centered. */
        expect(Math.abs(off.top - off.bottom), `${id} identity centered`).toBeLessThanOrEqual(0.5);
    }

    /* Name typography + one shared DOM baseline across the (uniform) rows. */
    let sharedBaseline: number | undefined;
    for (const id of rowIds) {
        const name = view.$(sel(`[data-member-id="${id}"] [data-happy2-ui="member-name"]`));
        const tm = name.textMetrics();
        expect(tm.text, id).toBe(rosterMembers.find((m) => m.id === id)!.name);
        expect(tm.font.family, id).toBe(fontFamily);
        expect(tm.font.size, id).toBe(14);
        expect(tm.font.weight, id).toBe("600");
        expect(tm.font.lineHeight, id).toBe(18);
        expect(tm.font.letterSpacing, id).toBeCloseTo(-0.14, 2);
        expect(name.computedStyle("color"), id).toBe("rgb(237, 234, 242)");
        expect((await name.visibleMetrics()).pixelCount, id).toBeGreaterThan(0);
        const baseline = tm.baseline.fromSurfaceTop - row(id).bounds().y;
        sharedBaseline ??= baseline;
        expect(Math.abs(baseline - sharedBaseline), `${id} name baseline`).toBeLessThanOrEqual(
            0.001,
        );
    }

    /* Subtitle typography + muted token + content (title, else @handle). */
    for (const id of rowIds) {
        const sub = view.$(sel(`[data-member-id="${id}"] [data-happy2-ui="member-subtitle"]`));
        expect(sub.element.textContent, id).toBe(subtitleText[id]);
        const tm = sub.textMetrics();
        expect(tm.font.size, id).toBe(12);
        expect(tm.font.weight, id).toBe("500");
        expect(tm.font.lineHeight, id).toBe(16);
        expect(sub.computedStyle("color"), id).toBe("rgb(117, 112, 133)");
        expect((await sub.visibleMetrics()).pixelCount, id).toBeGreaterThan(0);
    }

    /* ---- Role badge ----------------------------------------------------- */

    for (const id of rowIds) {
        const badge = view.$(sel(`[data-member-id="${id}"] [data-happy2-ui="badge"]`));
        const spec = roleSpec[id]!;
        expect(badge.element.getAttribute("data-variant"), id).toBe(spec.variant);
        expect(badge.element.textContent, id).toBe(spec.label);
        expect(badge.bounds().height, id).toBe(18);
        expect(badge.computedStyle("background-color"), id).toBe(spec.bg);
        expect(badge.computedStyle("color"), id).toBe(spec.color);
        const off = badge.offsets();
        expect(Math.abs(off.top - off.bottom), `${id} badge centered`).toBeLessThanOrEqual(0.5);
        expect((await badge.visibleMetrics()).pixelCount, id).toBeGreaterThan(0);
    }

    /* ---- Trailing action + right-alignment ------------------------------ */

    for (const id of rowIds) {
        const trailing = view.$(sel(`[data-member-id="${id}"] [data-happy2-ui="member-trailing"]`));
        expect(trailing.offsets().right, `${id} trailing right`).toBe(12);
        const button = view.$(
            sel(
                `[data-member-id="${id}"] [data-happy2-ui="member-trailing"] [data-happy2-ui="button"]`,
            ),
        );
        expect(button.element.textContent, id).toBe("Message");
        expect(button.bounds().height, id).toBe(28);
        expect((await button.visibleMetrics()).pixelCount, id).toBeGreaterThan(0);
        /* Role badge sits exactly one 12px gutter left of the trailing control. */
        const badge = view.$(sel(`[data-member-id="${id}"] [data-happy2-ui="badge"]`));
        expect(
            Math.abs(trailing.bounds().x - (badge.bounds().x + badge.bounds().width) - 12),
            `${id} badge/trailing gap`,
        ).toBeLessThanOrEqual(0.5);
    }

    /* Action callback carries the row id. */
    (
        view.$(
            sel(
                '[data-member-id="linus"] [data-happy2-ui="member-trailing"] [data-happy2-ui="button"]',
            ),
        ).element as HTMLButtonElement
    ).click();
    expect(actions).toEqual(["linus"]);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("MemberList.test");
}, 120_000);

it("holds MemberList trailing variants, minimal rows, and role colors", async () => {
    const view = createRenderer();

    const menuMembers: MemberItem[] = [
        {
            id: "ada",
            initials: "AL",
            name: "Ada Lovelace",
            presence: "online",
            role: "owner",
            title: "Founder",
            tone: "violet",
        },
        {
            id: "grace",
            initials: "GH",
            name: "Grace Hopper",
            presence: "offline",
            role: "admin",
            title: "Systems",
            tone: "ocean",
        },
    ];
    const plainMembers: MemberItem[] = [
        {
            id: "solo",
            initials: "SB",
            name: "Sam Bright",
            presence: "online",
            role: "member",
            tone: "rose",
        },
        {
            id: "img",
            imageUrl: IMG,
            initials: "JD",
            name: "Jesse Dee",
            presence: "offline",
            role: "admin",
            title: "Designer",
            tone: "amber",
        },
    ];

    view.render(
        () => (
            <div style={{ background: "var(--happy2-bg-surface)", width: "100%" }}>
                <MemberList
                    data-testid="menu"
                    members={menuMembers}
                    rowMenu={(member) => (
                        <Button
                            aria-label={`Manage ${member.name}`}
                            icon="more"
                            iconOnly
                            size="small"
                            variant="ghost"
                        />
                    )}
                />
            </div>
        ),
        { width: 340, height: 152, padding: 20 },
    );
    view.render(
        () => (
            <div style={{ background: "var(--happy2-bg-surface)", width: "100%" }}>
                <MemberList data-testid="plain" members={plainMembers} />
            </div>
        ),
        { width: 340, height: 152, padding: 20 },
    );
    await view.ready();

    /* ---- rowMenu: caller JSX replaces the default action -------------- */

    for (const [id, name] of [
        ["ada", "Ada Lovelace"],
        ["grace", "Grace Hopper"],
    ] as const) {
        const trailing = view.$(
            `[data-testid="menu"] [data-member-id="${id}"] [data-happy2-ui="member-trailing"]`,
        );
        expect(trailing.offsets().right, `${id} menu trailing right`).toBe(12);
        const button = view.$(
            `[data-testid="menu"] [data-member-id="${id}"] [data-happy2-ui="member-trailing"] [data-happy2-ui="button"]`,
        );
        expect(button.element.getAttribute("aria-label"), id).toBe(`Manage ${name}`);
        /* Icon-only 28px square kebab — no "Message" label leaks through. */
        expect(button.element.textContent, id).toBe("");
        expect(button.bounds().width, id).toBe(28);
        expect(button.bounds().height, id).toBe(28);
        const icon = view.$(
            `[data-testid="menu"] [data-member-id="${id}"] [data-happy2-ui="member-trailing"] svg`,
        );
        expect(icon.bounds().width, id).toBe(14);
        expect((await icon.visibleMetrics()).pixelCount, id).toBeGreaterThan(0);
    }

    /* Owner badge accent tokens (the roster test covers the other variants). */
    const adaBadge = view.$('[data-testid="menu"] [data-member-id="ada"] [data-happy2-ui="badge"]');
    expect(adaBadge.computedStyle("background-color")).toBe("rgba(139, 124, 247, 0.15)");
    expect(adaBadge.computedStyle("color")).toBe("rgb(168, 155, 255)");

    /* ---- Minimal rows: no trailing, single-line name, image avatar ---- */

    expect(
        view.container.querySelector(
            '[data-testid="plain"] [data-member-id="solo"] [data-happy2-ui="member-trailing"]',
        ),
        "solo has no trailing control",
    ).toBeNull();
    expect(
        view.container.querySelector(
            '[data-testid="plain"] [data-member-id="solo"] [data-happy2-ui="member-subtitle"]',
        ),
        "solo has no subtitle",
    ).toBeNull();

    /* Single-line identity collapses to one 18px line box, still centered. */
    const soloIdentity = view.$(
        '[data-testid="plain"] [data-member-id="solo"] [data-happy2-ui="member-identity"]',
    );
    expect(soloIdentity.bounds().height).toBe(18);
    const soloOff = soloIdentity.offsets();
    expect(Math.abs(soloOff.top - soloOff.bottom)).toBeLessThanOrEqual(0.5);

    /* With no trailing control the role badge becomes the trailing lane and
     * right-aligns on the 12px pad. */
    const soloBadge = view.$(
        '[data-testid="plain"] [data-member-id="solo"] [data-happy2-ui="badge"]',
    );
    expect(soloBadge.offsets().right).toBe(12);
    expect(soloBadge.element.getAttribute("data-variant")).toBe("neutral");

    /* Image avatar: <img> takes over, initials suppressed, admin info badge. */
    const imgAvatar = view.$(
        '[data-testid="plain"] [data-member-id="img"] [data-happy2-ui="avatar-image"]',
    );
    expect(imgAvatar.element.tagName).toBe("IMG");
    expect((imgAvatar.element as HTMLImageElement).getAttribute("src")).toBe(IMG);
    expect(imgAvatar.bounds().width).toBe(36);
    expect(
        view.container.querySelector(
            '[data-testid="plain"] [data-member-id="img"] [data-happy2-ui="avatar-initials"]',
        ),
    ).toBeNull();
    const imgBadge = view.$(
        '[data-testid="plain"] [data-member-id="img"] [data-happy2-ui="badge"]',
    );
    expect(imgBadge.computedStyle("background-color")).toBe("rgba(96, 165, 250, 0.13)");
    expect(imgBadge.computedStyle("color")).toBe("rgb(96, 165, 250)");

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("MemberList.variants");
}, 120_000);

it("renders a service member with an agent avatar and a Service badge", async () => {
    const view = createRenderer();

    const serviceRoster: MemberItem[] = [
        {
            agent: true,
            id: "happy",
            initials: "H",
            name: "Happy",
            /* Presence is set to online to prove a service account suppresses the
               presence dot regardless of any reported status. */
            presence: "online",
            role: "member",
            systemRole: "service",
            tone: "brand",
            username: "happy",
        },
        {
            id: "ada",
            initials: "AL",
            name: "Ada Lovelace",
            presence: "online",
            role: "owner",
            title: "Founder & CEO",
            tone: "violet",
        },
    ];

    view.render(
        () => (
            <div style={{ background: "var(--happy2-bg-surface)", width: "100%" }}>
                <MemberList data-testid="svc" members={serviceRoster} />
            </div>
        ),
        { width: 340, height: 132, padding: 20 },
    );
    await view.ready();

    /* ---- Service row: agent avatar, Service badge, no presence dot -------- */
    const row = view.$('[data-testid="svc"] [data-member-id="happy"]');
    expect(row.element.getAttribute("data-role")).toBe("service");
    expect(row.element.getAttribute("data-presence"), "service row carries no presence").toBeNull();

    const avatar = view.$(
        '[data-testid="svc"] [data-member-id="happy"] [data-happy2-ui="avatar"]',
    );
    expect(avatar.element.getAttribute("data-type")).toBe("agent");
    expect(
        view.container.querySelector(
            '[data-testid="svc"] [data-member-id="happy"] [data-happy2-ui="avatar-presence"]',
        ),
        "service account paints no presence dot",
    ).toBeNull();

    const badge = view.$('[data-testid="svc"] [data-member-id="happy"] [data-happy2-ui="badge"]');
    expect(badge.element.textContent).toBe("Service");
    expect(badge.element.getAttribute("data-variant")).toBe("accent");
    expect(badge.computedStyle("background-color")).toBe("rgba(139, 124, 247, 0.15)");
    expect(badge.computedStyle("color")).toBe("rgb(168, 155, 255)");
    expect(badge.offsets().right, "Service badge right-aligns on the 12px pad").toBe(12);

    /* ---- A human member alongside keeps its human avatar + role badge ----- */
    const humanAvatar = view.$(
        '[data-testid="svc"] [data-member-id="ada"] [data-happy2-ui="avatar"]',
    );
    expect(humanAvatar.element.getAttribute("data-type")).toBe("human");
    const humanBadge = view.$('[data-testid="svc"] [data-member-id="ada"] [data-happy2-ui="badge"]');
    expect(humanBadge.element.textContent).toBe("Owner");
    expect(
        view.container.querySelector(
            '[data-testid="svc"] [data-member-id="ada"] [data-happy2-ui="avatar-presence"]',
        ),
        "the human member still shows its presence dot",
    ).not.toBeNull();

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("MemberList.service");
}, 120_000);
