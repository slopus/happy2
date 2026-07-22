import { useState } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/button.css";
import "./styles/composer.css";
import "./styles/composer-model-control.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import { Composer } from "./Composer";
import { ComposerModelControl, type ComposerModelChoice } from "./ComposerModelControl";
import { createRenderer } from "./testing";

const MODELS: readonly ComposerModelChoice[] = [
    { id: "sol", label: "5.6 Sol" },
    { id: "terra", label: "5.6 Terra" },
    { id: "luna", label: "5.6 Luna" },
];
const EFFORTS: readonly ComposerModelChoice[] = [
    { id: "standard", label: "Standard" },
    { id: "extra-high", label: "Extra High" },
];
const SPEEDS: readonly ComposerModelChoice[] = [
    { id: "standard", label: "Standard" },
    { id: "fast", label: "Fast" },
];

function Fixture() {
    const [model, setModel] = useState("sol");
    const [effort, setEffort] = useState("extra-high");
    const [speed, setSpeed] = useState("standard");
    const [advancedValue, setAdvancedValue] = useState(80);
    return (
        <div className="happy2-theme-dark" style={{ marginTop: "280px" }}>
            <Composer
                data-testid="composer"
                modelControl={
                    <ComposerModelControl
                        advancedValue={advancedValue}
                        data-testid="control"
                        effort={effort}
                        efforts={EFFORTS}
                        model={model}
                        models={MODELS}
                        onAdvancedValueChange={setAdvancedValue}
                        onEffortChange={setEffort}
                        onModelChange={setModel}
                        onSpeedChange={setSpeed}
                        speed={speed}
                        speeds={SPEEDS}
                    />
                }
                onSend={() => undefined}
                onValueChange={() => undefined}
                value=""
            />
        </div>
    );
}

it("composes the controlled model picker into the composer and navigates its panels", async () => {
    const view = createRenderer().render(() => <Fixture />, {
        width: 760,
        height: 500,
        padding: 20,
    });
    await view.ready();
    const slot = view.$('[data-testid="composer"] [data-happy2-ui="composer-model"]');
    const control = view.$('[data-testid="control"]');
    const trigger = view.$(
        '[data-testid="control"] [data-happy2-ui="composer-model-control-trigger"]',
    );
    expect(slot.element.contains(control.element)).toBe(true);
    expect(trigger.bounds()).toMatchObject({ height: 32, width: 240 });
    expect(trigger.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgb(44, 44, 46)",
        "border-radius": "999px",
        color: "rgb(255, 255, 255)",
    });
    expect(trigger.element.textContent).toContain("5.6 Sol");
    expect(trigger.element.textContent).toContain("Extra High");
    await userEvent.hover(trigger.element);
    for (const animation of trigger.element.getAnimations()) animation.finish();
    expect(trigger.computedStyle("transform")).toBe("matrix(1, 0, 0, 1, 0, -1)");
    await userEvent.unhover(trigger.element);
    for (const animation of trigger.element.getAnimations()) animation.finish();
    await userEvent.click(trigger.element);
    const menu = view.$('[data-testid="control"] [data-happy2-ui="composer-model-control-menu"]');
    expect(menu.bounds().width).toBe(240);
    expect(trigger.bounds().y - (menu.bounds().y + menu.bounds().height)).toBeCloseTo(8, 1);
    const modelRow = view.$(
        '[data-testid="control"] [data-happy2-ui="composer-model-control-row"]',
    );
    await userEvent.hover(modelRow.element);
    for (const animation of modelRow.element.getAnimations()) animation.finish();
    expect(modelRow.computedStyle("transform")).toBe("matrix(1, 0, 0, 1, 2, 0)");
    await userEvent.click(modelRow.element);
    const choices = view.$(
        '[data-testid="control"] [data-happy2-ui="composer-model-control-choices"]',
    );
    expect(choices.element.textContent).toContain("5.6 Terra");
    const terra = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>(
            '[data-testid="control"] [data-happy2-ui="composer-model-control-choice"]',
        ),
    ).find((choice) => choice.textContent === "5.6 Terra");
    await userEvent.click(terra!);
    expect(trigger.element.textContent).toContain("5.6 Terra");
    await userEvent.click(trigger.element);
    await userEvent.click(
        view.$('[data-testid="control"] [data-happy2-ui="composer-model-control-advanced"]')
            .element,
    );
    const slider = view.$('[data-testid="control"] [aria-label="Advanced reasoning budget"]')
        .element as HTMLInputElement;
    expect(slider.value).toBe("80");
    slider.value = "96";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    expect(slider.value).toBe("96");
    await view.screenshot("ComposerModelControl.test");
}, 120000);
