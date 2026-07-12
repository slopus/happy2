import { createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { render } from "solid-js/web";
import { Avatar, Box, Button, type AvatarSize, type ButtonSize, type ButtonVariant } from "../src";
import "./workbench.css";

type ComponentId = "avatar" | "box" | "button";

const components: Array<{ id: ComponentId; label: string; number: string }> = [
    { id: "avatar", label: "Avatar", number: "C-003" },
    { id: "button", label: "Button", number: "C-002" },
    { id: "box", label: "Box", number: "C-001" },
];

function componentFromHash(): ComponentId {
    const id = window.location.hash.slice(1).toLowerCase();
    return components.some((component) => component.id === id) ? (id as ComponentId) : "button";
}

function DimensionRule(props: { label: string }) {
    return (
        <span class="dimension-rule" aria-hidden="true">
            <i />
            <b>{props.label}</b>
            <i />
        </span>
    );
}

function Specimen(props: { children: JSX.Element; detail: string; label: string; number: string }) {
    return (
        <article class="specimen">
            <header>
                <span>{props.number}</span>
                <strong>{props.label}</strong>
                <small>{props.detail}</small>
            </header>
            <div class="specimen-stage">{props.children}</div>
        </article>
    );
}

function ButtonPage() {
    const sizes: Array<{ height: number; size: ButtonSize; width: number }> = [
        { size: "small", height: 28, width: 112 },
        { size: "medium", height: 36, width: 128 },
        { size: "large", height: 44, width: 144 },
    ];
    const variants: ButtonVariant[] = ["primary", "secondary", "ghost"];

    return (
        <ComponentPage
            number="C-002"
            title="Button"
            summary="An action surface with fixed vertical rhythm and optically calibrated type."
        >
            <section class="specimen-grid specimen-grid--sizes" aria-label="Button size specimens">
                <For each={sizes}>
                    {(item, index) => (
                        <Specimen
                            number={`02.${index() + 1}`}
                            label={`${item.size} / primary`}
                            detail={`${item.width} × ${item.height}`}
                        >
                            <div class="dimensioned-button">
                                <DimensionRule label={`${item.width}px`} />
                                <Button size={item.size} width={item.width}>
                                    Button
                                </Button>
                                <span class="height-callout">{item.height}px</span>
                            </div>
                        </Specimen>
                    )}
                </For>
            </section>

            <section class="variant-sheet" aria-labelledby="variant-title">
                <div class="sheet-heading">
                    <span>02.4</span>
                    <div>
                        <h2 id="variant-title">Variant elevation</h2>
                        <p>Identical geometry, three levels of visual emphasis.</p>
                    </div>
                </div>
                <div class="variant-row">
                    <For each={variants}>
                        {(variant) => (
                            <div>
                                <Button variant={variant} size="medium" width={136}>
                                    {variant}
                                </Button>
                                <code>{variant}</code>
                            </div>
                        )}
                    </For>
                </div>
                <div class="full-width-demo">
                    <DimensionRule label="container width" />
                    <Button fullWidth>Full width</Button>
                </div>
            </section>
        </ComponentPage>
    );
}

function AvatarPage() {
    const sizes: Array<{ dimension: number; size: AvatarSize }> = [
        { size: "xs", dimension: 18 },
        { size: "sm", dimension: 36 },
        { size: "md", dimension: 40 },
    ];

    return (
        <ComponentPage
            number="C-003"
            title="Avatar"
            summary="A prop-driven identity mark with fixed geometry and measured optical alignment."
        >
            <section class="specimen-grid specimen-grid--sizes" aria-label="Avatar size specimens">
                <For each={sizes}>
                    {(item, index) => (
                        <Specimen
                            number={`03.${index() + 1}`}
                            label={`${item.size} / human`}
                            detail={`${item.dimension} × ${item.dimension}`}
                        >
                            <div class="dimensioned-avatar">
                                <DimensionRule label={`${item.dimension}px`} />
                                <Avatar
                                    initials="ST"
                                    size={item.size}
                                    online={item.size === "sm"}
                                    style={{
                                        background:
                                            "linear-gradient(145deg, #3ca8a4, #4b5fb0 52%, #d14c78)",
                                    }}
                                />
                            </div>
                        </Specimen>
                    )}
                </For>
            </section>

            <section class="avatar-sheet" aria-labelledby="avatar-forms-title">
                <div class="sheet-heading">
                    <span>03.4</span>
                    <div>
                        <h2 id="avatar-forms-title">Identity forms</h2>
                        <p>Human, agent, presence, and image content share one measured shell.</p>
                    </div>
                </div>
                <div class="avatar-form-row">
                    <div>
                        <Avatar
                            initials="MC"
                            style={{ background: "linear-gradient(145deg, #cf7548, #e9a752)" }}
                            online
                        />
                        <code>human / online</code>
                    </div>
                    <div>
                        <Avatar
                            initials="F"
                            type="bot"
                            style={{ background: "linear-gradient(145deg, #ef566d, #8056c7)" }}
                        />
                        <code>bot</code>
                    </div>
                </div>
            </section>
        </ComponentPage>
    );
}

function BoxPage() {
    return (
        <ComponentPage
            number="C-001"
            title="Box"
            summary="A neutral layout primitive whose geometry is completely controlled by props."
        >
            <section class="box-plans" aria-label="Box dimension specimens">
                <Specimen number="01.1" label="fixed dimensions" detail="240 × 120">
                    <div class="box-demo box-demo--fixed">
                        <DimensionRule label="240px" />
                        <Box width={240} height={120} class="blueprint-box">
                            <span>240 × 120</span>
                            <small>fixed</small>
                        </Box>
                    </div>
                </Specimen>
                <Specimen number="01.2" label="percentage width" detail="62.5% × 96">
                    <div class="box-demo box-demo--fluid">
                        <Box width="62.5%" height={96} class="blueprint-box blueprint-box--light">
                            <span>62.5%</span>
                            <small>container-relative</small>
                        </Box>
                    </div>
                </Specimen>
                <Specimen number="01.3" label="nested geometry" detail="320 × 180">
                    <Box width={320} height={180} class="blueprint-box blueprint-box--frame">
                        <Box width="50%" height="50%" class="blueprint-box blueprint-box--nested">
                            <span>50 × 50%</span>
                        </Box>
                    </Box>
                </Specimen>
            </section>
        </ComponentPage>
    );
}

function ComponentPage(props: {
    children: JSX.Element;
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
                        <dd>Props only</dd>
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

function Workbench() {
    const [active, setActive] = createSignal<ComponentId>(componentFromHash());
    const syncHash = () => setActive(componentFromHash());

    onMount(() => window.addEventListener("hashchange", syncHash));
    onCleanup(() => window.removeEventListener("hashchange", syncHash));

    const selectComponent = (id: ComponentId) => {
        window.location.hash = id;
        setActive(id);
    };

    return (
        <div class="workbench-shell">
            <header class="workbench-header">
                <a href="#button" class="workbench-brand" aria-label="rigged-ui home">
                    <span>R</span>
                    <strong>rigged-ui</strong>
                    <i>component plans</i>
                </a>
                <div class="header-axis" aria-hidden="true">
                    <span>0</span>
                    <i />
                    <span>1200</span>
                </div>
                <label class="component-select">
                    <span>Component</span>
                    <select
                        aria-label="Open component page"
                        value={active()}
                        onInput={(event) =>
                            selectComponent(event.currentTarget.value as ComponentId)
                        }
                    >
                        <For each={components}>
                            {(component) => (
                                <option value={component.id}>
                                    {component.number} · {component.label}
                                </option>
                            )}
                        </For>
                    </select>
                    <b aria-hidden="true">⌄</b>
                </label>
            </header>
            <div class="blueprint-field">
                <Show
                    when={active() === "avatar"}
                    fallback={
                        <Show when={active() === "button"} fallback={<BoxPage />}>
                            <ButtonPage />
                        </Show>
                    }
                >
                    <AvatarPage />
                </Show>
            </div>
        </div>
    );
}

render(() => <Workbench />, document.getElementById("root")!);
