/** Project menus preserve local files when removing a registration. */
import { useState, type ReactNode } from 'react'
import { Button, Menu, MenuItemButton, Modal, IconEllipsisOutlineMedium, IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AipmProject } from '@deepseek-ai/dsh-api-workspace-controller/types'
import type { AipmProps } from './contract.ts'
import css from './Workbench.module.css'

/** @param props - project commands and row content. @returns accessible context menu and confirmation dialogs. */
export function ProjectActions({ project, children, ...props }: AipmProps & { project: AipmProject; children: ReactNode }) {
  const state = props.useAipm(s => s)
  const layout = state.projectLayout[project.workspaceId] ?? { pinned: false, section: '' }
  const [menu, setMenu] = useState(false)
  const [dialog, setDialog] = useState<'edit' | 'section' | 'archive' | 'remove' | null>(null)
  const [title, setTitle] = useState('')
  const [section, setSection] = useState('')
  const sections = [...new Set(Object.values(state.projectLayout).map(item => item.section).filter(Boolean))]
  const choose = (action: NonNullable<typeof dialog>) => { setMenu(false); setTitle(project.title); setSection(layout.section); setDialog(action) }
  const submit = (): Promise<void> => {
    if (dialog === 'edit') return props.saveProject({ ...project, title: title.trim(), titleEdited: true })
    if (dialog === 'section') return props.setProjectLayout(project.workspaceId, layout.pinned, section)
    if (dialog === 'archive' || dialog === 'remove') return props.projectAction(project, dialog)
    return Promise.resolve()
  }
  return <div className={css.projectActions} onContextMenu={event => { event.preventDefault(); setMenu(true) }}>
    {children}
    <Menu open={menu} onClose={() => { setMenu(false) }} side="bottom" portal autoFocus anchor={<button type="button" className={css.moreButton} aria-label={`${props.t('projectActions')}：${project.title}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => { setMenu(!menu) }}><IconEllipsisOutlineMedium size={16} /></button>}>
      <MenuItemButton disabled={state.busy} onSelect={() => { setMenu(false); void props.setProjectLayout(project.workspaceId, !layout.pinned, layout.section).catch(() => {}) }}>{props.t(layout.pinned ? 'unpin' : 'pin')}</MenuItemButton>
      <MenuItemButton disabled={state.busy} onSelect={() => { choose('edit') }}>{props.t('edit')}</MenuItemButton>
      <MenuItemButton disabled={state.busy} separatorBefore onSelect={() => { choose('section') }}>{props.t('section')}</MenuItemButton>
      <MenuItemButton disabled={state.busy} onSelect={() => { setMenu(false); void props.projectAction(project, 'reveal').catch(() => {}) }}>{props.t('revealProject')}</MenuItemButton>
      <MenuItemButton disabled={state.busy} separatorBefore onSelect={() => { choose('archive') }}>{props.t('archiveProject')}</MenuItemButton>
      <MenuItemButton disabled={state.busy} separatorBefore onSelect={() => { choose('remove') }}>{props.t('removeProject')}</MenuItemButton>
    </Menu>
    <Modal open={dialog !== null} onClose={() => { if (!state.busy) setDialog(null) }} closeLabel={props.t('cancel')} title={props.t(dialog === 'edit' ? 'edit' : dialog === 'section' ? 'section' : dialog === 'archive' ? 'archiveProjectTitle' : 'removeProjectTitle')} description={dialog === 'archive' ? props.t('archiveProjectDescription') : dialog === 'remove' ? props.t('removeProjectDescription') : project.title} footer={<><Button variant="outline" disabled={state.busy} onClick={() => { setDialog(null) }}>{props.t('cancel')}</Button><Button variant="primary" disabled={state.busy || dialog === 'edit' && !title.trim()} onClick={() => { void submit().then(() => { setDialog(null) }).catch(() => {}) }}>{props.t(dialog === 'archive' ? 'archiveProject' : dialog === 'remove' ? 'removeProject' : 'save')}</Button></>}>
      {dialog === 'edit' && <label className={css.projectField}>{props.t('titleLabel')}<input aria-label={props.t('titleLabel')} value={title} onChange={event => { setTitle(event.target.value) }} maxLength={160} autoFocus /></label>}
      {dialog === 'section' && <label className={css.projectField}>{props.t('sectionName')}<select aria-label={props.t('section')} value={sections.includes(section) || !section ? section : '__new'} onChange={event => { setSection(event.target.value === '__new' ? props.t('newSection') : event.target.value) }}><option value="">{props.t('noSection')}</option>{sections.map(name => <option key={name} value={name}>{name}</option>)}<option value="__new">{props.t('newSection')}</option></select><input aria-label={props.t('sectionName')} value={section} placeholder={props.t('newSection')} onChange={event => { setSection(event.target.value) }} maxLength={80} /></label>}
      {(dialog === 'remove' || dialog === 'archive') && <p className={css.path}>{project.path}</p>}
      {state.error && <p role="alert" className={css.error}>{state.error}</p>}
    </Modal>
  </div>
}

/** @param props - project snapshots and navigation. @returns pinned and sectioned project rows. */
export function ProjectList(props: AipmProps & { active: boolean }) {
  const state = props.useAipm(s => s)
  const groups = new Map<string, AipmProject[]>()
  for (const project of state.projects) {
    const layout = state.projectLayout[project.workspaceId]
    const group = layout?.pinned ? props.t('pinnedProjects') : layout?.section ?? ''
    groups.set(group, [...(groups.get(group) ?? []), project])
  }
  return <>{[...groups].sort(([a], [b]) => a === props.t('pinnedProjects') ? -1 : b === props.t('pinnedProjects') ? 1 : a.localeCompare(b)).map(([section, projects]) => <div key={section}>{section && <div className={css.sidebarHeading}>{section}</div>}{projects.map(project => <ProjectActions {...props} project={project} key={project.workspaceId}><button type="button" className={css.projectRow} data-selected={props.active && state.selected === project.workspaceId && state.view === 'overview' || undefined} onClick={() => { props.selectProject(project.workspaceId) }}><IconFolderCloseRegular size={16} /><span><strong>{project.title}</strong><small>{props.t(project.stage)}</small></span></button></ProjectActions>)}</div>)}</>
}
