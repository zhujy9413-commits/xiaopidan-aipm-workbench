/** macOS glass-ui background adapter and acknowledged two-layer transitions. */
import { createRequire } from 'node:module'
import { nativeTheme, type BrowserWindow } from 'electron'

interface Appearance {
  mode: 'liquid' | 'frosted' | 'system'
  theme: 'system' | 'light' | 'dark'
  transparency: number
}
interface NativeGlass {
  setAppearance(handle: Buffer, theme: string): void
  setGlass(handle: Buffer, enabled: boolean): boolean
  setFrostedOpacity(handle: Buffer, opacity: number): number
  inspect(handle: Buffer): unknown
}
interface WindowState { current: Appearance; pending?: { id: number; next: Appearance; timer: NodeJS.Timeout } | undefined }
const windows = new WeakMap<BrowserWindow, WindowState>()
let sequence = 0
let addon: NativeGlass | undefined
function native(): NativeGlass {
  return addon ??= createRequire(import.meta.url)('../resources/glass/native-glass.node') as NativeGlass
}
function validate(value: unknown): Appearance {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid glass appearance')
  const input = value as Record<string, unknown>
  if (!['liquid', 'frosted', 'system'].includes(String(input.mode))
    || !['light', 'dark', 'system'].includes(String(input.theme))
    || typeof input.transparency !== 'number' || !Number.isInteger(input.transparency)
    || input.transparency < 0 || input.transparency > 100) throw new TypeError('Invalid glass appearance')
  return { mode: input.mode as Appearance['mode'], theme: input.theme as Appearance['theme'], transparency: input.transparency }
}
function reducedTransparency(window: BrowserWindow): boolean {
  const value = native().inspect(window.getNativeWindowHandle()) as { reduceTransparency?: boolean }
  return value.reduceTransparency === true
}
function apply(window: BrowserWindow, state: Appearance): void {
  const bridge = native(), handle = window.getNativeWindowHandle()
  bridge.setAppearance(handle, state.theme)
  window.setBackgroundColor('#00000000')
  window.contentView.setBackgroundColor('#00000000')
  for (const child of window.contentView.children) child.setBackgroundColor('#00000000')
  window.setVibrancy(null, { animationDuration: 0 })
  bridge.setGlass(handle, state.mode === 'liquid')
  if (state.mode === 'frosted') {
    window.setVibrancy('sidebar', { animationDuration: 0 })
    if (!bridge.setFrostedOpacity(handle, .95 - state.transparency * .001)) {
      throw new Error('No independent native frosted background was found')
    }
  }
  if (!window.isFullScreen() && !window.isSimpleFullScreen()) window.setWindowButtonPosition({ x: 16, y: 18 })
}
/** Initialize one supported window and release transition timers on close.
 * @param window Personal desktop window created with a transparent backing.
 */
export function installGlassWindow(window: BrowserWindow): void {
  const state: WindowState = { current: { mode: 'system', theme: 'dark', transparency: 65 } }
  windows.set(window, state)
  const restore = (): void => {
    if (!window.isDestroyed() && !window.isMinimized()) {
      try { const next = state.pending?.next ?? state.current; apply(window, reducedTransparency(window) ? { ...next, mode: 'system' } : next) } catch (error) { console.error('glass-ui background restoration failed', error) }
    }
  }
  nativeTheme.on('updated', restore)
  window.on('show', restore)
  window.on('restore', restore)
  window.on('leave-full-screen', restore)
  window.once('closed', () => { nativeTheme.off('updated', restore); if (state.pending) clearTimeout(state.pending.timer); windows.delete(window) })
}
/** Prepare glass before renderer transparency; solid remains behind the previous renderer until commit.
 * @param window Authorized application window.
 * @param value Validated appearance preferences from the owning renderer.
 * @returns Transaction identity acknowledged after renderer paint.
 */
export function prepareGlass(window: BrowserWindow, value: unknown): number {
  const next = validate(value), state = windows.get(window)
  if (!state) throw new Error('Native glass is unavailable in this window')
  if (state.pending) { clearTimeout(state.pending.timer); apply(window, state.current); state.pending = undefined }
  try { if (next.mode !== 'system') apply(window, reducedTransparency(window) ? { ...next, mode: 'system' } : next) }
  catch (error) { apply(window, state.current); throw error }
  const id = ++sequence
  const timer = setTimeout(() => {
    if (state.pending?.id !== id || window.isDestroyed()) return
    state.pending = undefined
    apply(window, state.current)
  }, 5000)
  state.pending = { id, next, timer }
  return id
}
/** Complete or roll back a prepared transition after the renderer has painted.
 * @param window Authorized application window.
 * @param id Identity issued by prepareGlass.
 * @param accept Whether both layers accept the new display.
 */
export function commitGlass(window: BrowserWindow, id: unknown, accept: unknown): void {
  const state = windows.get(window), pending = state?.pending
  if (!state || !pending || pending.id !== id || typeof accept !== 'boolean') throw new Error('Stale glass transition')
  clearTimeout(pending.timer)
  try {
    const next = accept ? pending.next : state.current
    apply(window, reducedTransparency(window) ? { ...next, mode: 'system' } : next)
    if (accept) state.current = pending.next
  } catch (error) { apply(window, state.current); throw error }
  finally { state.pending = undefined }
}
/** Read native composition diagnostics without collecting desktop pixels.
 * @param window Authorized application window.
 * @returns Native view properties and committed appearance.
 */
export function inspectGlass(window: BrowserWindow): unknown {
  return { appearance: windows.get(window)?.current, native: native().inspect(window.getNativeWindowHandle()) }
}
