import type { APIRoute } from 'astro';
import { SESSION_COOKIE } from '../lib/auth';

export const GET: APIRoute = () =>
    new Response(null, {
        status: 303,
        headers: {
            Location: '/login',
            'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`,
            'Cache-Control': 'no-store',
        },
    });
