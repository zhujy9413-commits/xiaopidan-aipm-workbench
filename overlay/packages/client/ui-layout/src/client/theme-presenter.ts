/**
 * Global theme DOM applier: projects the resolved ThemeSnapshot onto the
 * document — `html { color-scheme }` for native UA chrome (scrollbars, form
 * controls), `body[data-ds-dark-theme]` for the token palette, the active
 * theme's alias-token overrides as inline CSS variables on body, the content
 * font-size axis (`--dsh-content-font-size`), `html[data-ds-theme-source]`
 * for native-chrome mirroring, and one presenter-owned
 * `meta[name="theme-color"]` for surrounding browser UI. Pure DOM writes, no
 * React involvement; the presenter only ever retracts what it wrote itself,
 * so foreign attributes, metadata, and inline styles survive.
 */
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

interface GlassBridge {
  prepare(value: { mode: string; theme: string; transparency: number }): Promise<number>
  commit(id: number, accept: boolean): Promise<void>
}
declare global { interface Window { __DSH_GLASS__?: GlassBridge } }

/** Body attribute selecting the dark base palette in the token stylesheets. */
export const DARK_ATTRIBUTE = 'data-ds-dark-theme'

/**
 * Root attribute publishing the theme source (`light`, `dark`, or `system`)
 * for host shells that mirror it into the native theme (the Electron preload
 * forwards it to `nativeTheme.themeSource`, so native chrome, renderer
 * `prefers-color-scheme` queries, and Platform login links follow the app
 * palette on every platform). `system` only when the preference is `system`;
 * a fixed preference (including registered theme ids) publishes its resolved
 * scheme.
 */
export const THEME_SOURCE_ATTRIBUTE = 'data-ds-theme-source'

/** Body variable carrying the user's content font size in px. */
export const CONTENT_FONT_SIZE_VARIABLE = '--dsh-content-font-size'

/** Applies theme snapshots to the document; one instance per plugin fiber. */
export class ThemePresenter {
  /** Token names this presenter wrote in the last apply (its retraction set). */
  private appliedTokens: string[] = []
  private glassQueue: Promise<void> = Promise.resolve()
  private committed?: ThemeSnapshot
  private disposed = false
  private requestRevision = 0
  /** The single metadata node this presenter inserts and removes. */
  private readonly themeColorMeta: HTMLMetaElement

  /** Create the presenter-owned metadata node before the first snapshot arrives. */
  constructor() {
    this.themeColorMeta = document.createElement('meta')
    this.themeColorMeta.name = 'theme-color'
  }

  /**
   * Project a snapshot onto the document: set root `color-scheme` and the body
   * palette attribute from `active.colorScheme` (never the id — `system` is
   * resolved upstream), publish the content font-size axis, then replace the
   * previously applied token variables with `active.tokens`. Browser
   * theme-color metadata follows the computed body background after those
   * writes, so the rendered palette remains the color authority.
   * @param snapshot - resolved theme snapshot from ctx.theme.
   */
  apply(snapshot: ThemeSnapshot): void {
    if (process.env.DSH_CLIENT_AIPM !== '1') { this.paint(snapshot); return }
    const revision = ++this.requestRevision
    const bridge = window.__DSH_GLASS__
    this.glassQueue = this.glassQueue.then(async () => {
      if (this.disposed || revision !== this.requestRevision) return
      let id: number | undefined
      const mode = snapshot.glassMode ?? 'frosted'
      try {
        if (bridge) id = await bridge.prepare({ mode, theme: snapshot.preference, transparency: snapshot.glassTransparency ?? 65 })
        if (this.disposed) { if (id !== undefined) await bridge?.commit(id, false); return }
        this.paint(snapshot)
        this.paintGlass(snapshot, mode, Boolean(bridge))
        if (id !== undefined) {
          await new Promise<void>(resolve => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) }) })
          await bridge?.commit(id, !this.disposed)
          if (this.disposed) return
        }
        this.committed = snapshot
      } catch (error) {
        if (this.committed) {
          this.paint(this.committed)
          this.paintGlass(this.committed, this.committed.glassMode ?? 'frosted', Boolean(bridge))
        } else { this.paint(snapshot); this.paintGlass(snapshot, 'system', false) }
        if (id !== undefined) { try { await bridge?.commit(id, false) } catch { /* Main process already reverted an expired transition. */ } }
        console.error('glass-ui appearance could not be applied', error)
      }
    })
  }

  private paintGlass(snapshot: ThemeSnapshot, mode: string, native: boolean): void {
    const root = document.documentElement, body = document.body
    root.dataset.glassMode = mode
    root.style.colorScheme = mode === 'system' ? snapshot.active.colorScheme : 'normal'
    body.dataset.glassMode = mode
    body.dataset.systemTheme = snapshot.systemTheme ?? snapshot.active.colorScheme
    body.dataset.glassTone = snapshot.active.colorScheme
    body.dataset.solidTheme = snapshot.active.colorScheme
    body.dataset.nativeGlass = String(native && mode !== 'system')
    body.style.setProperty('--glass-transparency', String((snapshot.glassTransparency ?? 65) / 100))
  }

  private paint(snapshot: ThemeSnapshot): void {
    const scheme = snapshot.active.colorScheme
    document.documentElement.style.colorScheme = scheme
    document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE,
      snapshot.preference === 'system' ? 'system' : scheme)
    const body = document.body
    if (scheme === 'dark') body.setAttribute(DARK_ATTRIBUTE, '')
    else body.removeAttribute(DARK_ATTRIBUTE)
    body.style.setProperty(CONTENT_FONT_SIZE_VARIABLE, `${snapshot.fontSize}px`)
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      body.style.setProperty(name, value)
      this.appliedTokens.push(name)
    }
    this.themeColorMeta.content = getComputedStyle(body).backgroundColor
    if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta)
  }

  /**
   * Retract root color-scheme, the theme-source attribute, the palette
   * attribute, token variables, the font-size axis, and the owned metadata node.
   */
  dispose(): void {
    this.disposed = true
    delete document.documentElement.dataset.glassMode
    const target = document.body
    delete target.dataset.systemTheme
    delete target.dataset.glassMode
    delete target.dataset.glassTone
    delete target.dataset.solidTheme
    delete target.dataset.nativeGlass
    target.style.removeProperty('--glass-transparency')
    document.documentElement.style.removeProperty('color-scheme')
    document.documentElement.removeAttribute(THEME_SOURCE_ATTRIBUTE)
    const body = document.body
    body.removeAttribute(DARK_ATTRIBUTE)
    body.style.removeProperty(CONTENT_FONT_SIZE_VARIABLE)
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    this.themeColorMeta.remove()
  }
}
