/** Local product project files and Workspace membership. */
import type { Context } from '@deepseek-ai/cordis'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { SessionId } from '@deepseek-ai/dsh-session'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { AipmProject, AipmCreateRequest, AipmSaveRequest, AipmConfirmRequest } from './types.ts'

const stage = z.enum(['idea', 'research', 'proposal', 'requirements', 'prd'])
const text = z.string().max(100_000)
const checkpointSchema = z.object({ id: z.string(), kind: z.enum(['stage', 'understanding', 'content', 'delivery']), summary: z.string().trim().min(1).max(20_000), nextStage: stage.optional(), formats: z.array(z.string().trim().min(1).max(80)).max(6) })
const approvalSchema = z.object({ checkpoint: checkpointSchema, decision: z.enum(['approve', 'reject']), format: z.string().optional(), confirmedAt: z.string() })
const stageOrder = ['idea', 'research', 'proposal', 'requirements', 'prd'] as const
/** Agent fields validated at the model-tool boundary. */
export const progressSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(), evidence: text.optional(), questions: text.optional(), decisions: text.optional(), deliverables: text.optional(),
  checkpoint: checkpointSchema.omit({ id: true }).optional(),
})
export type AipmProgressInput = z.infer<typeof progressSchema>

const schema = z.object({
  workspaceId: z.string().transform(WorkspaceId), title: z.string().trim().min(1).max(160),
  idea: z.string().trim().min(1).max(10_000), path: z.string(), stage,
  completedStages: z.array(stage), evidence: text, questions: text,
  decisions: text, deliverables: text,
  sessions: z.object({ idea: z.string().transform(SessionId).optional(), research: z.string().transform(SessionId).optional(), proposal: z.string().transform(SessionId).optional(), requirements: z.string().transform(SessionId).optional(), prd: z.string().transform(SessionId).optional() }),
  automation: z.boolean().default(true), pending: checkpointSchema.nullable().default(null), approval: approvalSchema.nullable().default(null),
  titleEdited: z.boolean(), revision: z.number().int().nonnegative(), updatedAt: z.string(),
})

/** Serialized file operations over registered project directories. */
export class AipmProjects {
  private tail: Promise<unknown> = Promise.resolve()
  /** @param ctx - Host Workspace registry owner. */
  constructor(private readonly ctx: Context) {}

  /** @returns registered product project records, newest first. */
  async list(): Promise<AipmProject[]> {
    await this.tail
    const projects: AipmProject[] = []
    for (const workspace of this.ctx.workspaceRegistry.list()) {
      const file = join(workspace.path, '.aipm', 'project.json')
      let raw: string
      try { raw = await readFile(file, 'utf8') }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
        throw error
      }
      const project = schema.parse(JSON.parse(raw))
      if (project.workspaceId !== workspace.id || project.path !== workspace.path) throw new Error('Project directory does not match its registered Workspace')
      projects.push(project)
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /** Read durable, recoverable deleted Session identities. */
  async trashList(): Promise<SessionId[]> { await this.tail; return this.readTrash() }

  /** Move an inactive Session to or from the local recycle bin; never delete files. */
  trashSession(sessionId: SessionId, restore: boolean): Promise<SessionId[]> {
    return this.enqueue(async () => {
      const ids = new Set(await this.readTrash())
      if (restore) await this.ctx.workspaceRegistry.unarchiveSession(sessionId)
      else await this.ctx.workspaceRegistry.archiveSession(sessionId)
      if (restore) ids.delete(sessionId); else ids.add(sessionId)
      const file = this.trashPath()
      await mkdir(join(file, '..'), { recursive: true, mode: 0o700 })
      const temporary = `${file}.${randomUUID()}.tmp`
      await writeFile(temporary, JSON.stringify({ sessionIds: [...ids] }), { mode: 0o600 })
      await rename(temporary, file)
      if (!restore) for (const workspace of this.ctx.workspaceRegistry.list()) {
        let project: AipmProject
        try { project = await this.read(workspace.id) }
        catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error }
        if (Object.values(project.sessions).includes(sessionId) && project.automation) {
          await this.write({ ...project, automation: false, revision: project.revision + 1, updatedAt: new Date().toISOString() })
        }
      }
      return [...ids]
    })
  }

