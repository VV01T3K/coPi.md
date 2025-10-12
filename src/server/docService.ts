import { getRedis } from '../lib/redis';

export interface DocRecord {
    id: string;
    slug: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
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
    const ids = await redis.zrevrange(DOC_INDEX_KEY, 0, -1);

    if (ids.length === 0) {
        return [];
    }

    const keys = ids.map((id) => docKey(id));
    const rows = await redis.mget(keys);

    const docs: DocSummary[] = [];
    rows.forEach((row) => {
        if (!row) {
            return;
        }
        try {
            const parsed = JSON.parse(row) as Partial<DocRecord>;
            const slug = parsed.slug ?? parsed.id;
            if (!slug || !parsed.title || !parsed.createdAt || !parsed.updatedAt) {
                return;
            }
            // Only return metadata to keep payloads small.
            docs.push({
                id: slug,
                slug,
                title: parsed.title,
                createdAt: parsed.createdAt,
                updatedAt: parsed.updatedAt,
            });
        } catch (error) {
            console.error('[docs] failed to parse stored document', error);
        }
    });

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

        return {
            id: normalizedSlug,
            slug: normalizedSlug,
            title: parsed.title,
            content: parsed.content,
            createdAt: parsed.createdAt,
            updatedAt: parsed.updatedAt,
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
}

export async function createDoc({ title, content, slug }: CreateDocInput): Promise<DocRecord> {
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

    const now = new Date().toISOString();
    const record: DocRecord = {
        id: normalizedSlug,
        slug: normalizedSlug,
        title,
        content,
        createdAt: now,
        updatedAt: now,
    };

    await redis
        .multi()
        .set(docKey(normalizedSlug), JSON.stringify(record))
        .zadd(DOC_INDEX_KEY, Date.now(), normalizedSlug)
        .exec();

    return record;
}

export interface UpdateDocInput {
    title?: string;
    content?: string;
    slug?: string;
}

export async function updateDoc(currentSlug: string, { title, content, slug }: UpdateDocInput): Promise<DocRecord | null> {
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
        updatedAt: new Date().toISOString(),
    };

    const pipeline = redis.multi();

    if (nextSlug === existing.slug) {
        pipeline.set(docKey(nextSlug), JSON.stringify(next)).zadd(DOC_INDEX_KEY, Date.now(), nextSlug);
    } else {
        pipeline
            .set(docKey(nextSlug), JSON.stringify(next))
            .del(docKey(existing.slug))
            .zrem(DOC_INDEX_KEY, existing.slug)
            .zadd(DOC_INDEX_KEY, Date.now(), nextSlug);
    }

    await pipeline.exec();

    return next;
}

export async function deleteDoc(slug: string): Promise<boolean> {
    const redis = getRedis();
    const results = await redis.multi().del(docKey(slug)).zrem(DOC_INDEX_KEY, slug).exec();
    if (!results) {
        return false;
    }

    const [delResult] = results;
    if (!delResult) {
        return false;
    }

    const [error, deletedCount] = delResult as [Error | null, number];
    if (error) {
        throw error;
    }

    return deletedCount > 0;
}
