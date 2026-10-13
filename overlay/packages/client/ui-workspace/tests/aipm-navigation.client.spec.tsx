// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ProjectActions, ProjectList } from '../src/client/aipm/ProjectActions.tsx'
import type { AipmProject, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { SessionActions } from '../src/client/aipm/SessionActions.tsx'
import { AipmNavigator } from '../src/client/aipm/Navigator.tsx'
import { createAipmStore, type AipmState } from '../src/client/aipm/store.ts'
import type { AipmProps } from '../src/client/aipm/contract.ts'
import { zh } from '../src/client/aipm/locales.ts'

afterEach(cleanup)
const sid = (id: string): SessionId => id as SessionId
function fixture(patch: Partial<AipmState> = {}) {
  const state: AipmState = { ...createAipmStore().create().getSnapshot(), ...patch }
  const props: AipmProps = {
    projectAction: vi.fn(async () => {}), setProjectLayout: vi.fn(async () => {}),
    useAipm: select => select(state), t: makeTranslate(zh),
    revealPendingSkill: vi.fn(), newTask: vi.fn(), showView: vi.fn(), setQuery: vi.fn(), search: vi.fn(async () => {}),
    trashSession: vi.fn(async () => {}), openSession: vi.fn(), archiveSession: vi.fn(async () => {}), openSkill: vi.fn(),
    newProject: vi.fn(), cancel: vi.fn(), selectProject: vi.fn(), createProject: vi.fn(async () => {}),
    saveProject: vi.fn(async () => {}), openStage: vi.fn(async () => {}), refresh: vi.fn(async () => {}),
    advance: vi.fn(async () => {}), confirm: vi.fn(async () => {}), showContext: vi.fn(), showFiles: vi.fn(),
  }
  return { state, props }
}
const rows = [
  { id: sid('live'), title: '产品想法讨论', updatedAt: 1, running: true, archived: false },
  { id: sid('done'), title: '需求证据', updatedAt: 2, running: false, archived: false },
  { id: sid('old'), title: '旧方案', updatedAt: 3, running: false, archived: true },
]
describe('AIPM navigation destinations', () => {
  it('includes message-content hits and submits the current search without showing unrelated chats', () => {
    const { props } = fixture({ view: 'search', query: '访谈', sessionRows: rows, searchHits: { done: '访谈原文记录' } })
    render(<AipmNavigator {...props} />)
    expect(screen.queryByText('产品想法讨论')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '需求证据' }))
    expect(props.openSession).toHaveBeenCalledWith(sid('done'))
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(props.search).toHaveBeenCalledOnce()
  })
  it('restores archived chats without allowing them to be opened while archived', () => {
    const { props } = fixture({ view: 'archive', sessionRows: rows })
    render(<AipmNavigator {...props} />)
    expect(screen.getByRole('button', { name: '旧方案' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByText('需求证据')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '恢复' }))
    expect(props.archiveSession).toHaveBeenCalledWith(sid('old'), true)
  })
  it('keeps running chats visible and prevents archiving active work', () => {
    const { props } = fixture({ view: 'recent', sessionRows: rows })
    render(<AipmNavigator {...props} />)
    expect(screen.getAllByRole('button', { name: '归档' })[0]!.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: '归档' })[1]!)
    expect(props.archiveSession).toHaveBeenCalledWith(sid('done'), false)
  })
  it('hides deleted chats from recents and restores them from the recycle bin', () => {
    const recent = fixture({ view: 'recent', sessionRows: rows, trashIds: [sid('done')] })
    const mounted = render(<AipmNavigator {...recent.props} />)
    expect(screen.queryByText('需求证据')).toBeNull()
    mounted.unmount()
    const deleted = fixture({ view: 'trash', sessionRows: rows, trashIds: [sid('done')] })
    render(<AipmNavigator {...deleted.props} />)
    fireEvent.click(screen.getByRole('button', { name: '恢复' }))
    expect(deleted.props.trashSession).toHaveBeenCalledWith(sid('done'), true)
  })
  it('offers deletion from the row context menu and requires the recycle-bin confirmation', () => {
    const { props } = fixture()
    render(<SessionActions {...props} row={rows[1]!}><button>需求证据</button></SessionActions>)
    fireEvent.contextMenu(screen.getByRole('button', { name: '需求证据' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))
    expect(props.trashSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(props.trashSession).toHaveBeenCalledWith(sid('done'), false)
  })
  it('opens the supplied skill source without invoking the model', () => {
    const skill = { name: 'product-checklist', description: '产品检查', path: '/skills/product-checklist/SKILL.md', modelInvocable: true }
    const { props } = fixture({ view: 'skills', skills: [skill], skillsLoaded: true })
    render(<AipmNavigator {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '查看文件' }))
    expect(props.openSkill).toHaveBeenCalledWith(skill)
    expect(props.openSession).not.toHaveBeenCalled()
    expect(props.advance).not.toHaveBeenCalled()
  })
})

const project: AipmProject = {
  pending: null, approval: null, workspaceId: 'project-menu-test' as WorkspaceId, title: '产品项目', titleEdited: false,
  idea: '一个产品想法', path: '/tmp/aipm-project-menu-test', stage: 'idea', completedStages: [],
  sessions: {}, evidence: '', questions: '', decisions: '', deliverables: '', automation: false,
  revision: 1, updatedAt: '2026-10-08T00:00:00Z',
}
describe('AIPM project menu', () => {
  it('opens by right click and reveals the selected project directory', () => {
    const { props } = fixture()
    render(<ProjectActions {...props} project={project}><button>产品项目</button></ProjectActions>)
    fireEvent.contextMenu(screen.getByRole('button', { name: '产品项目' }))
    for (const name of ['置顶', '编辑', '分区', '在 Finder 中显示', '归档聊天', '移除项目']) expect(screen.getByRole('menuitem', { name })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: '在 Finder 中显示' }))
    expect(props.projectAction).toHaveBeenCalledWith(project, 'reveal')
  })
  it('confirms project removal while explaining that local files remain', () => {
    const { props } = fixture()
    render(<ProjectActions {...props} project={project}><button>产品项目</button></ProjectActions>)
    fireEvent.click(screen.getByRole('button', { name: '项目操作：产品项目' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移除项目' }))
    expect(props.projectAction).not.toHaveBeenCalled()
    expect(screen.getByText(zh.removeProjectDescription)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '移除项目' }))
    expect(props.projectAction).toHaveBeenCalledWith(project, 'remove')
  })
  it('edits the project name rather than creating a new project', () => {
    const { props } = fixture()
    render(<ProjectActions {...props} project={project}><button>产品项目</button></ProjectActions>)
    fireEvent.contextMenu(screen.getByRole('button', { name: '产品项目' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑' }))
    fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), { target: { value: '新的名称' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(props.saveProject).toHaveBeenCalledWith({ ...project, title: '新的名称', titleEdited: true })
    expect(props.createProject).not.toHaveBeenCalled()
  })
  it('groups pinned projects and saves a custom section', () => {
    const { props } = fixture({ projects: [project], projectLayout: { [project.workspaceId]: { pinned: true, section: 'AI 产品' } } })
    render(<ProjectList {...props} active={false} />)
    expect(screen.getByText('置顶项目')).toBeTruthy()
    fireEvent.contextMenu(screen.getByRole('button', { name: '产品项目想法澄清' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '分区' }))
    fireEvent.change(screen.getByRole('textbox', { name: '分区名称' }), { target: { value: '研究中' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(props.setProjectLayout).toHaveBeenCalledWith(project.workspaceId, true, '研究中')
  })
})
