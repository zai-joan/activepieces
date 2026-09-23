/**
 * Demo links — a fork-only addition, not upstream Activepieces.
 *
 * One public URL that a prospect can click from an email and land inside a
 * conversation that is starting as they arrive, signed in, no sign-up:
 *
 *   /api/v1/demo-link/enter?k=<token>
 *      -> verify the token, mint a session for the demo user
 *      -> open a fresh builder conversation and post the opening message
 *      -> 303 /authenticate?response=<session>&redirect=/chat/<conversationId>
 *
 * The conversation is created per visit rather than prepared in advance, so the
 * prospect watches the agent think. Landing on a finished transcript is a much
 * weaker opening, and it also goes stale the moment the flow builder changes.
 *
 * The token is an HMAC over {slug, recipient, name, issuedAt}. It is not a
 * secret that protects anything — a demo is public by design — it exists so an
 * open can be attributed to the person we sent the link to rather than an IP,
 * and so links can be expired.
 *
 * Deliberately self-contained: config comes from environment variables read
 * here rather than from AppSystemProp, and there is no new table. The whole
 * feature is this file plus a `redirect` parameter on the authenticate page,
 * which keeps rebasing onto a new upstream release close to mechanical.
 *
 *   AP_DEMO_LINK_SECRET   HMAC key, shared with whatever mints links
 *   AP_DEMO_LINKS         {"<slug>":{"email":..,"projectId":..,"prompt":..}}
 *   AP_DEMO_TRACKING_URL  optional; POSTed one JSON body per open
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { isNil } from '@activepieces/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { authenticationUtils } from '../authentication/authentication-utils'
import { databaseConnection } from '../database/database-connection'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { userService } from '../user/user-service'

const TOKEN_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000

type DemoConfig = {
    email: string
    projectId: string
    prompt: string
}

type TokenPayload = {
    slug: string
    recipient: string | null
    name: string | null
}

function demoConfigs(): Record<string, DemoConfig> {
    const raw = process.env.AP_DEMO_LINKS
    if (isNil(raw) || raw.length === 0) {
        return {}
    }
    try {
        return JSON.parse(raw) as Record<string, DemoConfig>
    }
    catch {
        return {}
    }
}

function verifyToken(token: string): TokenPayload | null {
    const secret = process.env.AP_DEMO_LINK_SECRET
    if (isNil(secret) || secret.length === 0) {
        return null
    }
    const dot = token.lastIndexOf('.')
    if (dot === -1) {
        return null
    }
    const encoded = token.slice(0, dot)
    const given = Buffer.from(token.slice(dot + 1))
    const expected = Buffer.from(createHmac('sha256', secret).update(encoded).digest('base64url'))
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return null
    }
    try {
        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
        if (typeof payload.t !== 'number' || Date.now() - payload.t > TOKEN_MAX_AGE_MS) {
            return null
        }
        return { slug: payload.s, recipient: payload.r ?? null, name: payload.n ?? null }
    }
    catch {
        return null
    }
}

/**
 * Tell whoever is counting that this link was opened. Fire and forget, and
 * never awaited into the response: a prospect waiting on our analytics would
 * be a worse trade than losing one row.
 */
function reportOpen(body: Record<string, unknown>): void {
    const url = process.env.AP_DEMO_TRACKING_URL
    if (isNil(url) || url.length === 0) {
        return
    }
    void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).catch(() => undefined)
}



/**
 * Wipe this demo user's previous conversations.
 *
 * Every visitor signs in as the same user, so without this the second prospect
 * opens a sidebar listing the first one's session. "As if nobody had been here"
 * is the whole point of a demo link, and it is also the only way to be sure one
 * prospect never sees another's company name in a chat title.
 */
async function clearPreviousConversations(userId: string, log: FastifyBaseLogger): Promise<void> {
    try {
        await databaseConnection().query('DELETE FROM agent_conversation WHERE "userId" = $1', [userId])
    }
    catch (error) {
        // Not fatal: a stale conversation in the sidebar is worse than nothing,
        // but it is much better than refusing to open the demo at all.
        log.error({ error }, '[demoLink] could not clear previous conversations')
    }
}

