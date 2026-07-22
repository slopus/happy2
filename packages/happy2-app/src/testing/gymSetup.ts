const disposableSymbol = Symbol as SymbolConstructor & {
    dispose?: symbol;
    asyncDispose?: symbol;
};

if (!disposableSymbol.dispose) {
    Object.defineProperty(disposableSymbol, "dispose", { value: Symbol("Symbol.dispose") });
}
if (!disposableSymbol.asyncDispose) {
    Object.defineProperty(disposableSymbol, "asyncDispose", {
        value: Symbol("Symbol.asyncDispose"),
    });
}
