import { randomUUID } from 'node:crypto';

import { getRedis } from '../lib/redis';

export interface DocRecord {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
}

export type DocSummary = Omit<DocRecord, 'content'>;

const DOC_PREFIX = 'doc:';
const DOC_INDEX_KEY = 'docs:index';

function docKey(id: string): string {
    return `${DOC_PREFIX}${id}`;
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
            const parsed = JSON.parse(row) as DocRecord;
            // Only return metadata to keep payloads small.
            docs.push({ id: parsed.id, title: parsed.title, createdAt: parsed.createdAt, updatedAt: parsed.updatedAt });
        } catch (error) {
            console.error('[docs] failed to parse stored document', error);
        }
    });

    return docs;
}

export async function getDoc(id: string): Promise<DocRecord | null> {
    const redis = getRedis();
    const raw = await redis.get(docKey(id));
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as DocRecord;
    } catch (error) {
        console.error('[docs] failed to parse document', error);
        return null;
    }
}

export interface CreateDocInput {
    title: string;
    content: string;
}

export async function createDoc({ title, content }: CreateDocInput): Promise<DocRecord> {
    const redis = getRedis();
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: DocRecord = {
        id,
        title,
        content,
        createdAt: now,
        updatedAt: now,
    };

    await redis
        .multi()
        .set(docKey(id), JSON.stringify(record))
        .zadd(DOC_INDEX_KEY, Date.now(), id)
        .exec();

    return record;
}

export interface UpdateDocInput {
    title?: string;
    content?: string;
}

export async function updateDoc(id: string, { title, content }: UpdateDocInput): Promise<DocRecord | null> {
    const redis = getRedis();
    const existing = await getDoc(id);
    if (!existing) {
        return null;
    }

    const next: DocRecord = {
        ...existing,
        title: title !== undefined ? title : existing.title,
        content: content !== undefined ? content : existing.content,
        updatedAt: new Date().toISOString(),
    };

    await redis
        .multi()
        .set(docKey(id), JSON.stringify(next))
        .zadd(DOC_INDEX_KEY, Date.now(), id)
        .exec();

    return next;
}

export async function deleteDoc(id: string): Promise<boolean> {
    const redis = getRedis();
    const results = await redis.multi().del(docKey(id)).zrem(DOC_INDEX_KEY, id).exec();
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
