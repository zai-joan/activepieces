/**
 * Demo links — a fork-only addition, not upstream Activepieces.
 *
 * One public URL that a prospect can click from an email and land inside a
 * prepared conversation, signed in, with no sign-up and no password:
 *
 *   /api/v1/demo-link/enter?k=<token>
 *      -> verify the token, mint a session for the demo user
 *      -> 302 /authenticate?response=<session>&redirect=/chat/<conversationId>
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
 *   AP_DEMO_LINKS         {"<slug>":{"email":"...","conversationId":"..."}}
 *   AP_DEMO_TRACKING_URL  optional; POSTed one JSON body per open
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { isNil } from '@activepieces/core-utils'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { authenticationUtils } from '../authentication/authentication-utils'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { userService } from '../user/user-service'

const TOKEN_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000

type DemoConfig = {
    email: string
    conversationId: string
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
            projectId: null,
        })

        reportOpen({
            event: 'opened',
            slug: payload.slug,
            recipient: payload.recipient,
            name: payload.name,
            conversationId: demo.conversationId,
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
            referrer: request.headers.referer ?? null,
            at: new Date().toISOString(),
        })

        const redirect = `/chat/${encodeURIComponent(demo.conversationId)}`
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