  private trashPath(): string { return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'aipm-session-trash.json') }
  private async readTrash(): Promise<SessionId[]> {
    try { return z.object({ sessionIds: z.array(z.string().transform(SessionId)) }).parse(JSON.parse(await readFile(this.trashPath(), 'utf8'))).sessionIds }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []; throw error }
  }

  /** @param request - one product idea. @returns the newly persisted project. */
  create(request: AipmCreateRequest): Promise<AipmProject> {
    return this.enqueue(async () => {
      const idea = z.string().trim().min(1).max(10_000).parse(request.idea)
      const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
      const path = join(home, 'aipm-projects', randomUUID())
      await mkdir(join(path, '.aipm'), { recursive: true, mode: 0o700 })
      for (const directory of ['materials', 'deliverables']) await mkdir(join(path, directory))
      const workspace = await this.ctx.workspaceRegistry.create(path)
      const title = Array.from(idea.replace(/\s+/gu, ' ')).slice(0, 24).join('')
      await workspace.setTitle(title)
      const project: AipmProject = {
        workspaceId: workspace.id, title, idea, path, stage: 'idea', completedStages: [],
        evidence: '', questions: '', decisions: '', deliverables: '', sessions: {},
        automation: true, pending: null, approval: null, titleEdited: false, revision: 0, updatedAt: new Date().toISOString(),
      }
      await this.prepareFiles(project)
      await this.write(project)
      return project
    })
  }

  /** @param request - edited record with its last read revision. @returns the saved record. */
  save(request: AipmSaveRequest): Promise<AipmProject> {
    return this.enqueue(async () => {
      const proposed = schema.parse(request.project)
      const workspace = this.ctx.workspaceRegistry.get(proposed.workspaceId)
      if (workspace === undefined) throw new RemoteError('gateway/bad-request', 'Project no longer exists', {})
      const current = schema.parse(JSON.parse(await readFile(join(workspace.path, '.aipm', 'project.json'), 'utf8')))
      if (current.revision !== proposed.revision) throw new RemoteError('gateway/bad-request', 'Project changed in another window; refresh before saving', {})
      for (const sessionId of Object.values(proposed.sessions)) {
        if (sessionId !== undefined && !workspace.sessionIds.includes(sessionId)) throw new RemoteError('gateway/bad-request', 'Stage conversation belongs to another project', {})
      }
      const saved = { ...proposed, pending: current.pending, approval: current.approval, workspaceId: workspace.id, path: workspace.path, idea: current.idea, revision: current.revision + 1, updatedAt: new Date().toISOString() }
      await this.write(saved)
      if (workspace.title !== saved.title) await workspace.setTitle(saved.title)
      return saved
    })
  }

  /** Prepare project-local skills before an existing project starts automation.
   * @param workspaceId - registered product Workspace. @returns its current record.
   */
  prepare(workspaceId: AipmProject['workspaceId']): Promise<AipmProject> {
    return this.enqueue(async () => { const project = await this.read(workspaceId); await this.prepareFiles(project); return project })
  }

  /** Persist Agent observations without granting a checkpoint.
   * @param sessionId - calling Agent's durable Session. @param input - validated model input. @returns updated record.
   */
  progress(sessionId: AipmProject['sessions']['idea'], input: AipmProgressInput): Promise<AipmProject> {
    return this.enqueue(async () => {
      const workspace = this.ctx.workspaceRegistry.list().find(w => sessionId !== undefined && w.sessionIds.includes(sessionId))
      if (!workspace) throw new Error('AIPM progress requires a registered project Session')
      const current = await this.read(workspace.id)
      if (!Object.values(current.sessions).includes(sessionId)) throw new Error('This Session is not a product workflow stage')
      if (!current.automation) throw new Error('Automatic workflow is paused; wait for the user to resume')
      if (current.pending) throw new Error('A checkpoint is waiting for the user. End this response and wait; do not overwrite it.')
      const change = progressSchema.parse(input)
      if (change.checkpoint?.kind === 'stage' && (!change.checkpoint.nextStage || change.checkpoint.nextStage !== stageOrder[stageOrder.indexOf(current.stage) + 1])) throw new Error('Recommend only the immediately following stage')
      if (change.checkpoint?.kind !== 'stage' && change.checkpoint?.nextStage !== undefined) throw new Error('Only stage checkpoints may change stages')
      if (change.checkpoint?.kind === 'delivery' && change.checkpoint.formats.length === 0) throw new Error('Delivery confirmation requires format options')
      if (change.checkpoint?.kind === 'content' && current.stage === 'proposal' && !(current.approval?.decision === 'approve' && current.approval.checkpoint.kind === 'understanding')) throw new Error('Confirm the proposal understanding before reviewing its draft')
      if (change.checkpoint?.kind === 'delivery' && !(current.approval?.decision === 'approve' && current.approval.checkpoint.kind === 'content')) throw new Error('Confirm draft content before choosing its delivery format')
      const { checkpoint, title } = change
      const saved: AipmProject = { ...current, evidence: change.evidence ?? current.evidence, questions: change.questions ?? current.questions, decisions: change.decisions ?? current.decisions, deliverables: change.deliverables ?? current.deliverables, title: !current.titleEdited && title ? title : current.title, pending: checkpoint ? { ...checkpoint, id: randomUUID() } : null, revision: current.revision + 1, updatedAt: new Date().toISOString() }
      await this.write(saved)
      if (workspace.title !== saved.title) await workspace.setTitle(saved.title)
      return saved
    })
  }

  /** Apply only a matching explicit user decision.
   * @param request - authenticated UI approval or rejection. @returns updated project.
   */
  confirm(request: AipmConfirmRequest): Promise<AipmProject> {
    return this.enqueue(async () => {
      const current = await this.read(request.workspaceId)
      const pending = current.pending
      if (!pending || pending.id !== request.checkpointId || current.revision !== request.revision) throw new Error('This checkpoint changed; refresh before confirming')
      if (request.decision === 'approve' && pending.kind === 'delivery' && (!request.format || !pending.formats.includes(request.format))) throw new Error('Choose one of the proposed delivery formats')
      const nextStage = request.decision === 'approve' && pending.kind === 'stage' ? pending.nextStage : undefined
      const saved: AipmProject = { ...current, stage: nextStage ?? current.stage, completedStages: nextStage ? [...new Set([...current.completedStages, current.stage])] : current.completedStages, pending: null, approval: { checkpoint: pending, decision: request.decision, ...(request.format === undefined ? {} : { format: request.format }), confirmedAt: new Date().toISOString() }, revision: current.revision + 1, updatedAt: new Date().toISOString() }
      await this.write(saved)
      return saved
    })
  }

  private async read(workspaceId: AipmProject['workspaceId']): Promise<AipmProject> {
    const workspace = this.ctx.workspaceRegistry.get(workspaceId)
    if (!workspace) throw new Error('Project no longer exists')
    const project = schema.parse(JSON.parse(await readFile(join(workspace.path, '.aipm', 'project.json'), 'utf8')))
    if (project.workspaceId !== workspace.id || project.path !== workspace.path) throw new Error('Project directory does not match its registered Workspace')
    return project
  }

  private async prepareFiles(project: AipmProject): Promise<void> {
    const guide = join(project.path, 'AGENTS.md')
    let existing = ''
    try { existing = await readFile(guide, 'utf8') }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
    existing = existing.replace(/^proposal 阶段必须先调用 skill.*$/m, PROPOSAL_GUIDANCE)
    if (existing.includes('<!-- AIPM-WORKFLOW -->')) await writeFile(guide, existing, { mode: 0o600 })
    if (!existing.includes('<!-- AIPM-WORKFLOW -->')) await writeFile(guide, existing + '\n' + WORKFLOW_GUIDANCE, { mode: 0o600 })
  }

  private async write(project: AipmProject): Promise<void> {
    const file = join(project.path, '.aipm', 'project.json')
    const temporary = `${file}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(project, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    await rename(temporary, file)
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}

const PROPOSAL_GUIDANCE = 'proposal 阶段默认使用工作台通用立项流程，不自动加载专用 Skill；仅当用户明确选用「立项报告」模式时，遵循该模式的 lxbg_skill，梳理证据与立项判断并按其确认流程交付报告。'

const WORKFLOW_GUIDANCE = `<!-- AIPM-WORKFLOW -->
# AIPM 工作流程
读取 .aipm/project.json；它是工作台管理的状态，不要用文件工具直接改写。
目标是从一句话想法推进至 PRD。自动推进当前阶段的研究、梳理与修订；缺用户信息时用 ask_user_question 每轮问 1–3 个问题。没有回答不能视为确认。
重要结论分清事实、用户陈述、推断、假设与待验证项；证据标来源、日期和适用范围。不要伪造访谈、数据或研发承诺。
用 aipm_progress 同步 title、evidence、questions、decisions、deliverables。证据记录包含来源；decisions 只写已得到用户确认的结论。
阶段顺序为 idea → research → proposal → requirements → prd。每次仅推荐下一阶段，提交 kind=stage 的 checkpoint，summary 说明证据、缺口和下一步；提交后结束回复，等待工作台确认卡。不要自行进入下一阶段。
${PROPOSAL_GUIDANCE}
写立项报告草案前，提交 kind=understanding checkpoint，复述决策目的、用户、场景、问题、价值、边界和未知项，等用户确认。
草案写入 deliverables/ 的草案文件，提交 kind=content checkpoint，附实际草案路径、摘要、结论和争议点。内容未确认不生成正式版。
内容确认后，提交 kind=delivery checkpoint，formats 提供交付格式选项并在 summary 推荐一种。立项报告推荐 HTML，PRD 推荐 Markdown；按用户选定格式生成，不能替用户选。
确认信息在 approval 字段；拒绝时继续澄清或修订，不把拒绝当许可。正式交付后将存在的文件相对路径登记到 deliverables，检查内容和证据。立项结论可以为做、不做、有条件做或先验证；不要在不做或先验证时强行进入详细需求与 PRD。
所有产出物都在当前项目目录，资料在 materials/，交付在 deliverables/。不得写回源 Skill。
`;
