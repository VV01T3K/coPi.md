import { createHmac, timingSafeEqual } from 'crypto';

export const AUTH_PASSWORD = process.env.PASSWORD ?? "bikomiś2137";
export const SESSION_COOKIE = 'copicat_session';
export const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
export const SESSION_TIMEOUT_SECONDS = SESSION_TIMEOUT_MS / 1000;

const SESSION_SECRET = process.env.SESSION_SECRET ?? `${AUTH_PASSWORD}-session`; // simple shared secret

const sign = (payload: string): string =>
    createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

export const createSessionToken = (expiresAt: number): string => {
    const payload = `${expiresAt}`;
    const signature = sign(payload);
    return `${payload}.${signature}`;
};

export const parseSessionToken = (token: string): number | null => {
    const [payload, signature] = token.split('.', 2);
    if (!payload || !signature) {
        return null;
    }

    try {
        const expectedSignature = sign(payload);
        const signatureBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');

        if (signatureBuffer.length !== expectedBuffer.length) {
            return null;
        }

        if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
            return null;
        }
    } catch {
        return null;
    }

    const expiresAt = Number(payload);
    if (!Number.isFinite(expiresAt)) {
        return null;
    }

    return expiresAt;
};
