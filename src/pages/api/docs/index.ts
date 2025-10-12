import type { APIRoute } from 'astro';
import { createDoc, DocConflictError, DocValidationError, listDocs } from '../../../server/docService';

export const GET: APIRoute = async () => {
    try {
        const docs = await listDocs();
        return new Response(JSON.stringify(docs), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[api/docs] failed to list documents', error);
        return new Response(
            JSON.stringify({ message: 'Failed to load documents.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const payload = await request.json();
        const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
        const content = typeof payload?.content === 'string' ? payload.content : '';
        const slug = typeof payload?.slug === 'string' ? payload.slug : undefined;

        if (!title) {
            return new Response(
                JSON.stringify({ message: 'Title is required.' }),
                { status: 422, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const doc = await createDoc({ title, content, slug });
        return new Response(JSON.stringify(doc), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        if (error instanceof DocValidationError) {
            return new Response(
                JSON.stringify({ message: error.message }),
                { status: 422, headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (error instanceof DocConflictError) {
            return new Response(
                JSON.stringify({ message: error.message }),
                { status: 409, headers: { 'Content-Type': 'application/json' } },
            );
        }
        console.error('[api/docs] failed to create document', error);
        return new Response(
            JSON.stringify({ message: 'Could not create document.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
};
