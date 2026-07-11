import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("increments the shared counter", () => {
    render(() => <App />);

    const button = screen.getByRole("button", { name: "Count: 0" });
    fireEvent.click(button);

    expect(screen.getByRole("button", { name: "Count: 1" })).toBeTruthy();
  });
});
