import { DEFAULT_DOC_TTL_SECONDS, MAX_DOC_TTL_SECONDS, MIN_DOC_TTL_SECONDS } from '../lib/docExpiration';
import { getRedis } from '../lib/redis';

export interface DocRecord {
    id: string;
    slug: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    expiresAt: string | null;
}

export type DocSummary = Omit<DocRecord, 'content'>;

export class DocValidationError extends Error {
    readonly code = 'DOC_VALIDATION';

    constructor(message: string) {
        super(message);
        this.name = 'DocValidationError';
    }
}

export class DocConflictError extends Error {
    readonly code = 'DOC_CONFLICT';

    constructor(message: string) {
        super(message);
        this.name = 'DocConflictError';
    }
}

const DOC_PREFIX = 'doc:';
const DOC_INDEX_KEY = 'docs:index';

function normalizeTtlSeconds(ttl?: number): number {
    if (ttl === undefined || ttl === null) {
        return DEFAULT_DOC_TTL_SECONDS;
    }

    if (Number.isNaN(ttl) || !Number.isFinite(ttl)) {
        throw new DocValidationError('Expiration must be a valid number of seconds.');
    }

    const rounded = Math.floor(ttl);
    if (rounded < MIN_DOC_TTL_SECONDS || rounded > MAX_DOC_TTL_SECONDS) {
        throw new DocValidationError('Expiration must be between 1 day and 30 days.');
    }

    return rounded;
}

function docKey(slug: string): string {
    return `${DOC_PREFIX}${slug}`;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeSlug(input: string): string {
    const normalized = input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return normalized;
}

function randomFragment(): string {
    return Math.random().toString(36).slice(2, 8);
}

async function slugExists(slug: string): Promise<boolean> {
    const redis = getRedis();
    const exists = await redis.exists(docKey(slug));
    return exists === 1;
}

async function ensureSlugAvailable(slug: string): Promise<void> {
    if (await slugExists(slug)) {
        throw new DocConflictError('Slug is already in use.');
    }
}

async function generateSlug(title: string): Promise<string> {
    const base = normalizeSlug(title) || `note-${randomFragment()}`;
    let candidate = base;
    let counter = 1;

    while (await slugExists(candidate)) {
        candidate = `${base}-${counter}`;
        counter += 1;
    }

    return candidate;
}

export async function listDocs(): Promise<DocSummary[]> {
    const redis = getRedis();
    // node-redis v4: use zRange with REV to replicate ZREVRANGE
    const ids = await redis.zRange(DOC_INDEX_KEY, 0, -1, { REV: true });

    if (ids.length === 0) {
        return [];
    }

    const keys = ids.map((id) => docKey(id));
    const rows = await redis.mGet(keys);

    const docs: DocSummary[] = [];
    const staleSlugs: string[] = [];

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const slug = ids[index];

        if (!row) {
            staleSlugs.push(slug);
            continue;
        }

        try {
            const parsed = JSON.parse(row) as Partial<DocRecord>;
            const parsedSlug = parsed.slug ?? parsed.id ?? slug;
            if (!parsedSlug || !parsed.title || !parsed.createdAt || !parsed.updatedAt) {
                continue;
            }

            let expiresAt: string | null = parsed.expiresAt ?? null;
            if (!expiresAt) {
                const ttl = await redis.ttl(keys[index]);
                if (ttl > 0) {
                    expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
                }
            }

            // Only return metadata to keep payloads small.
            docs.push({
                id: parsedSlug,
                slug: parsedSlug,
                title: parsed.title,
                createdAt: parsed.createdAt,
                updatedAt: parsed.updatedAt,
                expiresAt: expiresAt ?? null,
            });
        } catch (error) {
            console.error('[docs] failed to parse stored document', error);
        }
    }

    if (staleSlugs.length > 0) {
        await redis.zRem(DOC_INDEX_KEY, staleSlugs);
    }

    return docs;
}

export async function getDoc(slug: string): Promise<DocRecord | null> {
    const redis = getRedis();
    const raw = await redis.get(docKey(slug));
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<DocRecord>;
        const normalizedSlug = parsed.slug ?? parsed.id;
        if (!normalizedSlug || !parsed.title || !parsed.content || !parsed.createdAt || !parsed.updatedAt) {
            return null;
        }

        let expiresAt: string | null = parsed.expiresAt ?? null;
        if (!expiresAt) {
            const ttl = await redis.ttl(docKey(slug));
            if (ttl > 0) {
                expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
            }
        }

        return {
            id: normalizedSlug,
            slug: normalizedSlug,
            title: parsed.title,
            content: parsed.content,
            createdAt: parsed.createdAt,
            updatedAt: parsed.updatedAt,
            expiresAt: expiresAt ?? null,
        };
    } catch (error) {
        console.error('[docs] failed to parse document', error);
        return null;
    }
}

