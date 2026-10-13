/** Search, archived chats, projects and the session-scoped skill catalog. */
import { Button, IconArchiveOutlineRegular, IconClockOutlineRegular, IconFolderCloseRegular, IconSearchOutlineRegular, IconSkillOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AipmProps } from './contract.ts'
import type { AipmView } from './store.ts'
import css from './Workbench.module.css'
import { ProjectActions } from './ProjectActions.tsx'
import { SessionActions } from './SessionActions.tsx'

/** Shared monochrome navigation artwork. */
export const navigationIcons = { projects: IconFolderCloseRegular, search: IconSearchOutlineRegular, recent: IconClockOutlineRegular, archive: IconArchiveOutlineRegular, trash: IconArchiveOutlineRegular, skills: IconSkillOutlineRegular }

/** A functional landing surface backed by Host session and project records. */
export function AipmNavigator(props: AipmProps) {
  const state = props.useAipm(s => s)
  const view = state.view as Exclude<AipmView, 'overview'>
  const query = state.query.trim().toLocaleLowerCase()
  const rows = state.sessionRows.filter(row => view === 'trash' ? state.trashIds.includes(row.id) : !state.trashIds.includes(row.id) && (view === 'archive' ? row.archived : !row.archived))
    .filter(row => view !== 'search' || !query || row.title.toLocaleLowerCase().includes(query) || row.id in state.searchHits)
  return <div className={css.page}>
    <header className={css.pageHeader}><div><div className={css.eyebrow}>{props.t('brandShort')}</div><h1>{props.t(view)}</h1><p>{props.t(view === 'skills' ? 'skillsDescription' : view === 'projects' ? 'projectsDescription' : 'sessionsDescription')}</p></div>
      {view === 'projects' && <Button variant="primary" onClick={props.newProject}>{props.t('newProject')}</Button>}
      {view === 'skills' && <Button variant="outline" disabled={state.busy} onClick={() => { props.showView('skills') }}>{props.t('refresh')}</Button>}
    </header>
    {state.error && <p role="alert" className={css.error}>{state.error}</p>}
    {view === 'search' && <form className={css.searchForm} onSubmit={event => { event.preventDefault(); void props.search() }}>
      <IconSearchOutlineRegular size={18} /><input aria-label={props.t('search')} placeholder={props.t('searchPlaceholder')} value={state.query} onChange={event => { props.setQuery(event.target.value) }} autoFocus />
      <Button variant="outline" type="submit" disabled={state.searchBusy}>{props.t('search')}</Button>
    </form>}
    {view === 'projects' ? <div className={css.projectGrid}>
      {state.projects.map(project => <ProjectActions {...props} project={project} key={project.workspaceId}><button className={css.projectTile} type="button" key={project.workspaceId} onClick={() => { props.selectProject(project.workspaceId) }}><IconFolderCloseRegular size={20} /><strong>{project.title}</strong><p>{project.idea}</p><small>{props.t(project.stage)}</small></button></ProjectActions>)}
      {!state.projects.length && <p className={css.empty}>{props.t('emptyProjects')}</p>}
    </div> : view === 'skills' ? <div className={css.catalogList}>
      {state.busy && !state.skillsLoaded ? <StateDot state="ongoing" size={28} /> : state.skills.length ? state.skills.map(skill => <section className={css.catalogCard} key={skill.name}><IconSkillOutlineRegular size={20} /><div><h3>{skill.name}</h3><p>{skill.description}</p><code>/{skill.name}</code></div>{skill.path && <Button variant="outline" onClick={() => { props.openSkill(skill) }}>{props.t('openSkill')}</Button>}</section>) : <p className={css.empty}>{props.t('noSkills')}</p>}
    </div> : <div className={css.catalogList}>
      {state.searchBusy && <StateDot state="ongoing" size={24} />}
      {rows.map(row => <div className={css.sessionItem} key={row.id}><button type="button" className={css.sessionOpen} aria-label={row.title} disabled={row.archived} onClick={() => { props.openSession(row.id) }}><span className={css.sessionStatus} data-running={row.running || undefined} /><span><strong>{row.title}</strong>{state.searchHits[row.id] && <small>{state.searchHits[row.id]}</small>}<time>{new Date(row.updatedAt).toLocaleString()}</time></span></button><Button variant="ghost" disabled={state.busy || row.running && !row.archived} onClick={() => { void (view === 'trash' ? props.trashSession(row.id, true) : props.archiveSession(row.id, row.archived)).catch(() => {}) }}>{props.t(view === 'trash' || row.archived ? 'restore' : 'archive')}</Button><SessionActions {...props} row={row} /></div>)}
      {!rows.length && !state.searchBusy && <p className={css.empty}>{props.t(view === 'trash' ? 'noTrash' : view === 'archive' ? 'noArchived' : view === 'search' && query ? 'noMatches' : 'noSessions')}</p>}
    </div>}
  </div>
}
