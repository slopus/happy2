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
    const { getByLabelText, getByRole } = render(() => <App />);

    const tasks = getByRole("button", { name: "Tasks" });
    fireEvent.click(tasks);

    expect(tasks.getAttribute("aria-pressed")).toBe("true");
    expect(getByLabelText("Tasks view")).toBeTruthy();
  });

  it("shows the search query in the active feature", () => {
    const { getByRole, getByText } = render(() => <App />);

    fireEvent.input(getByRole("searchbox", { name: "Search Rigged" }), {
      target: { value: "desktop" }
    });

    expect(getByText("Searching Home for “desktop”")).toBeTruthy();
  });
});
