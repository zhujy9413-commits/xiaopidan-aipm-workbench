import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
const addon = vi.hoisted(() => ({ setGlass: vi.fn(), setAppearance: vi.fn(), setFrostedOpacity: vi.fn(() => 1), inspect: vi.fn(() => ({ reduceTransparency: false })) }))
vi.mock('node:module', () => ({ createRequire: () => () => addon }))
vi.mock('electron', () => ({ nativeTheme: { on: vi.fn(), off: vi.fn() } }))
import { installGlassWindow, prepareGlass, commitGlass, inspectGlass } from '../src/glass.ts'
function createWindow() {
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false, isMinimized: () => false, isFullScreen: () => false, isSimpleFullScreen: () => false,
    getNativeWindowHandle: () => Buffer.alloc(8), setBackgroundColor: vi.fn(), setVibrancy: vi.fn(),
    setWindowButtonPosition: vi.fn(), contentView: { setBackgroundColor: vi.fn(), children: [] },
  })
  installGlassWindow(window as unknown as BrowserWindow)
  return window as unknown as BrowserWindow
}
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })
it('prepares glass before renderer paint and defers removal until solid renderer acknowledgment', () => {
  const window = createWindow()
  const glass = prepareGlass(window, { mode: 'frosted', theme: 'dark', transparency: 100 })
  expect(addon.setFrostedOpacity).toHaveBeenLastCalledWith(expect.any(Buffer), .85)
  commitGlass(window, glass, true)
  vi.clearAllMocks()
  const solid = prepareGlass(window, { mode: 'system', theme: 'light', transparency: 100 })
  expect(addon.setGlass).not.toHaveBeenCalled()
  commitGlass(window, solid, true)
  expect(addon.setGlass).toHaveBeenCalledWith(expect.any(Buffer), false)
  expect(inspectGlass(window)).toMatchObject({ appearance: { mode: 'system', theme: 'light', transparency: 100 } })
  window.emit('closed')
})
it('rejects malformed preferences and restores the committed appearance when a renderer does not commit', () => {
  const window = createWindow()
  for (const transparency of [-1, 101, .5, '90']) {
    expect(() => prepareGlass(window, { mode: 'liquid', theme: 'dark', transparency })).toThrow()
  }
  const id = prepareGlass(window, { mode: 'liquid', theme: 'light', transparency: 65 })
  vi.advanceTimersByTime(5000)
  expect(inspectGlass(window)).toMatchObject({ appearance: { mode: 'system', theme: 'dark' } })
  expect(() => commitGlass(window, id, true)).toThrow('Stale')
  window.emit('closed')
})
