import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import type { PluginButtonControl, PluginInteractiveControl } from "happy2-state";
import "./theme.css";
import "./styles/button.css";
import "./styles/text-field.css";
import "./styles/plugin-contribution.css";
import {
    PluginContributionControl,
    PluginContributionMenuButton,
    type PluginContributionMenuState,
} from "./PluginContribution";
import { createRenderer } from "./testing";

const action = { toolName: "todos_set_alias" } as const;

function setInputValue(input: HTMLInputElement, value: string) {
    // Drive React's controlled input the way the browser does, so onInput fires.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function valueStore(initial: string) {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
        getState: () => value,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set(next: string) {
            value = next;
            for (const listener of listeners) listener();
        },
    };
}

function InputHarness(props: { store: ReturnType<typeof valueStore> }) {
    const value = useSyncExternalStore(
        props.store.subscribe,
        props.store.getState,
        props.store.getState,
    );
    const control: PluginInteractiveControl = {
        kind: "input",
        id: "alias",
        title: "Alias",
        description: "Shown to teammates",
        value,
        action,
    };
    return (
        <PluginContributionControl control={control} data-testid="ctl" onInvoke={() => undefined} />
    );
}

it("preserves the input DOM node and focus while an authoritative revision changes", async () => {
    const view = createRenderer();
    const store = valueStore("Sam");
    view.render(() => <InputHarness store={store} />, { width: 420, height: 160, padding: 16 });
    await view.ready();

    const input = view.$('[data-testid="ctl"] .happy2-text-field__input')
        .element as HTMLInputElement;
    input.focus();
    setInputValue(input, "Sammy");
    expect(input.value).toBe("Sammy");
    expect(document.activeElement).toBe(input);

    // A collaborator changes the authoritative value while the user has a pending
    // edit: the same DOM node stays mounted, focus is kept, the draft is not clobbered.
    store.set("Server value");
    await vi.waitFor(() => expect(store.getState()).toBe("Server value"));
    const after = view.$('[data-testid="ctl"] .happy2-text-field__input')
        .element as HTMLInputElement;
    expect(after, "the input node must not remount on a revision change").toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Sammy");
}, 120000);

it("adopts an authoritative value when there is no pending local edit", async () => {
    const view = createRenderer();
    const store = valueStore("Sam");
    view.render(() => <InputHarness store={store} />, { width: 420, height: 160, padding: 16 });
    await view.ready();
    const input = view.$('[data-testid="ctl"] .happy2-text-field__input')
        .element as HTMLInputElement;
    expect(input.value).toBe("Sam");
    // No local edit in flight → the new authoritative value is adopted in place.
    store.set("Renamed");
    await vi.waitFor(() =>
        expect(
            (view.$('[data-testid="ctl"] .happy2-text-field__input').element as HTMLInputElement)
                .value,
        ).toBe("Renamed"),
    );
    expect(
        view.$('[data-testid="ctl"] .happy2-text-field__input').element,
        "adoption updates in place, not by remount",
    ).toBe(input);
}, 120000);

interface MenuState {
    menuState?: PluginContributionMenuState;
}
function menuStore(initial: MenuState) {
    let state = initial;
    const listeners = new Set<() => void>();
    return {
        getState: () => state,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set(next: MenuState) {
            state = next;
            for (const listener of listeners) listener();
        },
    };
}

function AsyncMenuHarness(props: {
    store: ReturnType<typeof menuStore>;
    onMenuOpen: () => void;
    onInvoke: (id: string) => void;
}) {
    const state = useSyncExternalStore(
        props.store.subscribe,
        props.store.getState,
        props.store.getState,
    );
    return (
        <PluginContributionMenuButton
            actionId="msg-menu"
            data-testid="amenu"
            description="Message actions"
            kind="asyncMenu"
            menuState={state.menuState}
            onInvoke={props.onInvoke}
            onMenuOpen={props.onMenuOpen}
            title="Actions"
        />
    );
}

it("resolves an async menu on open and invokes the chosen item", async () => {
    const view = createRenderer();
    const store = menuStore({});
    const onMenuOpen = vi.fn(() => store.set({ menuState: { type: "loading" } }));
    const onInvoke = vi.fn((_id: string) => undefined);
    view.render(
        () => <AsyncMenuHarness onInvoke={onInvoke} onMenuOpen={onMenuOpen} store={store} />,
        {
            width: 280,
            height: 240,
            padding: 16,
        },
    );
    await view.ready();
    const menu = view.$('[data-testid="amenu"]');
    // No resolution until the menu opens (resolve-on-open, no manual refresh).
    expect(onMenuOpen).not.toHaveBeenCalled();
    (menu.element.querySelector("button") as HTMLButtonElement).click();
    expect(onMenuOpen).toHaveBeenCalledTimes(1);
    // Loading state is shown while resolving.
    await vi.waitFor(() =>
        expect(menu.element.querySelector("[role=status]")?.textContent).toContain("Loading"),
    );
    // The resolver returns items → the bounded typed list renders.
    const items: readonly PluginButtonControl[] = [
        {
            kind: "button",
            id: "pin",
            title: "Pin",
            description: "Pin message",
            assetId: "a",
            action,
        },
    ];
    store.set({ menuState: { type: "ready", items } });
    await vi.waitFor(() => expect(menu.element.querySelectorAll("[role=menuitem]").length).toBe(1));
    (menu.element.querySelector("[role=menuitem]") as HTMLButtonElement).click();
    expect(onInvoke).toHaveBeenCalledWith("pin");
}, 120000);
