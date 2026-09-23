/**
 * Fork-only: which projects are prospect demos, and what the agent is told in them.
 *
 * AP_DEMO_INSTRUCTIONS is a JSON object keyed by project id, with an optional
 * "default" entry for anything not listed:
 *
 *   {"<projectId>": "...", "default": "..."}
 *
 * Keyed by project because each prospect gets their own, so the guidance can be
 * written for the company in front of the agent rather than being one paragraph
 * stretched to fit everybody. A project appearing here is also what marks it as
 * a demo, which is the signal the connection handling reads — one piece of
 * configuration rather than two that can disagree.
 *
 * Unset on a normal instance, where every function here is a no-op.
 */

import { isNil } from '@activepieces/core-utils'

function byProject(): Record<string, string> | null {
    const raw = process.env.AP_DEMO_INSTRUCTIONS
    if (isNil(raw) || raw.trim().length === 0) {
        return null
    }
    try {
        return JSON.parse(raw) as Record<string, string>
    }
    catch {
        return null
    }
}

function instructionsFor(projectId: string | null): string | null {
    const map = byProject()
    if (isNil(map)) {
        return null
    }
    const found = (!isNil(projectId) ? map[projectId] : undefined) ?? map.default
    return isNil(found) || found.trim().length === 0 ? null : found.trim()
}

/**
 * A demo project has nothing connected and never will — the whole point is that
 * a prospect clicks one link and watches something get built, without being
 * asked to sign in to their own Gmail first.
 */
function isDemoProject(projectId: string | null): boolean {
    const map = byProject()
    return !isNil(map) && !isNil(projectId) && !isNil(map[projectId])
}

export const demoMode = {
    instructionsFor,
    isDemoProject,
}
