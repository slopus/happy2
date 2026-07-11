import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("switches workspaces from the rail", () => {
    const { getByLabelText, getByRole } = render(() => <App />);

    const orbit = getByRole("button", { name: "Orbit" });
    fireEvent.click(orbit);

    expect(orbit.getAttribute("aria-pressed")).toBe("true");
    expect(getByLabelText("Orbit workspace")).toBeTruthy();
  });

  it("shows the search query in the workspace canvas", () => {
    const { getByRole, getByText } = render(() => <App />);

    fireEvent.input(getByRole("searchbox", { name: "Search the workspace" }), {
      target: { value: "desktop" }
    });

    expect(getByText("Searching Rigged for “desktop”")).toBeTruthy();
  });
});
