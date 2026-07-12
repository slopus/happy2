import "./styles.css";
import { expect, it } from "vitest";
import { assertParallelRoundedCorners, createRenderer } from "./testing";

it("enforces parallel nested curves and symmetric insets for every rendered rigged-ui part", async () => {
    const view = createRenderer().render(
        () => (
            <div
                data-rigged-ui="parallel-corner-outer"
                style={{
                    height: "100px",
                    position: "relative",
                    "border-radius": "14px",
                    width: "100px",
                }}
            >
                <div
                    data-rigged-ui="parallel-corner-inner"
                    style={{
                        position: "absolute",
                        inset: "4px",
                        "border-radius": "10px",
                    }}
                />
            </div>
        ),
        { height: 100, width: 100 },
    );
    await view.ready();

    const inner = view.$('[data-rigged-ui="parallel-corner-inner"]').element as HTMLElement;
    inner.style.borderRadius = "9px";
    expect(() => assertParallelRoundedCorners(view.container)).toThrowError(
        /inner radius 9\.000px × 9\.000px.*expected 10\.000px × 10\.000px/,
    );

    inner.style.borderRadius = "10px";
    inner.style.top = "5px";
    expect(() => assertParallelRoundedCorners(view.container)).toThrowError(
        /horizontal inset 4\.000px and vertical inset 5\.000px must match/,
    );
});
