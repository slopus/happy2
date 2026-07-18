import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

function railItem(container: HTMLElement, id: string): HTMLButtonElement {
    const item = container.querySelector<HTMLButtonElement>(
        `[data-happy2-ui="rail-item"][data-item-id="${id}"]`,
    );
    if (!item) throw new Error(`rail item ${id} not found`);
    return item;
}

describe("App thin state wiring", () => {
    it("renders every store-driven desktop destination from one static HappyState owner", () => {
        const screen = render(() => <App />);
        expect(screen.container.querySelectorAll('[data-happy2-ui="rail-item"]')).toHaveLength(7);

        for (const [id, label] of [
            ["home", "Your day at a glance"],
            ["activity", "Activity"],
            ["threads", "Threads"],
            ["files", "No shared files"],
            ["calls", "Calls"],
            ["admin", "Admin"],
        ] as const) {
            fireEvent.click(railItem(screen.container, id));
            expect(screen.container.textContent).toContain(label);
        }

        fireEvent.click(screen.getByRole("button", { name: "Open profile" }));
        expect(screen.container.textContent).toContain("All changes saved");
    });

    it("routes title-bar search into the standalone SearchStore page", () => {
        const screen = render(() => <App />);
        const input = screen.container.querySelector<HTMLInputElement>(
            '[data-happy2-ui="search-field-input"]',
        )!;
        fireEvent.input(input, { target: { value: "relay" } });
        expect(screen.container.textContent).toContain("match “relay”");
    });

    it("shows host window controls only for the desktop platform", () => {
        const web = render(() => <App platform="web" />);
        expect(web.container.querySelector('[data-happy2-ui="title-bar-controls"]')).toBeNull();
        web.unmount();
        const desktop = render(() => <App platform="desktop" />);
        expect(
            desktop.container.querySelector('[data-happy2-ui="title-bar-controls"]'),
        ).toBeTruthy();
    });

    it("keeps the authentication overlay host-specific while the server probe is pending", () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise<Response>(() => undefined)),
        );
        try {
            const web = render(() => <App platform="web" serverUrl="http://server" />);
            expect(web.container.querySelector('[data-happy2-ui="window-drag-region"]')).toBeNull();
            web.unmount();
            const desktop = render(() => <App platform="desktop" serverUrl="http://server" />);
            expect(
                desktop.container.querySelector('[data-happy2-ui="window-drag-region"]'),
            ).toBeTruthy();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
