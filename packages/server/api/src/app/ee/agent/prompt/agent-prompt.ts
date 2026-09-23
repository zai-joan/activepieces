import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isNil } from '@activepieces/core-utils'
import { Agent, AgentConfig, AgentToolType, Project, ProjectType } from '@activepieces/shared'
import { demoMode } from '../demo-mode'

function loadPromptTemplate(filename: string): string {
    return readFileSync(path.resolve(`packages/server/api/src/assets/prompts/${filename}`), 'utf8')
}

const GUIDE_TOPICS = ['build_flow', 'one_time_task', 'error_handling', 'http_fallback', 'control_flow', 'state', 'tables', 'ai', 'about_activepieces'] as const

const PROMPT_TEMPLATES = {
    system: loadPromptTemplate('chat-system-prompt.md'),
    builder: loadPromptTemplate('agent-builder-prompt.md'),
    projectSelected: loadPromptTemplate('chat-project-context-selected.md'),
    noProject: loadPromptTemplate('chat-project-context-none.md'),
}

const GUIDES: Record<string, string> = Object.fromEntries(
    GUIDE_TOPICS.map((topic) => [topic, loadPromptTemplate(`guides/${topic}.md`)]),
)

function sanitizeProjectName(name: string): string {
    return name.replace(/[^a-zA-Z0-9 \-_.]/g, '').slice(0, 64)
}

function projectDisplayName(project: Project): string {
    return project.type === ProjectType.PERSONAL ? 'Personal Project' : project.displayName
}

function buildProjectListBlock({ projects, frontendUrl }: {
    projects: Project[]
    frontendUrl: string
}): string {
    if (projects.length === 0) return 'No projects available.'
    return projects.map((p) => {
        const url = `${frontendUrl}/projects/${p.id}`
        return `- **${sanitizeProjectName(projectDisplayName(p))}** (ID: ${p.id}) — [Open](${url})`
    }).join('\n')
}

function buildProjectContextBlockFromTemplates({ project, frontendUrl, selectedTemplate, noProjectTemplate }: {
    project: Project | null
    frontendUrl: string
    selectedTemplate: string
    noProjectTemplate: string
}): string {
    if (!project) {
        return noProjectTemplate
    }
    return selectedTemplate
        .replaceAll('{{PROJECT_NAME}}', sanitizeProjectName(projectDisplayName(project)))
        .replaceAll('{{PROJECT_ID}}', project.id)
        .replaceAll('{{FRONTEND_URL}}', frontendUrl)
}

function buildAgentSystemPrompt({ projects, currentProjectId, frontendUrl, templates }: {
    projects: Project[]
    currentProjectId: string | null
    frontendUrl: string
    templates?: Partial<PromptTemplateSources>
}): string {
    const currentProject = currentProjectId
        ? projects.find((p) => p.id === currentProjectId) ?? null
        : null

    const systemTemplate = templates?.system ?? PROMPT_TEMPLATES.system
    const selectedTemplate = templates?.projectSelected ?? PROMPT_TEMPLATES.projectSelected
    const noProjectTemplate = templates?.noProject ?? PROMPT_TEMPLATES.noProject

    return systemTemplate
        .replace('{{PROJECT_LIST}}', buildProjectListBlock({ projects, frontendUrl }))
        .replace('{{PROJECT_CONTEXT}}', buildProjectContextBlockFromTemplates({ project: currentProject, frontendUrl, selectedTemplate, noProjectTemplate }))
        .replaceAll('{{FRONTEND_URL}}', frontendUrl)
}

function buildBuilderSystemPrompt({ agent, projectId }: { agent: Agent | null, projectId?: string | null }): string {
    const state = isNil(agent)
        ? 'No agent yet. Create one as soon as you know what job it should do, then keep changing that one.'
        : [
            `Agent: ${agent.displayName} (id ${agent.id})`,
            `Description: ${agent.description ?? 'none yet'}`,
            `Instructions: ${agent.draft.instructions.length > 0 ? agent.draft.instructions : 'none yet'}`,
            `Tools: ${describeTools(agent.draft.tools)}`,
            'Your changes land as pending edits the person reviews. They go live when the person hits Save and go live, which is the only way anything is published, so say the change is ready for them to review rather than telling them to publish it.',
        ].join('\n')
    const base = PROMPT_TEMPLATES.builder.replace('{{AGENT_STATE}}', state)
    return appendDemoInstructions(base, projectId ?? null)
}

/**
 * Fork-only: standing instructions for a demo instance, per prospect.
 *
 * These live in the system prompt rather than in the opening message. A prospect
 * should read one human sentence about their own problem, not a page of stage
 * directions — and the directions say things like "the first version does not
 * have to run", which is true, useful to the agent, and not what you want
 * someone reading out of the network tab mid-evaluation. A message merely hidden
 * on screen still travels to their browser; this never leaves the server.
 *
 * Activepieces' own user-memory feature would be the natural home, but
 * `carriesChatContext` in agent-config-rpc is false for builder runs, so it is
 * never loaded for these conversations.
 */
function appendDemoInstructions(prompt: string, projectId: string | null): string {
    const extra = demoMode.instructionsFor(projectId)
    if (isNil(extra)) {
        return prompt
    }
    return `${withoutConnectionCaution(prompt)}\n\n${extra}`
}

/**
 * The builder brief warns that adding a tool for an unconnected app will pester
 * the person for a connection, and says to prefer what is already connected.
 * Sound advice normally. In a demo nothing is connected at all, so the agent
 * reads it as "add nothing", and describes an automation instead of building
 * one — which is the single thing a demo must not do.
 *
 * Removed rather than argued with: a later instruction contradicting an earlier
 * one leaves the model picking between them, and it picks the cautious one.
 */
const CONNECTION_CAUTION = ' A tool for an app the project has no connection to will ask this person for one, so prefer what is already connected unless they say otherwise.'

function withoutConnectionCaution(prompt: string): string {
    if (!prompt.includes(CONNECTION_CAUTION)) {
        // Upstream reworded it. Say so: the failure is otherwise invisible —
        // demos keep loading and quietly go back to describing rather than
        // building, which is not something you notice until a prospect does.
        console.warn('[demoMode] the builder brief no longer contains the connection caution; re-check that demos still build rather than describe')
        return prompt
    }
    return prompt.replace(CONNECTION_CAUTION, '')
}

function describeTools(tools: AgentConfig['tools']): string {
    if (tools.length === 0) {
        return 'none'
    }
    return tools.map((tool) => tool.type === AgentToolType.PIECE
        ? `${tool.pieceMetadata.actionName} (${tool.pieceMetadata.pieceName})`
        : tool.toolName).join(', ')
}

export const agentPrompt = {
    buildSystemPrompt: buildAgentSystemPrompt,
    buildBuilderSystemPrompt,
    guides: GUIDES,
    projectDisplayName,
    sources: {
        ...PROMPT_TEMPLATES,
        guides: GUIDES,
    },
}

export type PromptTemplateSources = {
    system: string
    projectSelected: string
    noProject: string
}
