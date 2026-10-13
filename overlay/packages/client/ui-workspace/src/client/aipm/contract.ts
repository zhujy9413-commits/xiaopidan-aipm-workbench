/** Workbench component inputs bound by the slot renderer. */
import type { InjectFace, PropsLocale, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { AipmProject, AipmStage, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SkillEntry } from '@deepseek-ai/dsh-api-session-controller/types'
import type { AipmView, AipmState } from './store.ts'
import type { AipmKey } from './locales.ts'
export const stages: readonly AipmStage[] = ['idea', 'research', 'proposal', 'requirements', 'prd']
export interface AipmInjected {
  hooks: { aipm: HostObservable<AipmState> }
  showView: (view: AipmView) => void
  setQuery: (query: string) => void
  search: () => Promise<void>
  openSession: (id: SessionId) => void
  archiveSession: (id: SessionId, archived: boolean) => Promise<void>
  trashSession: (id: SessionId, restore: boolean) => Promise<void>
  openSkill: (skill: SkillEntry) => void
  revealPendingSkill: (id: SessionId | undefined) => void
  projectAction: (project: AipmProject, action: 'reveal' | 'archive' | 'remove') => Promise<void>
  setProjectLayout: (id: WorkspaceId, pinned: boolean, section: string) => Promise<void>
  newTask: () => void
  newProject: () => void
  cancel: () => void
  selectProject: (id: WorkspaceId) => void
  createProject: (idea: string) => Promise<void>
  saveProject: (project: AipmProject) => Promise<void>
  openStage: (project: AipmProject, stage: AipmStage) => Promise<void>
  refresh: () => Promise<void>
  advance: (project: AipmProject) => Promise<void>
  confirm: (project: AipmProject, decision: 'approve' | 'reject', format?: string) => Promise<void>
  showContext: () => void
  showFiles: () => void
}
export type AipmProps = InjectFace<AipmInjected> & PropsLocale<'aipm'>
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { aipm: AipmKey }
  interface SlotMap { 'conversation.aipm': { kind: 'list'; scope: 'session-maybe' } }
}
