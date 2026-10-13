/** Recoverable chat deletion shared by sidebar and chat lists. */
import { useState, type ReactNode } from 'react'
import { Button, Menu, MenuItemButton, Modal, IconEllipsisOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AipmProps } from './contract.ts'
import type { AipmSessionRow } from './store.ts'
import css from './Workbench.module.css'

export function SessionActions({ row, children, ...props }: AipmProps & { row: AipmSessionRow; children?: ReactNode }) {
  const state = props.useAipm(s => s)
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const trashed = state.trashIds.includes(row.id)
  return <div className={children ? css.sidebarSession : css.rowActions} onContextMenu={event => { event.preventDefault(); setMenu(true) }}>
    {children}
    <Menu open={menu} onClose={() => { setMenu(false) }} side="bottom" portal autoFocus anchor={<button type="button" className={css.moreButton} aria-label={`${props.t('sessionActions')}：${row.title}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => { setMenu(!menu) }}><IconEllipsisOutlineMedium size={16} /></button>}>
      {trashed ? <MenuItemButton disabled={state.busy} onSelect={() => { setMenu(false); void props.trashSession(row.id, true).catch(() => {}) }}>{props.t('restore')}</MenuItemButton> : <>
        <MenuItemButton disabled={state.busy || row.running} onSelect={() => { setMenu(false); void props.archiveSession(row.id, row.archived).catch(() => {}) }}>{props.t(row.archived ? 'restore' : 'archive')}</MenuItemButton>
        <MenuItemButton disabled={state.busy || row.running} onSelect={() => { setMenu(false); setConfirm(true) }}>{props.t('deleteSession')}</MenuItemButton>
      </>}
    </Menu>
    <Modal open={confirm} onClose={() => { if (!state.busy) setConfirm(false) }} closeLabel={props.t('cancel')} title={props.t('deleteTitle')} description={`${row.title} — ${props.t('deleteDescription')}`} footer={<><Button variant="outline" disabled={state.busy} onClick={() => { setConfirm(false) }}>{props.t('cancel')}</Button><Button variant="primary" disabled={state.busy} onClick={() => { void props.trashSession(row.id, false).then(() => { setConfirm(false) }).catch(() => {}) }}>{props.t('deleteSession')}</Button></>}>
      {state.error && <p role="alert" className={css.error}>{state.error}</p>}
    </Modal>
  </div>
}
