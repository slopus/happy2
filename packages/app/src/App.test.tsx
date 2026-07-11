import { fireEvent, render, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
    it("only renders window controls for the desktop host", () => {
        const web = render(() => <App platform="web" />);
        expect(web.queryByTestId("window-controls")).toBeNull();
        web.unmount();

        const desktop = render(() => <App platform="desktop" />);
        expect(desktop.getByTestId("window-controls")).toBeTruthy();
    });

    it("switches features from the rail", () => {
        const { getByRole, getByText } = render(() => <App />);

        const tasks = getByRole("button", { name: "Tasks" });
        fireEvent.click(tasks);

        expect(tasks.getAttribute("aria-pressed")).toBe("true");
        expect(getByText("Feature · Tasks")).toBeTruthy();
    });

    it("switches workspace items from the sidebar", () => {
        const { getByLabelText, getByRole } = render(() => <App />);

        const maya = getByRole("button", { name: "Maya Chen" });
        fireEvent.click(maya);

        expect(maya.getAttribute("aria-pressed")).toBe("true");
        expect(getByLabelText("Maya Chen content")).toBeTruthy();
    });

    it("shows the search query in the active feature", () => {
        const { getByRole, getByText } = render(() => <App />);

        fireEvent.input(getByRole("searchbox", { name: "Search Rigged" }), {
            target: { value: "desktop" },
        });

        expect(getByText("Searching general for “desktop”")).toBeTruthy();
    });

    it("sends a message to the active conversation", () => {
        const { getByRole, getByText } = render(() => <App />);
        const composer = getByRole("textbox", { name: "Message #general" });

        fireEvent.input(composer, { target: { value: "The composer is ready." } });
        fireEvent.click(getByRole("button", { name: "Send message" }));

        expect(getByText("The composer is ready.")).toBeTruthy();
        expect((composer as HTMLTextAreaElement).value).toBe("");
    });

    it("shows human and agent collaboration in the mock workspace", () => {
        const { getAllByText, getByRole } = render(() => <App />);

        expect(getByRole("button", { name: "Forge" })).toBeTruthy();
        expect(getByRole("button", { name: "Scout" })).toBeTruthy();
        expect(getAllByText("@Forge").length).toBeGreaterThan(0);
        expect(getAllByText("@Patch").length).toBeGreaterThan(0);
    });

    it("uses round human avatars and rounded rectangular bot avatars", () => {
        const { container } = render(() => <App />);
        const human = container.querySelector('[data-avatar-type="human"]');
        const bot = container.querySelector('[data-avatar-type="bot"]');

        expect(human?.classList.contains("rounded-full")).toBe(true);
        expect(bot?.classList.contains("rounded-[7px]")).toBe(true);
    });

    it("expands and reviews an inline agent run", () => {
        const { getByLabelText, getByRole, getByText } = render(() => <App />);

        fireEvent.click(getByRole("button", { name: "View Forge run details" }));
        expect(getByText("Default workspace naming")).toBeTruthy();
        expect(getByText("Cover saved names and fallback behavior")).toBeTruthy();
        expect(getByLabelText("Forge run progress").getAttribute("aria-valuenow")).toBe("100");

        fireEvent.click(getByRole("button", { name: "Approve Forge run" }));
        expect(getByText("Reviewed")).toBeTruthy();
    });

    it("inserts an agent mention from the composer picker", () => {
        const { getByRole } = render(() => <App />);
        const composer = getByRole("textbox", { name: "Message #general" });

        fireEvent.click(getByRole("button", { name: "Mention an agent" }));
        expect(getByRole("listbox", { name: "Mention an agent" })).toBeTruthy();
        fireEvent.click(getByRole("option", { name: "Forge" }));

        expect((composer as HTMLTextAreaElement).value).toBe("@Forge ");
        expect(composer.getAttribute("aria-expanded")).toBe("false");
    });

    it("attaches context to a sent message", () => {
        const { getByLabelText, getByRole, queryByLabelText } = render(() => <App />);
        const composer = getByRole("textbox", { name: "Message #general" });

        fireEvent.click(getByRole("button", { name: "Add context" }));
        fireEvent.click(getByRole("button", { name: "ChatComposer.tsx" }));
        fireEvent.click(getByRole("button", { name: "Done" }));
        expect(getByLabelText("Attached context")).toBeTruthy();

        fireEvent.input(composer, { target: { value: "@Forge use the attached context." } });
        fireEvent.click(getByRole("button", { name: "Send message" }));

        expect(queryByLabelText("Attached context")).toBeNull();
        expect(getByLabelText("Message context")).toBeTruthy();
    });

    it("captures a human decision as agent context", () => {
        const { getByLabelText, getByRole, getByText } = render(() => <App />);

        fireEvent.click(
            getByRole("button", { name: "View Default workspace names decision details" }),
        );
        expect(getByText("Preserve existing saved names")).toBeTruthy();
        fireEvent.click(
            getByRole("button", { name: "Add Default workspace names decision to context" }),
        );

        expect(getByLabelText("Attached context")).toBeTruthy();
        expect(
            getByRole("button", { name: "Default workspace names decision added to context" }),
        ).toBeTruthy();
    });

    it("scopes an agent delegation and records it on the message", () => {
        const { getAllByLabelText, getByLabelText, getByRole } = render(() => <App />);
        const composer = getByRole("textbox", { name: "Message #general" });

        fireEvent.input(composer, { target: { value: "@Forge inspect the current flow first." } });
        expect(getByLabelText("Delegation scope for Forge")).toBeTruthy();
        fireEvent.click(getByRole("button", { name: "Execution scope: Implement & verify" }));
        fireEvent.click(getByRole("button", { name: "Plan only" }));
        fireEvent.click(getByRole("button", { name: "Done" }));
        fireEvent.click(getByRole("button", { name: "Send message" }));

        const receipts = getAllByLabelText("Delegation to Forge");
        const sentReceipt = receipts[receipts.length - 1]!;
        expect(within(sentReceipt).getByText("Plan only")).toBeTruthy();
        expect(within(sentReceipt).getByText("Read context")).toBeTruthy();
    });
});
