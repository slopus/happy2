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
        const { getByLabelText, getByRole } = render(() => <App />);

        const tasks = getByRole("button", { name: "Tasks" });
        fireEvent.click(tasks);

        expect(tasks.getAttribute("aria-pressed")).toBe("true");
        expect(getByLabelText("Tasks sidebar")).toBeTruthy();
        expect(getByLabelText("Tasks workspace")).toBeTruthy();
    });

    it("filters and advances work from the Tasks panel", () => {
        const { getByLabelText, getByRole, queryByLabelText } = render(() => <App />);

        fireEvent.click(getByRole("button", { name: "Tasks" }));
        const tasksSidebar = getByLabelText("Tasks sidebar");
        fireEvent.click(within(tasksSidebar).getByRole("button", { name: "Agent-owned" }));
        expect(getByLabelText("Build the agent phase indicator task")).toBeTruthy();
        expect(queryByLabelText("Write migration rollback notes task")).toBeNull();

        fireEvent.click(within(tasksSidebar).getByRole("button", { name: "All work" }));
        fireEvent.click(getByRole("button", { name: "Complete Remove the workspace naming step" }));
        expect(
            within(getByLabelText("Remove the workspace naming step task")).getByText("Reopen"),
        ).toBeTruthy();
    });

    it("creates a task with an agent owner", () => {
        const { getByLabelText, getByRole, getByText } = render(() => <App />);

        fireEvent.click(getByRole("button", { name: "Tasks" }));
        fireEvent.click(getByRole("button", { name: "+ Add task" }));
        fireEvent.input(getByLabelText("Task outcome"), {
            target: { value: "Verify recovery after an interrupted run" },
        });
        fireEvent.click(getByRole("button", { name: "Assign task to Patch" }));
        fireEvent.click(getByRole("button", { name: "Add to planned" }));

        expect(getByText("Verify recovery after an interrupted run")).toBeTruthy();
        expect(getByLabelText("Verify recovery after an interrupted run task")).toBeTruthy();
    });

    it("gives Agents and Files their own functional sidebars", () => {
        const { getByLabelText, getByRole, queryByLabelText } = render(() => <App />);

        expect(getByLabelText("Rigged sidebar")).toBeTruthy();
        fireEvent.click(getByRole("button", { name: "Agents" }));
        const agentsSidebar = getByLabelText("Agents sidebar");
        expect(queryByLabelText("Rigged sidebar")).toBeNull();
        fireEvent.click(within(agentsSidebar).getByRole("button", { name: "Scout" }));
        expect(getByLabelText("Scout agent lane")).toBeTruthy();
        expect(queryByLabelText("Forge agent lane")).toBeNull();

        fireEvent.click(getByRole("button", { name: "Files" }));
        const filesSidebar = getByLabelText("Files sidebar");
        expect(queryByLabelText("Agents sidebar")).toBeNull();
        fireEvent.click(
            within(filesSidebar).getByRole("button", { name: "Open WorkspaceHeader.tsx diff" }),
        );
        expect(getByLabelText("WorkspaceHeader.tsx unified diff")).toBeTruthy();
        fireEvent.click(within(filesSidebar).getByRole("button", { name: "Verification" }));
        expect(getByLabelText("Verification checks")).toBeTruthy();
    });

    it("opens the agent command center and controls a live run", () => {
        const { getByLabelText, getByRole } = render(() => <App />);

        fireEvent.click(getByRole("button", { name: "Agents" }));
        expect(getByLabelText("Agents workspace")).toBeTruthy();
        expect(getByLabelText("Workspace pulse")).toBeTruthy();

        fireEvent.click(getByRole("button", { name: "Pause Agent phase indicator" }));
        expect(getByRole("button", { name: "Resume Agent phase indicator" })).toBeTruthy();

        fireEvent.click(getByRole("button", { name: "Mark Default workspace naming reviewed" }));
        expect(
            within(getByLabelText("Default workspace naming run")).getByText("Complete"),
        ).toBeTruthy();
    });

    it("creates a queued delegation from the agent command center", () => {
        const { getByLabelText, getByRole, getByText } = render(() => <App />);

        fireEvent.click(getByRole("button", { name: "Agents" }));
        fireEvent.click(getByRole("button", { name: "+ Delegate work" }));
        expect(getByRole("dialog", { name: "Delegate work" })).toBeTruthy();

        fireEvent.input(getByLabelText("Delegation goal"), {
            target: { value: "Verify the workspace recovery flow" },
        });
        fireEvent.click(getByRole("button", { name: "Assign to Patch" }));
        fireEvent.click(getByRole("button", { name: "Plan only" }));
        fireEvent.click(getByRole("button", { name: "Start delegation" }));

        expect(getByText("Verify the workspace recovery flow")).toBeTruthy();
        expect(getByLabelText("Verify the workspace recovery flow run")).toBeTruthy();
    });

    it("opens a file change set and its verification evidence", () => {
        const { getByLabelText, getByRole, getByText } = render(() => <App />);

        fireEvent.click(getByRole("button", { name: "Files" }));
        expect(getByLabelText("Change review workspace")).toBeTruthy();
        expect(getByLabelText("WorkspaceCreator.tsx unified diff")).toBeTruthy();

        fireEvent.click(getByRole("button", { name: "Open WorkspaceHeader.tsx diff" }));
        expect(getByText("const [isRenaming, setIsRenaming] = createSignal(false);")).toBeTruthy();

        fireEvent.click(getByRole("button", { name: /Checks/ }));
        expect(getByLabelText("Verification checks")).toBeTruthy();
        expect(getByText("Workspace migration")).toBeTruthy();
    });

    it("adds an inline review comment and approves the agent change set", () => {
        const { getByLabelText, getByRole, getByText } = render(() => <App />);

        fireEvent.click(getByRole("button", { name: "Files" }));
        fireEvent.click(getByRole("button", { name: "Comment on WorkspaceCreator.tsx line 18" }));
        fireEvent.input(getByLabelText("Review comment"), {
            target: { value: "Keep this creation path safe for projects without a folder name." },
        });
        fireEvent.click(getByRole("button", { name: "Add comment" }));

        expect(
            getByText("Keep this creation path safe for projects without a folder name."),
        ).toBeTruthy();
        fireEvent.click(getByRole("button", { name: "Approve changes" }));
        expect(getByText("Approved")).toBeTruthy();
        expect(getByRole("button", { name: "Reopen review" })).toBeTruthy();
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

    it("wires human and bot avatar variants", () => {
        const { container } = render(() => <App />);
        const human = container.querySelector('[data-rigged-ui="avatar"][data-type="human"]');
        const bot = container.querySelector('[data-rigged-ui="avatar"][data-type="bot"]');

        expect(human).toBeTruthy();
        expect(bot).toBeTruthy();
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

    it("pauses an agent at an approval gate until a person allows the action", () => {
        const { getByLabelText, getByRole, getByText } = render(() => <App />);
        const request = getByLabelText("Approval request: Update shared onboarding manifest");

        expect(within(request).getByText("Waiting for a person")).toBeTruthy();
        fireEvent.click(getByRole("button", { name: "View approval details" }));
        expect(within(request).getByText("edit config/releases/onboarding.json")).toBeTruthy();
        expect(within(request).getByText("Shared config")).toBeTruthy();

        fireEvent.click(getByRole("button", { name: "Allow Forge action once" }));
        expect(within(request).getByText("Approved once")).toBeTruthy();
        expect(within(request).getByText("Forge may perform this action once")).toBeTruthy();
        expect(getByText("Undo")).toBeTruthy();
    });
});
