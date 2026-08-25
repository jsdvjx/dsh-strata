// Loads client.js under Node: the factory only needs a loader hook and a
// React stub at load time (the DOM is touched inside mountMinimap alone).
let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load(def) {
      loaded = def
    },
  },
}
await import('../client.js')
const react = {
  createElement() {},
  useRef() {},
  useEffect() {},
}
const mod = loaded.factory((name) => (name === 'react' ? react : undefined))
export const internals = mod.internals
export const id = loaded.id