export interface CreateDocInput {
    title: string;
    content: string;
    slug?: string;
    expiresInSeconds?: number;
}

export async function createDoc({ title, content, slug, expiresInSeconds }: CreateDocInput): Promise<DocRecord> {
    const redis = getRedis();
    let normalizedSlug = '';

    if (slug && slug.trim().length > 0) {
        normalizedSlug = normalizeSlug(slug);
        if (!normalizedSlug || !SLUG_PATTERN.test(normalizedSlug)) {
            throw new DocValidationError('Slug can only contain lowercase letters, numbers, and hyphens.');
        }
        await ensureSlugAvailable(normalizedSlug);
    } else {
        normalizedSlug = await generateSlug(title);
    }

    const ttlSeconds = normalizeTtlSeconds(expiresInSeconds);
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const record: DocRecord = {
        id: normalizedSlug,
        slug: normalizedSlug,
        title,
        content,
        createdAt,
        updatedAt: createdAt,
        expiresAt,
    };

    await redis
        .multi()
        .set(docKey(normalizedSlug), JSON.stringify(record), { EX: ttlSeconds })
        .zAdd(DOC_INDEX_KEY, [{ score: Date.now(), value: normalizedSlug }])
        .exec();

    return record;
}

export interface UpdateDocInput {
    title?: string;
    content?: string;
    slug?: string;
    expiresInSeconds?: number;
}

export async function updateDoc(
    currentSlug: string,
    { title, content, slug, expiresInSeconds }: UpdateDocInput,
): Promise<DocRecord | null> {
    const redis = getRedis();
    const existing = await getDoc(currentSlug);
    if (!existing) {
        return null;
    }

    let nextSlug = existing.slug;
    if (slug !== undefined && slug !== existing.slug) {
        const normalizedSlug = normalizeSlug(slug);
        if (!normalizedSlug || !SLUG_PATTERN.test(normalizedSlug)) {
            throw new DocValidationError('Slug can only contain lowercase letters, numbers, and hyphens.');
        }
        if (normalizedSlug !== existing.slug) {
            await ensureSlugAvailable(normalizedSlug);
            nextSlug = normalizedSlug;
        }
    }

    const next: DocRecord = {
        ...existing,
        id: nextSlug,
        slug: nextSlug,
        title: title !== undefined ? title : existing.title,
        content: content !== undefined ? content : existing.content,
        expiresAt: existing.expiresAt,
        updatedAt: existing.updatedAt,
    };

    let ttlSeconds: number;
    if (expiresInSeconds !== undefined) {
        ttlSeconds = normalizeTtlSeconds(expiresInSeconds);
    } else {
        const currentTtl = await redis.ttl(docKey(existing.slug));
        ttlSeconds = currentTtl > 0 ? currentTtl : DEFAULT_DOC_TTL_SECONDS;
    }

    const now = new Date();
    next.updatedAt = now.toISOString();
    next.expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    const pipeline = redis.multi();

    if (nextSlug === existing.slug) {
        pipeline
            .set(docKey(nextSlug), JSON.stringify(next), { EX: ttlSeconds })
            .zAdd(DOC_INDEX_KEY, [{ score: Date.now(), value: nextSlug }]);
    } else {
        pipeline
            .set(docKey(nextSlug), JSON.stringify(next), { EX: ttlSeconds })
            .del(docKey(existing.slug))
            .zRem(DOC_INDEX_KEY, existing.slug)
            .zAdd(DOC_INDEX_KEY, [{ score: Date.now(), value: nextSlug }]);
    }

    await pipeline.exec();

    return next;
}

export async function deleteDoc(slug: string): Promise<boolean> {
    const redis = getRedis();
    const results = await redis
        .multi()
        .del(docKey(slug))
        .zRem(DOC_INDEX_KEY, slug)
        .exec();

    // In node-redis v4, exec resolves to an array of command results or throws on error.
    // The first result corresponds to DEL and is a number indicating the number of keys removed.
    const delCount = (results?.[0] as number) ?? 0;
    return delCount > 0;
}
