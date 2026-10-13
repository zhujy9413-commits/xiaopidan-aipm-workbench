/** Model-facing observations and explicit workflow checkpoint requests. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { AipmProjects } from './aipm.ts'

/** Register only in the personal workbench composition.
 * @param ctx - Host context. @param projects - serialized project persistence.
 */
export function registerAipmTool(ctx: Context, projects: AipmProjects): void {
  ctx.inject(['tools'], child => {
    child.tools.register(defineTool({
      name: 'aipm_progress',
      description: 'Update your current AIPM project evidence and observations. Request human confirmation before stage transitions, drafting a proposal, accepting draft content, or choosing delivery format. A checkpoint is NOT approval: after requesting one, end your response and wait for the workbench to send the human decision. Never edit .aipm/project.json directly.',
      parameters: {
        title: { type: 'string', description: 'Short proposed project name; ignored after the user renames it.' },
        evidence: { type: 'string', description: 'Full current evidence record with sources, dates, fact/assumption labels and gaps.' },
        questions: { type: 'string', description: 'Full current list of unresolved questions.' },
        decisions: { type: 'string', description: 'Full current record of conclusions explicitly confirmed by the user.' },
        deliverables: { type: 'string', description: 'Existing draft and final artifact relative paths, labeled with approval status.' },
        checkpoint: { type: 'object', additionalProperties: false, properties: {
          kind: { type: 'string', required: true, enum: ['stage', 'understanding', 'content', 'delivery'] },
          summary: { type: 'string', required: true, description: 'Concrete reviewable summary, sources/gaps, recommendation and draft path when applicable.' },
          nextStage: { type: 'string', enum: ['idea', 'research', 'proposal', 'requirements', 'prd'] },
          formats: { type: 'array', required: true, items: { type: 'string' }, description: 'Delivery format choices; otherwise an empty list.' },
        } },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { revision: { type: 'number', required: true }, waiting: { type: 'boolean', required: true }, message: { type: 'string', required: true } } },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      presentCall(args) { return { card: 'generic', title: args.checkpoint ? 'Review project checkpoint' : 'Update project progress', kind: 'other', rawInput: args.checkpoint?.summary ?? args.evidence ?? args.questions ?? '' } },
      async execute(args, exec) {
        const project = await projects.progress(exec.agent?.session.id, args)
        return { revision: project.revision, waiting: project.pending !== null, message: project.pending ? 'The user must confirm in the AIPM workbench. End this response now. Do not perform the proposed action until a new user decision arrives.' : 'Project observations saved locally.' }
      },
    }))
  })
}
