import type { APIRoute } from 'astro';
import { deleteDoc, getDoc, updateDoc } from '../../../server/docService';

export const GET: APIRoute = async ({ params }) => {
	try {
		const id = params.id;
		if (!id) {
			return new Response(JSON.stringify({ message: 'Missing document id.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const doc = await getDoc(id);
		if (!doc) {
			return new Response(JSON.stringify({ message: 'Document not found.' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		return new Response(JSON.stringify(doc), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('[api/docs/:id] failed to load document', error);
		return new Response(JSON.stringify({ message: 'Failed to load document.' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};

export const PUT: APIRoute = async ({ params, request }) => {
	try {
		const id = params.id;
		if (!id) {
			return new Response(JSON.stringify({ message: 'Missing document id.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const payload = await request.json();
		const updates: { title?: string; content?: string } = {};

		if (typeof payload?.title === 'string') {
			const nextTitle = payload.title.trim();
			if (!nextTitle) {
				return new Response(JSON.stringify({ message: 'Title cannot be empty.' }), {
					status: 422,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			updates.title = nextTitle;
		}

		if (typeof payload?.content === 'string') {
			updates.content = payload.content;
		}

		const doc = await updateDoc(id, updates);
		if (!doc) {
			return new Response(JSON.stringify({ message: 'Document not found.' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		return new Response(JSON.stringify(doc), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('[api/docs/:id] failed to update document', error);
		return new Response(JSON.stringify({ message: 'Could not update document.' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};

export const DELETE: APIRoute = async ({ params }) => {
	try {
		const id = params.id;
		if (!id) {
			return new Response(JSON.stringify({ message: 'Missing document id.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const removed = await deleteDoc(id);
		if (!removed) {
			return new Response(JSON.stringify({ message: 'Document not found.' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		return new Response(JSON.stringify({ message: 'Document deleted.' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('[api/docs/:id] failed to delete document', error);
		return new Response(JSON.stringify({ message: 'Could not delete document.' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
