// Use the same Vue instance injected by Tavern Helper into this iframe.
const Vue = globalThis.Vue;
if (!Vue) throw new Error("Tavern Helper Vue runtime is required");
export const { computed, effectScope, getCurrentScope, hasInjectionContext, inject, isReactive, isReadonly, isRef, markRaw, nextTick, onScopeDispose, reactive, ref, toRaw, toRef, toRefs, unref, watch } = Vue;
