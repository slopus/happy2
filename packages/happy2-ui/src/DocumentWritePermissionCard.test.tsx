import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/badge.css";
import "./styles/document-write-permission-card.css";
import { DocumentWritePermissionCard } from "./DocumentWritePermissionCard";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
const engine = () => server.browser as Engine;

const uiFamily = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

const REQUEST = {
    documentTitle: "Launch plan",
    requestedBy: "Research Agent",
} as const;

it("holds pending layout: amber treatment, document identity, and working decisions", async () => {
    const decisions: string[] = [];
    const view = createRenderer().render(
        () => (
            <div style={{ width: "600px", background: "#f5f5f5", display: "flex", padding: "0" }}>
                <DocumentWritePermissionCard
                    {...REQUEST}
                    data-testid="card"
                    onApprove={() => decisions.push("approve")}
                    onDeny={() => decisions.push("deny")}
                    status="pending"
                />
            </div>
        ),
        { width: 600, height: 280 },
    );
    await view.ready();

    // Root: bordered surface card capped at 560px with the pending amber hairline.
    const root = view.$('[data-testid="card"]');
    expect(root.bounds().width).toBe(560);
    expect(
        root.computedStyles([
            "background-color",
            "border-top-left-radius",
            "box-sizing",
            "max-width",
            "overflow-x",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-top-left-radius": "10px",
        "box-sizing": "border-box",
        "max-width": "560px",
        "overflow-x": "hidden",
    });
    expect(root.computedStyle("font-family")).toBe(uiFamily());
    expect(root.computedStyle("border-top-color")).toBe("rgba(255, 149, 0, 0.14)");
    expect(root.element.getAttribute("data-status")).toBe("pending");

    // No banner while pending; the edit chip wears the warning tone.
    expect(
        root.element.querySelector('[data-happy2-ui="document-write-permission-card-banner"]'),
    ).toBe(null);
    const chip = view.$('[data-happy2-ui="document-write-permission-card-chip"]');
    expect(chip.bounds().width).toBe(26);
    expect(chip.bounds().height).toBe(26);
    expect(chip.computedStyle("color")).toBe("rgb(255, 149, 0)");

    // Type badge and the requesting agent pinned right.
    expect(view.$('[data-testid="card"] [data-happy2-ui="badge-label"]').element.textContent).toBe(
        "Document edit",
    );
    const requester = view.$('[data-happy2-ui="document-write-permission-card-requester"]');
    expect(requester.element.textContent).toBe("Research Agent");
    const header = view.$('[data-happy2-ui="document-write-permission-card-header"]');
    expect(
        header.bounds().x +
            header.bounds().width -
            (requester.bounds().x + requester.bounds().width),
        "requester pinned to the header's right edge",
    ).toBeCloseTo(0, 2);

    // 40px document glyph slot beside the request title.
    const glyph = view.$('[data-happy2-ui="document-write-permission-card-glyph"]');
    expect(glyph.bounds().width).toBe(40);
    expect(glyph.bounds().height).toBe(40);
    expect(glyph.computedStyle("border-radius")).toBe("8px");
    const title = view.$('[data-happy2-ui="document-write-permission-card-title"]');
    expect(title.textMetrics().text).toBe("Wants to edit Launch plan");
    expect(title.textMetrics().font.size).toBe(15);
    expect(title.textMetrics().font.weight).toBe("700");
    expect(
        view.$('[data-happy2-ui="document-write-permission-card-description"]').element.textContent,
    ).toBe("The staged changes apply to the document only after a member approves them.");

    // Decisions flow through the callbacks.
    const approve = root.element.querySelector<HTMLButtonElement>('[data-action="approve"]')!;
    const deny = root.element.querySelector<HTMLButtonElement>('[data-action="deny"]')!;
    expect(approve.textContent).toContain("Approve edit");
    expect(deny.textContent).toContain("Deny");
    approve.click();
    deny.click();
    expect(decisions).toEqual(["approve", "deny"]);

    await view.screenshot("DocumentWritePermissionCard.test");
}, 120_000);

it("disables decisions while busy and renders clearly terminal resolutions", async () => {
    const decisions: string[] = [];
    const view = createRenderer()
        .render(
            () => (
                <div style={{ width: "600px", background: "#f5f5f5", display: "flex" }}>
                    <DocumentWritePermissionCard
                        {...REQUEST}
                        busy
                        data-testid="busy"
                        onApprove={() => decisions.push("approve")}
                        onDeny={() => decisions.push("deny")}
                        status="pending"
                    />
                </div>
            ),
            { width: 600, height: 280, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "600px", background: "#f5f5f5", display: "flex" }}>
                    <DocumentWritePermissionCard
                        {...REQUEST}
                        data-testid="approved"
                        status="approved"
                    />
                </div>
            ),
            { width: 600, height: 280, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "600px", background: "#f5f5f5", display: "flex" }}>
                    <DocumentWritePermissionCard
                        {...REQUEST}
                        data-testid="denied"
                        status="denied"
                    />
                </div>
            ),
            { width: 600, height: 280, padding: 0 },
        )
        .render(
            () => (
                <div style={{ width: "600px", background: "#f5f5f5", display: "flex" }}>
                    <DocumentWritePermissionCard
                        {...REQUEST}
                        data-testid="failed"
                        error="The staged update no longer applies to the document."
                        status="failed"
                    />
                </div>
            ),
            { width: 600, height: 280, padding: 0 },
        );
    await view.ready();

    // Busy: both buttons stay mounted but disabled; clicks never fire.
    const busyRoot = view.$('[data-testid="busy"]');
    const approve = busyRoot.element.querySelector<HTMLButtonElement>('[data-action="approve"]')!;
    const deny = busyRoot.element.querySelector<HTMLButtonElement>('[data-action="deny"]')!;
    expect(approve.disabled).toBe(true);
    expect(deny.disabled).toBe(true);
    approve.click();
    deny.click();
    expect(decisions).toEqual([]);

    const banner = (id: string) =>
        view.$(`[data-testid="${id}"] [data-happy2-ui="document-write-permission-card-banner"]`);
    const state = (id: string) =>
        view.$(
            `[data-testid="${id}"] [data-happy2-ui="document-write-permission-card-state-label"]`,
        );

    // Approved: mint banner, success state line, no action buttons.
    expect(banner("approved").element.textContent).toContain("Approved");
    expect(banner("approved").computedStyle("color")).toBe("rgb(36, 138, 61)");
    expect(banner("approved").bounds().height).toBe(32);
    expect(state("approved").element.textContent).toBe(
        "Approved — the changes were applied to Launch plan",
    );
    expect(
        view.$('[data-testid="approved"]').element.querySelector('[data-action="approve"]'),
    ).toBeNull();

    // Denied: danger banner and a neutral terminal line.
    expect(banner("denied").element.textContent).toContain("Denied");
    expect(banner("denied").computedStyle("color")).toBe("rgb(215, 0, 21)");
    expect(state("denied").element.textContent).toBe("Denied — the document was not changed");

    // Failed: danger banner carries the bounded diagnostic in the state line.
    expect(banner("failed").element.textContent).toContain("Failed");
    expect(state("failed").element.textContent).toBe(
        "Failed — The staged update no longer applies to the document.",
    );

    await view.screenshot("DocumentWritePermissionCard.resolutions.test");
}, 120_000);
