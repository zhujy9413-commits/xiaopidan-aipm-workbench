/** Shared workbench navigation and Host-backed project snapshots. */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { SkillEntry } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AipmProject, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
export type AipmView = 'overview' | 'projects' | 'search' | 'recent' | 'archive' | 'trash' | 'skills'
export interface AipmSessionRow { id: SessionId; title: string; updatedAt: number; running: boolean; archived: boolean }
export interface AipmState {
  projectLayout: Record<string, { pinned: boolean; section: string }>
  view: AipmView
  trashIds: SessionId[]
  query: string
  sessionRows: AipmSessionRow[]
  searchHits: Record<string, string>
  searchBusy: boolean
  skills: readonly SkillEntry[]
  skillsLoaded: boolean

  projects: AipmProject[]
  selected: WorkspaceId | null
  creating: boolean
  loaded: boolean
  busy: boolean
  error: string | null
  notice: boolean
}
/** @returns one root-scoped project view store. */
export function createAipmStore() {
  return defineStore({
    init: (): AipmState => ({ projectLayout: {}, view: 'overview', trashIds: [], query: '', sessionRows: [], searchHits: {}, searchBusy: false, skills: [], skillsLoaded: false, projects: [], selected: null, creating: false, loaded: false, busy: false, error: null, notice: false }),
    actions: {
      projectLayout: (draft: AipmState, layout: AipmState['projectLayout']) => { draft.projectLayout = layout },
      trash: (draft: AipmState, ids: SessionId[]) => { draft.trashIds = ids },
      view: (draft: AipmState, view: AipmView) => { draft.view = view; draft.error = null },
      query: (draft: AipmState, query: string) => { draft.query = query; draft.searchHits = {} },
      sessionRows: (draft: AipmState, rows: AipmSessionRow[]) => { draft.sessionRows = rows },
      searchBusy: (draft: AipmState, busy: boolean) => { draft.searchBusy = busy },
      searchHits: (draft: AipmState, hits: Record<string, string>) => { draft.searchHits = hits },
      skills: (draft: AipmState, skills: readonly SkillEntry[]) => { draft.skills = [...skills]; draft.skillsLoaded = true },
      load: (draft: AipmState, projects: AipmProject[]) => { draft.projects = projects; if (!draft.loaded) draft.error = null; draft.loaded = true; if (!projects.some(p => p.workspaceId === draft.selected)) draft.selected = projects[0]?.workspaceId ?? null },
      upsert: (draft: AipmState, project: AipmProject) => { const at = draft.projects.findIndex(p => p.workspaceId === project.workspaceId); if (at < 0) draft.projects.unshift(project); else draft.projects[at] = project },
      select: (draft: AipmState, id: WorkspaceId) => { draft.selected = id; draft.view = 'overview'; draft.creating = false; draft.error = null; draft.notice = false },
      newProject: (draft: AipmState) => { draft.creating = true; draft.view = 'overview'; draft.error = null },
      cancel: (draft: AipmState) => { draft.creating = false },
      busy: (draft: AipmState, busy: boolean) => { draft.busy = busy; if (busy) { draft.error = null; draft.notice = false } },
      fail: (draft: AipmState, error: string) => { draft.error = error },
      saved: (draft: AipmState) => { draft.notice = true },
    },
  })
}
