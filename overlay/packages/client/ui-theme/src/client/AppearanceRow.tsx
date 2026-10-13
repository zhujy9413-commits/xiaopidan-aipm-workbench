/**
 * Appearance preference row registered into the General section item slot
 * (figma 501:30012 'Frame 2117131228'): title + three preference cubes.
 * Registered by this package — the theme feature owns its own settings
 * surface. Selection follows the persisted preference, never the resolved
 * active theme.
 */
import clsx from 'clsx'
import {
  IconDarkOutlineMedium, IconFollowsystemOutlineMedium, IconLightOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { GlassMode, ThemePreference } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
  /** AIPM-only material controls. */
  workbench?: boolean
  setGlassMode?: (mode: GlassMode) => void
  setGlassTransparency?: (value: number) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Cube order and icons (figma 501:30015-30017: Light, Dark, System). */
const CUBES: readonly { id: ThemePreference; labelKey: ThemeKey; Icon: typeof IconLightOutlineMedium }[] = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutlineMedium },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutlineMedium },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutlineMedium },
]

/**
 * Render the Appearance row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceRow({ t, setTheme, useStore, workbench, setGlassMode, setGlassTransparency }: AppearanceRowComponentProps) {
  const preference = useStore(s => s.preference)
  const mode = useStore(s => s.glassMode)
  const transparency = useStore(s => s.glassTransparency)
  const resolved = useStore(s => s.resolvedTheme)
  const solid = mode === 'system'
  const selected = workbench && !solid && preference === 'system' ? resolved : preference
  return (
    <div className={css.group}>
      <div className={css.title}>{t('appearance.title')}</div>
      {workbench && <div className={css.materialRow} role="group" aria-label={t('glass.material')}>
        {(['liquid', 'frosted', 'system'] as const).map(value => <button key={value} type="button"
          className={clsx(css.materialButton, mode === value && css.selected)} aria-pressed={mode === value}
          onClick={() => { setGlassMode?.(value) }}>{t(`glass.${value}`)}</button>)}
      </div>}
      <div className={clsx(css.cubeRow, workbench && css.workbenchColors)}>
        {CUBES.filter(cube => !workbench || solid || cube.id !== 'system').map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCube, selected === id && css.selected)}
            aria-pressed={selected === id}
            onClick={() => { setTheme(id) }}
          >
            <Icon />
            {t(labelKey)}
          </button>
        ))}
      </div>
      {workbench && <div className={css.transparency} style={{ visibility: solid ? 'hidden' : 'visible' }}
        aria-hidden={solid} {...(solid ? { inert: '' } : {})}>
        <label htmlFor="aipm-glass-transparency">{t('glass.transparency')} <output>{transparency}%</output></label>
        <input id="aipm-glass-transparency" type="range" min={0} max={100} step={1}
          value={transparency} disabled={solid}
          onChange={event => { setGlassTransparency?.(Number(event.currentTarget.value)) }} />
      </div>}
    </div>
  )
}