/**
 * Open a builder conversation and post the opening message, through this
 * instance's own API so the agent starts exactly as it would for a real user.
 * Returns the conversation to land on, or null if either call failed — the
 * caller turns that into a 404 rather than dropping someone into a dead page.
 */
async function startSeededConversation({ token, projectId, prompt, log }: StartSeededConversationParams): Promise<string | null> {
    const base = `http://127.0.0.1:${process.env.AP_PORT ?? 80}/api`
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    try {
        const created = await fetch(`${base}/v1/agents/conversations`, {
            method: 'POST',
            headers,
            // Not builder: true. That surface builds a saved Agent, and
            // ap_create_agent is gated on plan.agentsEnabled, which this licence
            // does not grant — the agent researches pieces and then cannot build
            // anything. The ordinary chat surface is the one holding ap_create_flow
            // and ap_build_flow, which is the automation a prospect came to see.
            body: JSON.stringify({ title: 'Demo', projectId }),
        })
        if (!created.ok) {
            log.error({ status: created.status }, '[demoLink] could not create the conversation')
            return null
        }
        const { id } = await created.json() as { id: string }

        // Not awaited for completion — this returns as soon as the run is
        // claimed, which is what we want: the page should open while the agent
        // is still thinking.
        const sent = await fetch(`${base}/v1/agents/conversations/${id}/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ content: prompt }),
        })
        if (!sent.ok) {
            log.error({ status: sent.status, conversationId: id }, '[demoLink] could not post the opening message')
            return null
        }
        return id
    }
    catch (error) {
        log.error({ error }, '[demoLink] seeding the conversation failed')
        return null
    }
}

type StartSeededConversationParams = {
    token: string
    projectId: string
    prompt: string
    log: FastifyBaseLogger
}

export const demoLinkModule: FastifyPluginAsyncZod = async (app) => {
    app.register(demoLinkController, { prefix: '/v1/demo-link' })
}

const demoLinkController: FastifyPluginAsyncZod = async (app) => {
    app.get('/enter', EnterDemoRequest, async (request, reply) => {
        const payload = verifyToken(request.query.k)
        if (isNil(payload)) {
            return reply.redirect('/404')
        }

        const demo = demoConfigs()[payload.slug]
        if (isNil(demo)) {
            return reply.redirect('/404')
        }

        const identity = await userIdentityService(request.log).getIdentityByEmail(demo.email)
        if (isNil(identity)) {
            request.log.error({ slug: payload.slug }, '[demoLink] demo user does not exist')
            return reply.redirect('/404')
        }

        const users = await userService(request.log).getByIdentityId({ identityId: identity.id })
        const user = users.find((candidate) => !isNil(candidate.platformId))
        if (isNil(user) || isNil(user.platformId)) {
            request.log.error({ slug: payload.slug }, '[demoLink] demo user has no platform')
            return reply.redirect('/404')
        }

        const session = await authenticationUtils(request.log).getProjectAndToken({
            userId: user.id,
            platformId: user.platformId,
            projectId: demo.projectId,
        })

        await clearPreviousConversations(user.id, request.log)

        // A fresh conversation per visit, seeded and started here, so the
        // prospect watches the agent work rather than reading a transcript of
        // it working earlier. Reusing one conversation would show them a
        // finished answer, which is a much weaker thing to open on.
        const conversationId = await startSeededConversation({
            token: session.token,
            projectId: demo.projectId,
            prompt: demo.prompt,
            log: request.log,
        })

        if (isNil(conversationId)) {
            return reply.redirect('/404')
        }

        reportOpen({
            event: 'opened',
            slug: payload.slug,
            recipient: payload.recipient,
            name: payload.name,
            conversationId,
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
            referrer: request.headers.referer ?? null,
            at: new Date().toISOString(),
        })

        const redirect = `/chat/${encodeURIComponent(conversationId)}`
        const target = `/authenticate?response=${encodeURIComponent(JSON.stringify(session))}&redirect=${encodeURIComponent(redirect)}`
        return reply.redirect(target, StatusCodes.SEE_OTHER)
    })
}

const EnterDemoRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        description: 'Open a prospect demo link',
        querystring: z.object({
            k: z.string(),
        }),
    },
}
