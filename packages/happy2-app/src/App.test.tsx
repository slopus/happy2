import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

const sidebarItem = (container: HTMLElement, id: string) => {
    const item = container.querySelector<HTMLButtonElement>(
        `[data-happy2-ui="sidebar-item"][data-item-id="${id}"]`,
    );
    if (!item) throw new Error(`sidebar item ${id} not found`);
    return item;
};

const railItem = (container: HTMLElement, id: string) => {
    const item = container.querySelector<HTMLButtonElement>(
        `[data-happy2-ui="rail-item"][data-item-id="${id}"]`,
    );
    if (!item) throw new Error(`rail item ${id} not found`);
    return item;
};

describe("App", () => {
    it("renders the default channel header and messages", () => {
        const { container, getByText } = render(() => <App />);

        const header = container.querySelector('[data-happy2-ui="channel-header"]');
        expect(header?.textContent).toContain("launch-week");
        expect(header?.textContent).toContain("Ship mobile v2 by Friday");

        expect(getByText("Today")).toBeTruthy();
        expect(getByText("Fix cold-start push registration")).toBeTruthy();
        expect(getByText("Push notifications drop on cold start")).toBeTruthy();
        expect(getByText("Update shared release manifest")).toBeTruthy();
        expect(getByText("Device farm verification")).toBeTruthy();
    });

    it("keeps chat navigation and conversation in one content panel", () => {
        const { container, queryByRole } = render(() => <App />);

        const main = container.querySelector('[data-happy2-ui="app-shell-main"]');
        const sidebar = container.querySelector('[data-happy2-ui="app-shell-sidebar"]');
        const workspace = container.querySelector('[data-happy2-ui="app-shell-workspace"]');

        expect(sidebar?.parentElement).toBe(main);
        expect(workspace?.parentElement).toBe(main);
        expect(sidebar?.nextElementSibling).toBe(workspace);
        expect(container.querySelector('[data-happy2-ui="rail-brand-image"]')).toBeTruthy();
        expect(container.querySelector('[data-happy2-ui="rail-brand-glyph"]')).toBeNull();
        expect(
            container.querySelector('[data-happy2-ui="app-shell-rail"] [data-happy2-ui="avatar"]'),
        ).toBeTruthy();
        expect(
            container.querySelector(
                '[data-happy2-ui="app-shell-sidebar"] [data-happy2-ui="profile-card"]',
            ),
        ).toBeNull();
        expect(
            container.querySelector(
                '[data-happy2-ui="app-shell-sidebar"] [data-happy2-ui="sidebar-footer"]',
            ),
        ).toBeNull();
        expect(queryByRole("button", { name: "History" })).toBeNull();
        expect(queryByRole("button", { name: "Settings" })).toBeNull();
    });

    it("only renders window controls for the desktop host", () => {
        const web = render(() => <App platform="web" />);
        expect(web.container.querySelector('[data-happy2-ui="title-bar-controls"]')).toBeNull();
        web.unmount();

        const desktop = render(() => <App platform="desktop" />);
        expect(
            desktop.container.querySelector('[data-happy2-ui="title-bar-controls"]'),
        ).toBeTruthy();
    });

    it("only overlays the authentication surface with a desktop drag region", () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise<Response>(() => {})),
        );
        try {
            const web = render(() => <App platform="web" serverUrl="http://server" />);
            expect(web.container.querySelector('[data-happy2-ui="window-drag-region"]')).toBeNull();
            web.unmount();

            const desktop = render(() => <App platform="desktop" serverUrl="http://server" />);
            expect(
                desktop.container.querySelector('[data-happy2-ui="window-drag-region"]'),
            ).toBeTruthy();
            desktop.unmount();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("switches the conversation from the sidebar", () => {
        const { container, getByText, queryByText } = render(() => <App />);

        fireEvent.click(sidebarItem(container, "eng-core"));

        expect(getByText("Fix flaky auth token refresh tests")).toBeTruthy();
        expect(queryByText("Device farm verification")).toBeNull();

        fireEvent.click(sidebarItem(container, "maya-chen"));
        expect(getByText("Morning! Still on for the launch review at 3?")).toBeTruthy();
        expect(queryByText("Fix flaky auth token refresh tests")).toBeNull();
    });

    it("shows the intro block for an empty conversation", () => {
        const { container, getByText } = render(() => <App />);

        fireEvent.click(sidebarItem(container, "design"));
        expect(getByText("Everyone’s all here in #design")).toBeTruthy();
        expect(container.querySelector('[data-happy2-ui="message"]')).toBeNull();
    });

    it("appends the typed message on Enter and clears the draft", () => {
        const { getByPlaceholderText, getByText } = render(() => <App />);
        const textarea = getByPlaceholderText(
            "Message #launch-week — @ mention an agent to hand off work…",
        ) as HTMLTextAreaElement;

        fireEvent.input(textarea, { target: { value: "Green across the farm — merging." } });
        fireEvent.keyDown(textarea, { key: "Enter" });

        expect(getByText("Green across the farm — merging.")).toBeTruthy();
        expect(getByText("Now")).toBeTruthy();
        expect(textarea.value).toBe("");
    });

    it("resolves an approval request when Approve is clicked", () => {
        const { container, getByRole, getByText } = render(() => <App />);

        const card = container.querySelector('[data-happy2-ui="approval-card"]');
        expect(card?.getAttribute("data-resolution")).toBe("pending");

        fireEvent.click(getByRole("button", { name: "Approve" }));

        expect(card?.getAttribute("data-resolution")).toBe("approved");
        expect(getByText("Approved — Forge can proceed")).toBeTruthy();
    });

    it("exposes only the implemented Chat, Files, and Admin rail destinations", () => {
        const { container, getByText } = render(() => <App />);

        // Chat is the default rail area and owns the channel header.
        expect(container.querySelector('[data-happy2-ui="channel-header"]')).toBeTruthy();

        expect(container.querySelectorAll('[data-happy2-ui="rail-item"]')).toHaveLength(3);

        fireEvent.click(railItem(container, "files"));
        expect(getByText("No shared files")).toBeTruthy();

        fireEvent.click(railItem(container, "admin"));
        expect(getByText("Admin requires a workspace")).toBeTruthy();

        // Returning to chat restores the live workspace.
        fireEvent.click(railItem(container, "chat"));
        expect(container.querySelector('[data-happy2-ui="channel-header"]')).toBeTruthy();
    });

    it("opens the profile from the rail avatar instead of a You destination", () => {
        const { container, getByRole, getByText } = render(() => <App />);

        expect(
            container.querySelector('[data-happy2-ui="rail-item"][data-item-id="you"]'),
        ).toBeNull();
        fireEvent.click(getByRole("button", { name: "Open profile" }));
        expect(getByText("Profile requires a workspace")).toBeTruthy();
    });

    it("opens a create menu from the rail for agents and channels", () => {
        const { container, getByRole } = render(() => <App />);

        const create = getByRole("button", { name: "Create" });
        fireEvent.click(create);

        expect(getByRole("menuitem", { name: "New agent" })).toBeTruthy();
        fireEvent.click(getByRole("menuitem", { name: "New channel" }));

        expect(container.querySelector('[data-happy2-ui="rail-primary-popover"]')).toBeNull();
        expect(container.querySelector('[data-happy2-ui="modal"]')?.textContent).toContain(
            "Create channel",
        );
    });

    it("does not substitute mock results when workspace search is disconnected", () => {
        const { container, getByText } = render(() => <App />);

        const search = container.querySelector<HTMLInputElement>(
            '[data-happy2-ui="search-field-input"]',
        );
        if (!search) throw new Error("search field not found");

        fireEvent.input(search, { target: { value: "launch" } });
        expect(getByText("Search unavailable")).toBeTruthy();
        expect(container.querySelector('[data-happy2-ui="search-results"]')).toBeNull();

        const activeSearch = container.querySelector<HTMLInputElement>(
            '[data-happy2-ui="search-field-input"]',
        );
        if (!activeSearch) throw new Error("active search field not found");
        fireEvent.input(activeSearch, { target: { value: "" } });
        expect(container.querySelector('[data-happy2-ui="channel-header"]')).toBeTruthy();
    });

    it("expands and collapses an agent run card", () => {
        const { getAllByRole, getByRole, getByText, queryByText } = render(() => <App />);

        expect(queryByText("Move registration behind the handshake")).toBeNull();

        const toggle = getAllByRole("button", { name: "Expand run details" })[0]!;
        fireEvent.click(toggle);

        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(getByText("Move registration behind the handshake")).toBeTruthy();
        expect(getByText("src/push/register.ts")).toBeTruthy();

        fireEvent.click(getByRole("button", { name: "Collapse run details" }));
        expect(queryByText("src/push/register.ts")).toBeNull();
    });
});
