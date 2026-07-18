import type { JSX } from "solid-js";

/*
 * Shared workbench fixtures. Blueprint pages compose these primitives;
 * page-specific arrangement uses inline styles so the shared workbench.css
 * stays page-agnostic.
 */

export function DimensionRule(props: { label: string }) {
    return (
        <span class="dimension-rule" aria-hidden="true">
            <i />
            <b>{props.label}</b>
            <i />
        </span>
    );
}

export function Specimen(props: {
    children: JSX.Element;
    detail: string;
    label: string;
    number: string;
    stage?: "chrome" | "app" | "surface";
}) {
    return (
        <article class="specimen">
            <header>
                <span>{props.number}</span>
                <strong>{props.label}</strong>
                <small>{props.detail}</small>
            </header>
            <div class="specimen-stage" data-stage={props.stage ?? "app"}>
                {props.children}
            </div>
        </article>
    );
}

/** Hosts one production desktop page at its exact minimum-window geometry and 100% scale. */
export function FullScreenSpecimen(props: {
    children: JSX.Element;
    detail: string;
    label: string;
    number: string;
}) {
    return (
        <article class="specimen full-screen-specimen">
            <header>
                <span>{props.number}</span>
                <strong>{props.label}</strong>
                <small>{props.detail}</small>
            </header>
            <div class="full-screen-stage">
                <div class="full-screen-viewport">{props.children}</div>
            </div>
        </article>
    );
}

export function ComponentPage(props: {
    children: JSX.Element;
    contract?: "Props only" | "Surface store";
    number: string;
    summary: string;
    title: string;
}) {
    return (
        <main class="component-page">
            <header class="component-title">
                <div class="component-number">{props.number}</div>
                <div>
                    <p>Component plan</p>
                    <h1>{props.title}</h1>
                    <span>{props.summary}</span>
                </div>
                <dl>
                    <div>
                        <dt>Framework</dt>
                        <dd>SolidJS</dd>
                    </div>
                    <div>
                        <dt>Contract</dt>
                        <dd>{props.contract ?? "Props only"}</dd>
                    </div>
                    <div>
                        <dt>Capture</dt>
                        <dd>2× retina</dd>
                    </div>
                </dl>
            </header>
            {props.children}
        </main>
    );
}
