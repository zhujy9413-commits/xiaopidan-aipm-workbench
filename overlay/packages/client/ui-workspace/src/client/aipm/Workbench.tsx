/** Project overview and local product workflow controls. */
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useState } from 'react'
import { Button, IconNewChatOutlineRegular, IconPlusOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AipmProject, AipmStage } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { stages, type AipmProps } from './contract.ts'
import { AipmNavigator, navigationIcons } from './Navigator.tsx'
import css from './Workbench.module.css'
import { ProjectList } from './ProjectActions.tsx'
import { SessionActions } from './SessionActions.tsx'

type NoteField = 'evidence' | 'questions' | 'decisions' | 'deliverables'
const emptyKeys = { evidence: 'noEvidence', questions: 'noQuestions', decisions: 'noDecisions', deliverables: 'noDeliverables' } as const
const hintKeys = { evidence: 'evidenceHint', questions: 'questionsHint', decisions: 'decisionsHint', deliverables: 'deliverablesHint' } as const
const goalKeys = { idea: 'ideaGoal', research: 'researchGoal', proposal: 'proposalGoal', requirements: 'requirementsGoal', prd: 'prdGoal' } as const

/** Local note editor; discarded only on explicit cancellation or successful save. */
function Note({ project, field, compact, ...props }: AipmProps & { project: AipmProject; field: NoteField; compact?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(project[field])
  const busy = props.useAipm(s => s.busy)
  return <section className={css.card} data-compact={compact || undefined}>
    <div className={css.cardHeading}><h3>{props.t(field)}</h3><Button variant="ghost" disabled={busy} onClick={() => { setValue(project[field]); setEditing(true) }}>{props.t('edit')}</Button></div>
    {editing ? <form onSubmit={event => { event.preventDefault(); void props.saveProject({ ...project, [field]: value }).then(() => { setEditing(false) }).catch(() => {}) }}>
      <textarea aria-label={props.t(field)} value={value} onChange={event => { setValue(event.target.value) }} placeholder={props.t(hintKeys[field])} rows={compact ? 5 : 7} maxLength={100_000} autoFocus />
      <div className={css.formActions}><Button variant="outline" disabled={busy} onClick={() => { setEditing(false) }}>{props.t('cancel')}</Button><Button variant="primary" type="submit" disabled={busy}>{props.t(busy ? 'saving' : 'save')}</Button></div>
    </form> : <p className={project[field] ? css.note : css.empty}>{project[field] || props.t(emptyKeys[field])}</p>}
  </section>
}

/** Show concrete Agent recommendations and record only explicit button decisions. */
function Checkpoint({ project, ...props }: AipmProps & { project: AipmProject }) {
  const [format, setFormat] = useState('')
  const busy = props.useAipm(s => s.busy)
  const pending = project.pending
  if (!pending) return null
  return <section className={css.checkpoint} aria-label={props.t('confirmTitle')}>
    <h3>{props.t('confirmTitle')}</h3><p className={css.note}>{pending.summary}</p>
    {pending.nextStage && <p>{props.t('next')}: {props.t(pending.nextStage)}</p>}
    {pending.kind === 'delivery' && <label>{props.t('chooseFormat')}<select value={format} onChange={event => { setFormat(event.target.value) }}><option value="">{props.t('chooseFormat')}</option>{pending.formats.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    <div className={css.formActions}><Button variant="outline" disabled={busy} onClick={() => { void props.confirm(project, 'reject').catch(() => {}) }}>{props.t('reject')}</Button><Button variant="primary" disabled={busy || pending.kind === 'delivery' && !format} onClick={() => { void props.confirm(project, 'approve', format || undefined).catch(() => {}) }}>{props.t('approve')}</Button></div>
  </section>
}

/** List only product projects; selection always opens their overview. */
export function AipmSidebar(props: AipmProps & Omit<WorkspaceBrowserProps, 't'>) {
  const state = props.useAipm(s => s)
  const active = props.usePanelInfo(info => info.activePanelId === 'aipm')
  const recent = state.sessionRows.filter(row => !row.archived && !state.trashIds.includes(row.id)).slice(0, 8)
  return <div className={css.sidebar} data-wide={props.wide || undefined}>
    <nav className={css.navigation} aria-label={props.t('navigation')}>
      <button type="button" className={css.navItem} aria-label={props.t('newTask')} title={props.wide ? undefined : props.t('newTask')} onClick={props.newTask}><IconNewChatOutlineRegular size={18} />{props.wide && <span>{props.t('newTask')}</span>}</button>
      {(['search', 'projects', 'recent', 'archive', 'trash', 'skills'] as const).map(view => { const Icon = navigationIcons[view]; return <button type="button" className={css.navItem} key={view} aria-label={props.t(view)} title={props.wide ? undefined : props.t(view)} aria-current={active && state.view === view ? 'page' : undefined} onClick={() => { props.showView(view) }}><Icon size={18} />{props.wide && <span>{props.t(view)}</span>}</button> })}
    </nav>
    {props.wide && <div className={css.sidebarLists}>
      <div className={css.sidebarHeading}><span>{props.t('projects')}</span><button type="button" aria-label={props.t('newProject')} onClick={props.newProject}><IconPlusOutlineRegular size={15} /></button></div>
      <div className={css.projectList}>{!state.loaded ? <StateDot state="ongoing" size={20} /> : <ProjectList {...props} active={active} />}{!state.projects.length && <p className={css.sidebarEmpty}>{props.t('emptyProjects')}</p>}</div>
      <div className={css.sidebarHeading}><span>{props.t('recent')}</span></div>
      <div className={css.projectList}>{recent.map(row => <SessionActions {...props} row={row} key={row.id}><button type="button" className={css.chatRow} onClick={() => { props.openSession(row.id) }}><span className={css.sessionStatus} data-running={row.running || undefined} /><span>{row.title}</span></button></SessionActions>)}{!recent.length && <p className={css.sidebarEmpty}>{props.t('noSessions')}</p>}</div>
    </div>}
  </div>
}

/** Main landing page or selected project's overview. */
export function AipmWorkbench(props: AipmProps) {
  const state = props.useAipm(s => s)
  const [idea, setIdea] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState('')
  const project = state.projects.find(p => p.workspaceId === state.selected)
  if (state.view !== 'overview') return <AipmNavigator {...props} />
  if (!state.loaded) return <div className={css.loading}>{state.error ? <div role="alert" className={css.error}>{state.error}<Button onClick={() => { void props.refresh().catch(() => {}) }}>{props.t('refresh')}</Button></div> : <StateDot state="ongoing" size={28} />}</div>
  const creating = state.creating || project === undefined
  const status = <>{state.error && <div role="alert" className={css.error}>{state.error}<Button variant="ghost" onClick={() => { void props.refresh() }}>{props.t('refresh')}</Button></div>}{state.notice && <div role="status" className={css.notice}>{props.t('saved')}</div>}</>
  if (creating) return <div className={css.welcome}>
    <div className={css.eyebrow}>{props.t('brand')}</div><h1>{props.t('welcome')}</h1><p>{props.t('welcomeText')}</p>
    <form className={css.ideaForm} onSubmit={event => { event.preventDefault(); void props.createProject(idea).then(() => { setIdea('') }).catch(() => {}) }}>
      <label htmlFor="aipm-idea">{props.t('ideaLabel')}</label><textarea id="aipm-idea" value={idea} onChange={event => { setIdea(event.target.value) }} placeholder={props.t('ideaPlaceholder')} rows={4} maxLength={10_000} autoFocus />
      {status}<div className={css.formActions}>{project && <Button variant="outline" disabled={state.busy} onClick={props.cancel}>{props.t('cancel')}</Button>}<Button variant="primary" type="submit" disabled={!idea.trim() || state.busy}>{props.t('create')}</Button></div>
    </form>
    <div className={css.welcomeStages}>{stages.map((stage, i) => <span key={stage}><small>{String(i + 1).padStart(2, '0')}</small>{props.t(stage)}</span>)}</div>
  </div>
  const next = stages.find(stage => !project.completedStages.includes(stage))
  return <div className={css.page}>
    <header className={css.pageHeader}><div><div className={css.eyebrow}>{props.t('overview')} / {props.t('local')}</div><h1>{project.title}</h1><p>{project.idea}</p></div><Button variant="outline" onClick={() => { setTitle(project.title); setRenaming(true) }}>{props.t('rename')}</Button></header>
    {renaming && <form className={css.rename} onSubmit={event => { event.preventDefault(); void props.saveProject({ ...project, title: title.trim(), titleEdited: true }).then(() => { setRenaming(false) }).catch(() => {}) }}><label>{props.t('titleLabel')}<input value={title} onChange={event => { setTitle(event.target.value) }} maxLength={160} autoFocus /></label><Button type="submit" variant="primary" disabled={!title.trim() || state.busy}>{props.t('save')}</Button><Button variant="ghost" onClick={() => { setRenaming(false) }}>{props.t('cancel')}</Button></form>}
    {status}
    <div className={css.automation}><div><strong>{props.t('auto')}</strong><p>{props.t('autoTip')}</p></div><Button variant="outline" disabled={state.busy} onClick={() => { void props.saveProject({ ...project, automation: !project.automation }).catch(() => {}) }}>{props.t(project.automation ? 'pause' : 'resume')}</Button></div>
    <Checkpoint key={project.pending?.id ?? 'none'} {...props} project={project} />
    <div className={css.overviewGrid}><div className={css.mainContent}>
      <section className={css.workflow}><div className={css.sectionHeading}><h2>{props.t('workflow')}</h2><small>{props.t(project.automation ? 'auto' : 'manual')}</small></div><p className={css.empty}>{props.t(project.automation ? 'autoTip' : 'stageTip')}</p>
        <div className={css.stages}>{stages.map((stage, index) => <Stage key={stage} {...props} project={project} stage={stage} index={index} />)}</div>
      </section>
      <div className={css.notesGrid}>{(['evidence', 'decisions', 'deliverables'] as const).map(field => <Note key={`${project.workspaceId}:${field}`} {...props} project={project} field={field} />)}</div>
    </div><aside className={css.contextRail}>
      <section className={css.card}><div className={css.eyebrow}>{props.t('current')}</div><h2>{props.t(project.stage)}</h2><p className={css.empty}>{props.t(goalKeys[project.stage])}</p><Button variant="primary" disabled={state.busy} onClick={() => { void props.advance(project).catch(() => {}) }}>{props.t('continue')}</Button></section>
      <Note key={`${project.workspaceId}:questions`} {...props} project={project} field="questions" compact />
      <section className={css.card}><h3>{props.t('next')}</h3><p>{next === undefined ? props.t('allDone') : props.t(goalKeys[next])}</p><p className={css.empty}>{props.t('nextTip')}</p></section>
      <section className={css.card}><h3>{props.t('path')}</h3><p className={css.path}>{project.path}</p><p className={css.empty}>{props.t('namePending')}</p></section>
    </aside></div>
  </div>
}

/** Stage state changes are explicit and separate from opening a conversation. */
function Stage({ project, stage, index, ...props }: AipmProps & { project: AipmProject; stage: AipmStage; index: number }) {
  const busy = props.useAipm(s => s.busy)
  const completed = project.completedStages.includes(stage)
  return <div className={css.stage} data-current={project.stage === stage || undefined}>
    <span className={css.stageNumber}>{completed ? '✓' : String(index + 1).padStart(2, '0')}</span><div className={css.stageCopy}><strong>{props.t(stage)}</strong><small>{props.t(goalKeys[stage])}</small></div>
    <span className={css.badge}>{props.t(completed ? 'completed' : project.stage === stage ? 'current' : 'notStarted')}</span>
    <div className={css.stageActions}>{!project.automation && <><Button variant="ghost" disabled={busy} onClick={() => { void props.saveProject({ ...project, stage }).catch(() => {}) }}>{props.t('setCurrent')}</Button><Button variant="ghost" disabled={busy} onClick={() => { void props.saveProject({ ...project, completedStages: completed ? project.completedStages.filter(s => s !== stage) : [...project.completedStages, stage] }).catch(() => {}) }}>{props.t(completed ? 'reopen' : 'markComplete')}</Button></>}<Button variant="outline" disabled={busy || project.automation && stage !== project.stage && !completed} onClick={() => { void props.openStage(project, stage).catch(() => {}) }}>{props.t('openStage')}</Button></div>
  </div>
}

/** Navigation strip above the native Conversation. */
export function AipmRibbon(props: AipmProps & PropsRuntime<'conversation.aipm'>) {
  useEffect(() => { props.revealPendingSkill(props.sessionId) }, [props.sessionId, props.revealPendingSkill])
  const state = props.useAipm(s => s)
  const project = state.projects.find(p => Object.values(p.sessions).includes(props.sessionId!))
  if (!project) return null
  const active = stages.find(stage => project.sessions[stage] === props.sessionId) ?? project.stage
  return <div className={css.ribbon}><button type="button" onClick={() => { props.selectProject(project.workspaceId) }}>{project.title}<small>{props.t('overview')}</small></button><nav>{stages.map(stage => <button type="button" key={stage} data-selected={active === stage || undefined} disabled={state.busy || project.automation && stage !== project.stage && !project.completedStages.includes(stage)} onClick={() => { void props.openStage(project, stage).catch(() => {}) }}>{props.t(stage)}</button>)}</nav><Button variant="ghost" onClick={props.showContext}>{props.t(project.pending ? 'confirmTitle' : 'context')}</Button></div>
}

/** Project facts inside the existing right sidebar's tab system. */
export function AipmContext(props: AipmProps & PropsRuntime<'sidebar.right.pane.tab'>) {
  const state = props.useAipm(s => s)
  const project = state.projects.find(p => Object.values(p.sessions).includes(props.sessionId!))
  if (!project) return <p className={css.empty}>{props.t('emptyProjects')}</p>
  return <div className={css.contextBody}><Checkpoint key={project.pending?.id ?? 'none'} {...props} project={project} /><div className={css.sectionHeading}><h2>{project.title}</h2><span className={css.badge}>{props.t(project.stage)}</span></div>{state.error && <p role="alert" className={css.error}>{state.error}</p>}{state.notice && <p role="status" className={css.notice}>{props.t('saved')}</p>}{(['questions', 'evidence', 'decisions', 'deliverables'] as const).map(field => <Note key={`${project.workspaceId}:${field}`} {...props} project={project} field={field} compact />)}<Button variant="outline" onClick={props.showFiles}>{props.t('showFiles')}</Button><p className={css.path}>{project.path}</p></div>
}

/** Sidebar identity owned by the product fork. */
export function AipmBrand(props: AipmProps) { return <span className={css.brand}>{props.t('brandShort')}</span> }

/** Product-owned frosted monogram shared with the desktop identity. */
export function AipmBrandMark({ size }: { size: number }) { return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".5"/><rect x="7" y="6" width="18" height="20" rx="5" fill="currentColor" fillOpacity=".06" stroke="currentColor" strokeOpacity=".3"/><path d="M12 23V10h5a4 4 0 0 1 0 8h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="23" cy="23" r=".9" fill="currentColor"/></svg> }
