import type { MiddlewareHandler } from 'astro';
import {
    SESSION_COOKIE,
    SESSION_TIMEOUT_MS,
    SESSION_TIMEOUT_SECONDS,
    createSessionToken,
    parseSessionToken,
} from './lib/auth';

const ASSET_EXTENSIONS = [
    '.css',
    '.js',
    '.mjs',
    '.map',
    '.ico',
    '.png',
    '.jpg',
    '.jpeg',
    '.svg',
    '.webp',
    '.gif',
    '.woff2',
    '.woff',
    '.ttf',
];

const parseCookies = (cookieHeader: string | null): Record<string, string> => {
    if (!cookieHeader) {
        return {};
    }

    return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
        const [rawName, ...rest] = part.trim().split('=');
        if (!rawName) {
            return acc;
        }
        acc[rawName] = rest.join('=');
        return acc;
    }, {});
};

const isAssetRequest = (pathname: string): boolean =>
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/_image') ||
    pathname === '/favicon.ico' ||
    ASSET_EXTENSIONS.some((ext) => pathname.endsWith(ext));

const isPublicPath = (pathname: string, method: string): boolean => {
    if (isAssetRequest(pathname)) {
        return true;
    }

    if (pathname === '/login' || pathname === '/api/auth/login') {
        return true;
    }

    // Allow health checks or similar requests that don't require auth
    if (pathname === '/status' && method === 'GET') {
        return true;
    }

    return false;
};

const unauthorizedResponse = (request: Request): Response => {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
        return new Response('Unauthorized', {
            status: 401,
            headers: {
                'Cache-Control': 'no-store',
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });
    }

    const redirectTarget = new URL('/login', url.origin);
    if (url.pathname !== '/login') {
        redirectTarget.searchParams.set('redirectTo', `${url.pathname}${url.search}`);
    }

    return new Response(null, {
        status: 302,
        headers: {
            Location: redirectTarget.toString().replace(url.origin, ''),
            'Cache-Control': 'no-store',
        },
    });
};

export const onRequest: MiddlewareHandler = async ({ request }, next) => {
    const url = new URL(request.url);

    if (isPublicPath(url.pathname, request.method)) {
        return next();
    }

    const cookies = parseCookies(request.headers.get('cookie'));
    const sessionValue = cookies[SESSION_COOKIE];
    const now = Date.now();

    if (!sessionValue) {
        return unauthorizedResponse(request);
    }

    const expiresAt = parseSessionToken(sessionValue);

    if (expiresAt === null || expiresAt <= now) {
        const response = unauthorizedResponse(request);
        response.headers.append(
            'Set-Cookie',
            `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`
        );
        return response;
    }

    // Renew session on activity
    const response = await next();
    if (!url.pathname.startsWith('/logout')) {
        const refreshedExpiry = now + SESSION_TIMEOUT_MS;
        response.headers.append(
            'Set-Cookie',
            `${SESSION_COOKIE}=${createSessionToken(refreshedExpiry)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TIMEOUT_SECONDS}`
        );
    }
    return response;
};
