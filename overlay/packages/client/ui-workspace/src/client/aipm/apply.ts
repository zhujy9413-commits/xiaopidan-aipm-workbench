/** Bind the product UI to real Workspace and Session controllers. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { AipmProject } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { UiWorkspace } from '../navigation.ts'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { IconFolderCloseRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { createAipmStore } from './store.ts'
import type { AipmInjected } from './contract.ts'
import { AipmWorkbench, AipmSidebar, AipmRibbon, AipmContext, AipmBrand, AipmBrandMark } from './Workbench.tsx'
import { zh, en } from './locales.ts'

const PANEL = 'aipm' as MainPanelId
const TAB = 'aipm.project.context'

/** @param ctx - injected browser services. @param navigation - existing Session navigator. @param sessions - real Session controller. */
export function registerAipm(ctx: Context, navigation: UiWorkspace, sessions: ISessions): () => AipmInjected {
  const handle = createAipmStore()
  const instance = handle.create()
  const state = instance.actions
  const source = { getSnapshot: () => instance.getSnapshot(), subscribe: (listener: () => void) => instance.subscribe(listener) }
  ctx.effect(() => ctx.locale.register('aipm', { zh, en }), 'aipm: dictionaries')
  const t = ctx.locale.bind('aipm')
  ctx.effect(() => { document.body.setAttribute('data-aipm-workbench', ''); return () => { document.body.removeAttribute('data-aipm-workbench') } }, 'aipm: visual identity')
  let pendingSkill: { sessionId: SessionId; path: string } | undefined
  let skillSession: SessionId | undefined
  let alive = true
  ctx.effect(() => () => { alive = false }, 'aipm: view lifetime')
  let operation: Promise<unknown> = Promise.resolve()
  const run = <T,>(work: () => Promise<T>): Promise<T> => {
    const result = operation.then(async () => {
      state.busy(true)
      try { return await work() }
      catch (error) { if (alive) state.fail(error instanceof Error ? error.message : t('error')); throw error }
      finally { if (alive) state.busy(false) }
    })
    operation = result.then(() => undefined, () => undefined)
    return result
  }
  const refresh = async (): Promise<void> => {
    const trash = await ctx.get('remote.workspace')!.aipmTrashList()
    if (!trash.ok) throw new Error(trash.error.message)
    if (alive && JSON.stringify(trash.value) !== JSON.stringify(instance.getSnapshot().trashIds)) state.trash(trash.value)
    const result = await ctx.get('remote.workspace')!.aipmList()
    if (!result.ok) throw new Error(result.error.message)
    if (alive) {
      const snapshot = instance.getSnapshot()
      const unchanged = snapshot.loaded && result.value.length === snapshot.projects.length
        && result.value.every((project: AipmProject, index: number) => project.workspaceId === snapshot.projects[index]?.workspaceId && project.revision === snapshot.projects[index]?.revision)
      if (!unchanged) state.load(result.value)
    }
  }
  const save = async (project: AipmProject): Promise<AipmProject> => {
    const result = await ctx.get('remote.workspace')!.aipmSave({ project })
    if (!result.ok) throw new Error(result.error.message)
    if (alive) state.upsert(result.value)
    return result.value
  }
  const selectProject = (id: AipmProject['workspaceId']): void => {
    state.select(id)
    ctx.layout.selectPanel(PANEL)
    ctx.layout.closeRightbar()
  }
  const open = async (requested: AipmProject, stage: AipmProject['stage'], advance = false, continuation?: string): Promise<void> => {
      const found = instance.getSnapshot().projects.find(p => p.workspaceId === requested.workspaceId)
      if (!found) throw new Error(t('error'))
      if (advance && found.pending) throw new Error(t('waitingConfirmation'))
      const prepared = await ctx.get('remote.workspace')!.aipmPrepare({ workspaceId: found.workspaceId })
      if (!prepared.ok) throw new Error(prepared.error.message)
      const project = prepared.value
      state.upsert(project)
      let sessionId = project.sessions[stage]
      if (sessionId && instance.getSnapshot().trashIds.includes(sessionId)) throw new Error(t('stageInTrash'))
      const fresh = sessionId === undefined
      if (sessionId === undefined) {
        sessionId = await sessions.create({ workspaceId: project.workspaceId })
        await save({ ...project, sessions: { ...project.sessions, [stage]: sessionId } })
      }
      state.select(project.workspaceId)
      navigation.openSession(sessionId)
      if (fresh || advance) {
        const prompt = [
          ...(continuation ? [continuation] : []),
          `项目想法：${project.idea}`,
          `当前讨论阶段：${t(stage)}`,
          '你是我的 AI 产品协作伙伴。读取 AGENTS.md 和 .aipm/project.json，并依据当前状态推进工作。',
          stage === 'idea' ? '为项目拟定简短名称，用 aipm_progress 同步名称，并与我澄清目标用户、真实问题和使用场景。' : '继续推进当前阶段，沿用其他阶段已经确认的证据和结论。',
          '默认使用工作台通用产品流程，不自动调用专用立项 Skill；仅当用户明确选择「立项报告」模式时，按该模式的 lxbg_skill 执行。其他模式中旧会话的专用 Skill 自动加载指令仍已撤销。',
          '自动完成当前阶段中不依赖新授权的研究、梳理和修订。缺信息时用 ask_user_question 每轮问1–3个问题；尚未获得回答不能视为确认。',
          '重要结论区分事实、用户陈述、推断、假设与待验证项，附来源和日期；无法研究时明确证据缺口。',
          '用 aipm_progress 同步共享记录和推荐下一步。阶段切换、确认理解、草案内容与交付格式必须提交 checkpoint，随后结束回复，等待工作台确认卡；不得直接改 project.json。',
          '正式产出物只在内容和格式已确认后生成到 deliverables/，登记真实存在的文件。',
        ].join('\n\n')
        await sessions.using(sessionId, { source: 'workspaceOperation' }, async reference => {
          if (project.automation && (advance || fresh)) {
            const result = await reference.binding.session.prompt([{ type: 'text', text: prompt }], 'queue')
            if (!result.ok) throw new Error(t('sendFailed'))
          } else ctx.get('conversation')!.input.requestDraftInitialization(reference.binding, { prompt })
        })
      }
  }

  const layoutKey = 'aipm.project-layout.v1'
  const restoreLayout = (): void => {
    const raw: unknown = JSON.parse(localStorage.getItem(layoutKey) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(t('error'))
    const layout: ReturnType<typeof instance.getSnapshot>['projectLayout'] = {}
    for (const [id, entry] of Object.entries(raw)) {
      if (!entry || typeof entry !== 'object' || !('pinned' in entry) || typeof entry.pinned !== 'boolean' || !('section' in entry) || typeof entry.section !== 'string') throw new Error(t('error'))
      layout[id] = { pinned: entry.pinned, section: entry.section }
    }
    state.projectLayout(layout)
  }
  try { restoreLayout() } catch (error) { state.fail(error instanceof Error ? error.message : t('error')) }
  ctx.effect(() => { const listener = (event: StorageEvent) => { if (event.key === layoutKey) { try { restoreLayout() } catch (error) { state.fail(error instanceof Error ? error.message : t('error')) } } }; window.addEventListener('storage', listener); return () => { window.removeEventListener('storage', listener) } }, 'aipm: project grouping')
  const workspaces = ctx.get('workspaces') as IWorkspaces
  const syncSessions = (): void => {
    const catalog = sessions.list.getSnapshot()
    const archived = new Set(workspaces.list.getSnapshot().archivedSessionIds)
    const rows = catalog.ids.map(id => catalog.byId[id]).filter(row => row !== undefined).filter(row => row.origin !== 'subagent')
      .map(row => ({ id: row.id, title: row.displayTitle, updatedAt: row.updatedAt, running: row.running, archived: archived.has(row.id) }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    if (JSON.stringify(rows) !== JSON.stringify(instance.getSnapshot().sessionRows)) state.sessionRows(rows)
  }
  ctx.effect(() => { const dispose = sessions.list.subscribe(syncSessions); syncSessions(); return dispose }, 'aipm: session list')
  ctx.effect(() => workspaces.list.subscribe(syncSessions), 'aipm: archive changes')
  const loadSkills = (): Promise<void> => run(async () => {
    const snapshot = instance.getSnapshot()
    const project = snapshot.projects.find(project => project.workspaceId === snapshot.selected)
    skillSession = project?.sessions[project.stage] ?? snapshot.sessionRows.find(row => !row.archived)?.id
      ?? await sessions.create(project ? { workspaceId: project.workspaceId } : {})
    await sessions.using(skillSession, { source: 'workspaceOperation' }, async () => {
      const result = await ctx.get('remote.skills')!.list({ sessionId: skillSession! })
      if (!result.ok) throw new Error(result.error.message)
      state.skills(result.value.skills)
    })
  })
  let searchAbort: AbortController | undefined
  ctx.effect(() => () => { searchAbort?.abort() }, 'aipm: search lifetime')
  const face = (): AipmInjected => ({
    hooks: { aipm: source },
    setProjectLayout: (id, pinned, section) => run(async () => {
      const layout = { ...instance.getSnapshot().projectLayout, [id]: { pinned, section: section.trim() } }
      localStorage.setItem(layoutKey, JSON.stringify(layout))
      state.projectLayout(layout)
    }),
    projectAction: (project, action) => run(async () => {
      if (action === 'reveal') {
        const result = await ctx.get('remote.session')!.openWorkspacePath({ path: project.path, action: 'reveal' })
        if (!result.ok) throw new Error(result.error.message)
        return
      }
      const ids = workspaces.list.getSnapshot().items.find(item => item.workspaceId === project.workspaceId)?.sessionIds ?? []
      if (ids.some(id => sessions.list.getSnapshot().byId[id]?.running)) throw new Error(t('projectRunning'))
      if (action === 'archive') {
        if (project.automation) await save({ ...project, automation: false })
        for (const id of ids) await navigation.archiveSession(id)
        syncSessions()
      } else {
        if (project.automation) await save({ ...project, automation: false })
        await workspaces.delete(project.workspaceId)
        await refresh()
        ctx.layout.selectPanel(PANEL)
        ctx.layout.closeRightbar()
      }
    }),
    newTask: () => { const project = instance.getSnapshot().projects.find(project => project.workspaceId === instance.getSnapshot().selected); navigation.startSession(project?.workspaceId) },
    showView: view => { state.view(view); ctx.layout.selectPanel(PANEL); ctx.layout.closeRightbar(); if (view === 'skills') void loadSkills().catch(() => {}) },
    setQuery: query => { searchAbort?.abort(); state.query(query); state.searchBusy(false) },
    search: async () => {
      searchAbort?.abort()
      const abort = new AbortController(); searchAbort = abort
      const query = instance.getSnapshot().query.trim()
      if (!query) { state.searchHits({}); return }
      state.searchBusy(true)
      try {
        const result = await sessions.search(query, abort.signal)
        if (abort.signal.aborted || !alive) return
        if (!result.ok) throw new Error(result.error.message)
        state.searchHits(Object.fromEntries(result.value.items.map(item => [item.sessionId, item.snippet])))
      } catch (error) { if (!abort.signal.aborted && alive) state.fail(error instanceof Error ? error.message : t('error')) }
      finally { if (!abort.signal.aborted && alive) state.searchBusy(false) }
    },
    trashSession: (id, restore) => run(async () => { const result = await ctx.get('remote.workspace')!.aipmTrashSession({ sessionId: id, restore }); if (!result.ok) throw new Error(result.error.message); state.trash(result.value); await refresh(); syncSessions(); ctx.layout.selectPanel(PANEL); ctx.layout.closeRightbar() }),
    openSession: id => { navigation.openSession(id) },
    archiveSession: (id, archived) => run(async () => { if (archived) await navigation.unarchiveSession(id); else await navigation.archiveSession(id); syncSessions() }),
    openSkill: skill => { if (skillSession && skill.path) { pendingSkill = { sessionId: skillSession, path: skill.path }; navigation.openSession(skillSession) } },
    revealPendingSkill: id => { if (pendingSkill && pendingSkill.sessionId === id) { const pending = pendingSkill; pendingSkill = undefined; ctx.get('sidebarRight')!.openResourceIn(pending.sessionId, fileAddressFor(pending.sessionId, sessions.list.getSnapshot().byId[pending.sessionId]?.cwd, pending.path)) } },
    newProject: () => { state.newProject(); ctx.layout.selectPanel(PANEL); ctx.layout.closeRightbar() },
    cancel: () => { state.cancel() }, selectProject,
    createProject: idea => run(async () => {
      const result = await ctx.get('remote.workspace')!.aipmCreate({ idea })
      if (!result.ok) throw new Error(result.error.message)
      state.upsert(result.value)
      selectProject(result.value.workspaceId)
      if (result.value.automation) await open(result.value, 'idea', true)
    }),
    saveProject: project => run(async () => {
      await save(project)
      if (!project.automation && project.sessions[project.stage]) await sessions.using(project.sessions[project.stage]!, { source: 'workspaceOperation' }, async reference => { const result = await reference.binding.session.cancel(); if (!result.ok) throw new Error(t('error')) })
      state.saved()
    }),
    openStage: (requested, stage) => run(() => open(requested, stage)),
    advance: project => run(() => open(project, project.stage, true)),
    confirm: (project, decision, format) => run(async () => {
      if (!project.pending) throw new Error(t('waitingConfirmation'))
      const checkpoint = project.pending
      const result = await ctx.get('remote.workspace')!.aipmConfirm({ workspaceId: project.workspaceId, checkpointId: checkpoint.id, revision: project.revision, decision, ...(format === undefined ? {} : { format }) })
      if (!result.ok) throw new Error(result.error.message)
      state.upsert(result.value)
      const prompt = `用户已在工作台${decision === 'approve' ? '确认' : '拒绝'}本次${checkpoint.kind}请求：${checkpoint.summary}。${format ? `选定交付格式：${format}。` : ''}读取 .aipm/project.json 的 approval；${decision === 'approve' ? '按已确认范围自动继续当前阶段。' : '先修订或澄清，不执行被拒绝的事项。'} 继续遵循 AGENTS.md，新的关键节点重新提交 aipm_progress checkpoint。`
      await open(result.value, result.value.stage, true, prompt)
    }),
    refresh: () => run(refresh),
    showContext: () => { ctx.get('sidebarRight')!.openTab('aipm-context') },
    showFiles: () => { ctx.get('sidebarRight')!.openTab('files') },
  })
  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register({ name: 'main', key: PANEL, locale: 'aipm', inject: face }, AipmWorkbench)
    ctx.layout.selectPanel(PANEL)
    return dispose
  })
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark' }, AipmBrandMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', locale: 'aipm', inject: face }, AipmBrand))
  ctx.slots.inject('conversation.aipm', () => ctx.slots.register({ name: 'conversation.aipm', id: 'aipm', locale: 'aipm', inject: face }, AipmRibbon))
  ctx.inject(['sidebarRightTabs', 'sidebarRight'], ctx => {
    ctx.effect(() => ctx.sidebarRightTabs.register({ id: TAB, kind: 'aipm-context', priority: 'builtin', title: () => t('context'), guide: [{ id: 'aipm', order: 1, title: () => t('context'), description: () => t('manual'), icon: IconFolderCloseRegular }] }), 'aipm: right tab')
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB, locale: 'aipm', inject: face }, AipmContext))
  })
  void run(refresh).catch(() => {})
  ctx.effect(() => {
    let polling = false
    const timer = setInterval(() => {
      if (!alive || polling || instance.getSnapshot().busy) return
      polling = true
      void refresh().catch(error => { if (alive) state.fail(error instanceof Error ? error.message : t('error')) }).finally(() => { polling = false })
    }, 2500)
    return () => { clearInterval(timer) }
  }, 'aipm: Agent progress polling')
  ctx.effect(() => sessions.list.subscribe(() => {
    const summaries = sessions.list.getSnapshot().byId
    const project = instance.getSnapshot().projects.find(p => !p.automation && !p.titleEdited && p.sessions.idea !== undefined && summaries[p.sessions.idea]?.displayTitle && summaries[p.sessions.idea]?.displayTitle !== p.title)
    if (!project?.sessions.idea || instance.getSnapshot().busy) return
    const title = sessions.list.getSnapshot().byId[project.sessions.idea]?.displayTitle
    if (!title || title === project.title) return
    void run(async () => { await save({ ...project, title }) }).catch(() => {})
  }), 'aipm: automatic project name')
  return face
}

export { AipmSidebar }
