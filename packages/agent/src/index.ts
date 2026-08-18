// Re-exports only — the embed entry point is `boot.ts`, which the bundle builds from directly, so
// importing this package for a type never boots a widget. [ENGINEERING §2.8]
export { renderBlock, renderChips, renderText } from './blocks'
export { configUrl, isConfigResponse, loadConfig, readCache, str, writeCache } from './config'
export { cornerCss, LAUNCHER_Z_INDEX, MOBILE_QUERY, styles } from './css'
export { FALLBACK } from './fallback'
export type { Block, Chip, ConfigResponse, Product } from './types'
export { MxAgent, TAG } from './widget'
