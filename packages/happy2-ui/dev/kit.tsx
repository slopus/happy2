import { type ReactNode } from "react";
/*
 * Shared workbench fixtures. Blueprint pages compose these primitives;
 * page-specific arrangement uses inline styles so the shared workbench.css
 * stays page-agnostic.
 */
export function DimensionRule(props: { label: string }) {
    return (
        <span className="dimension-rule" aria-hidden="true">
            <i />
            <b>{props.label}</b>
            <i />
        </span>
    );
}
export function Specimen(props: {
    children: ReactNode;
    detail: string;
    label: string;
    number: string;
    stage?: "chrome" | "app" | "surface";
}) {
    return (
        <article className="specimen">
            <header>
                <span>{props.number}</span>
                <strong>{props.label}</strong>
                <small>{props.detail}</small>
            </header>
            <div className="specimen-stage" data-stage={props.stage ?? "app"}>
                {props.children}
            </div>
        </article>
    );
}
/** Hosts one production desktop page at its exact minimum-window geometry and 100% scale. */
export function FullScreenSpecimen(props: {
    children: ReactNode;
    detail: string;
    label: string;
    number: string;
}) {
    return (
        <article className="specimen full-screen-specimen">
            <header>
                <span>{props.number}</span>
                <strong>{props.label}</strong>
                <small>{props.detail}</small>
            </header>
            <div className="full-screen-stage">
                <div className="full-screen-viewport">{props.children}</div>
            </div>
        </article>
    );
}
export function ComponentPage(props: {
    children: ReactNode;
    contract?: "Props only" | "Surface store";
    number: string;
    summary: string;
    title: string;
}) {
    return (
        <main className="component-page">
            <header className="component-title">
                <div className="component-number">{props.number}</div>
                <div>
                    <p>Component plan</p>
                    <h1>{props.title}</h1>
                    <span>{props.summary}</span>
                </div>
                <dl>
                    <div>
                        <dt>Framework</dt>
                        <dd>React</dd>
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
