import { Button } from "../../src/Button";
import { Lightbox } from "../../src/Lightbox";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const column: Record<string, string> = {
    display: "flex",
    "flex-direction": "column",
    gap: "14px",
};

/* Screenshot-safe inline artwork: a deterministic SVG data-URI photo so the
 * blueprint never loads a network asset. */
function demoImage(width: number, height: number, from: string, to: string): string {
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>` +
        `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
        `<stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>` +
        `</linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/>` +
        `<circle cx='${width * 0.7}' cy='${height * 0.35}' r='${height * 0.18}' fill='rgba(255,255,255,0.22)'/>` +
        `</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function LightboxPage() {
    return (
        <ComponentPage
            number="C-046"
            summary="Full image preview inside a web modal (never a new browser tab). A transparent centering layer wraps a raised card with an optional caption/actions header and a contained image on the code surface."
            title="Lightbox"
        >
            <Specimen
                detail="caption + detail + download action + close · image contained on the code surface"
                label="Lightbox — full"
                number="01"
                stage="surface"
            >
                <div style={column}>
                    <Lightbox
                        actions={
                            <Button
                                aria-label="Download"
                                icon="files"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                        }
                        alt="Device farm results"
                        caption="device-farm-green.png"
                        detail="640 × 400 · 412 KB"
                        imageUrl={demoImage(640, 400, "#8b7cf7", "#f472b6")}
                        onClose={() => {}}
                    />
                    <DimensionRule label="14 px shell radius · 52 px header · frame max 620 px" />
                </div>
            </Specimen>

            <Specimen
                detail="Header collapses to just the close control when no caption/detail is set"
                label="Lightbox — image only"
                number="02"
                stage="surface"
            >
                <Lightbox
                    alt="Onboarding hero"
                    imageUrl={demoImage(360, 480, "#60a5fa", "#34d399")}
                    onClose={() => {}}
                />
            </Specimen>
        </ComponentPage>
    );
}
