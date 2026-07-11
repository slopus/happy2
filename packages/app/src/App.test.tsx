import { fireEvent, render } from "@solidjs/testing-library";
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
      target: { value: "desktop" }
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
});
