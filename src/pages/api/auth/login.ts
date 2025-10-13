import type { APIRoute } from 'astro';
import {
    AUTH_PASSWORD,
    SESSION_COOKIE,
    SESSION_TIMEOUT_MS,
    SESSION_TIMEOUT_SECONDS,
    createSessionToken,
} from '../../../lib/auth';

const sanitizeRedirect = (value: FormDataEntryValue | null): string => {
    if (typeof value !== 'string') {
        return '/';
    }

    // Prevent open redirects
    if (!value.startsWith('/')) {
        return '/';
    }

    return value || '/';
};

export const POST: APIRoute = async ({ request }) => {
    const formData = await request.formData();
    const password = formData.get('password');
    const redirectTo = sanitizeRedirect(formData.get('redirectTo'));

    if (typeof password !== 'string' || password !== AUTH_PASSWORD) {
        const location = new URL('/login', request.url);
        location.searchParams.set('error', '1');
        location.searchParams.set('redirectTo', redirectTo);

        return new Response(null, {
            status: 303,
            headers: {
                Location: location.toString(),
                'Cache-Control': 'no-store',
            },
        });
    }

    const expiresAt = Date.now() + SESSION_TIMEOUT_MS;
    const sessionToken = createSessionToken(expiresAt);

    return new Response(null, {
        status: 303,
        headers: {
            Location: redirectTo,
            'Set-Cookie': `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TIMEOUT_SECONDS}`,
            'Cache-Control': 'no-store',
        },
    });
};
