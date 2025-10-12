import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import './DocsApp.css';

type DocSummary = {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
};

type Doc = DocSummary & { content: string };

type FormState = {
	title: string;
	content: string;
};

const EMPTY_FORM: FormState = { title: '', content: '' };

export default function DocsApp() {
	const [docs, setDocs] = useState<DocSummary[]>([]);
	const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void refreshList();
	}, []);

	const shareUrl = useMemo(() => {
		if (!selectedDoc) {
			return null;
		}
		if (typeof window === 'undefined') {
			return null;
		}
		return `${window.location.origin}/docs/${selectedDoc.id}`;
	}, [selectedDoc]);

	async function refreshList() {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch('/api/docs');
			if (!response.ok) {
				throw new Error('Failed to load documents');
			}
			const data = (await response.json()) as DocSummary[];
			setDocs(data);
			if (selectedDoc) {
				// Ensure the selected document still exists and refresh its metadata.
				const stillExists = data.find((item) => item.id === selectedDoc.id);
				if (!stillExists) {
					setSelectedDoc(null);
					setForm(EMPTY_FORM);
				} else {
					setSelectedDoc({ ...stillExists, content: selectedDoc.content });
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unexpected error while loading documents.');
		} finally {
			setLoading(false);
		}
	}

	async function loadDoc(id: string) {
		setBusy(true);
		setError(null);
		try {
			const response = await fetch(`/api/docs/${id}`);
			if (!response.ok) {
				throw new Error('Failed to load document');
			}
			const doc = (await response.json()) as Doc;
			setSelectedDoc(doc);
			setForm({ title: doc.title, content: doc.content });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unexpected error while loading document.');
		} finally {
			setBusy(false);
		}
	}

	function startNew() {
		setSelectedDoc(null);
		setForm(EMPTY_FORM);
		setError(null);
	}

	function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
		const { name, value } = event.target;
		setForm((prev: FormState) => ({ ...prev, [name]: value }));
	}

	async function handleCreate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!form.title.trim()) {
			setError('Title is required.');
			return;
		}

		setBusy(true);
		setError(null);
		try {
			const response = await fetch('/api/docs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: form.title, content: form.content }),
			});
			if (!response.ok) {
				const payload = (await response.json()) as { message?: string };
				throw new Error(payload.message || 'Failed to create document.');
			}
			const doc = (await response.json()) as Doc;
			setSelectedDoc(doc);
			setForm({ title: doc.title, content: doc.content });
			await refreshList();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unexpected error while creating document.');
		} finally {
			setBusy(false);
		}
	}

	async function handleUpdate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedDoc) {
			return;
		}
		if (!form.title.trim()) {
			setError('Title is required.');
			return;
		}

		setBusy(true);
		setError(null);
		try {
			const response = await fetch(`/api/docs/${selectedDoc.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: form.title, content: form.content }),
			});
			if (!response.ok) {
				const payload = (await response.json()) as { message?: string };
				throw new Error(payload.message || 'Failed to save document.');
			}
			const doc = (await response.json()) as Doc;
			setSelectedDoc(doc);
			setForm({ title: doc.title, content: doc.content });
			await refreshList();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unexpected error while saving document.');
		} finally {
			setBusy(false);
		}
	}

	async function handleDelete() {
		if (!selectedDoc) {
			return;
		}
		const confirmation = window.confirm('Delete this document?');
		if (!confirmation) {
			return;
		}

		setBusy(true);
		setError(null);
		try {
			const response = await fetch(`/api/docs/${selectedDoc.id}`, {
				method: 'DELETE',
			});
			if (!response.ok) {
				const payload = (await response.json()) as { message?: string };
				throw new Error(payload.message || 'Failed to delete document.');
			}
			startNew();
			await refreshList();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unexpected error while deleting document.');
		} finally {
			setBusy(false);
		}
	}

	const onSubmit = selectedDoc ? handleUpdate : handleCreate;

	return (
		<div className="docs-app">
			<header className="docs-app__header">
				<h1>copicat markdown</h1>
				<p>Capture, edit, and share Markdown snippets backed by Redis.</p>
			</header>
			<main className="docs-app__layout">
				<aside className="docs-app__sidebar">
					<div className="docs-app__sidebar-header">
						<h2>Your documents</h2>
						<button type="button" className="docs-app__new" onClick={startNew} disabled={busy}>
							+ New document
						</button>
					</div>
					{loading ? (
						<p className="docs-app__status">Loading…</p>
					) : docs.length === 0 ? (
						<p className="docs-app__status">No documents yet. Create your first one!</p>
					) : (
						<ul className="docs-app__list">
							{docs.map((doc: DocSummary) => (
								<li key={doc.id}>
									<button
										type="button"
										className={doc.id === selectedDoc?.id ? 'is-active' : ''}
										onClick={() => void loadDoc(doc.id)}
										disabled={busy && doc.id === selectedDoc?.id}
									>
										<strong>{doc.title}</strong>
										<small>Updated {new Date(doc.updatedAt).toLocaleString()}</small>
									</button>
								</li>
							))}
						</ul>
					)}
				</aside>
				<section className="docs-app__editor">
					<form onSubmit={onSubmit}>
						<div className="docs-app__field">
							<label htmlFor="title">Title</label>
							<input
								id="title"
								name="title"
								type="text"
								value={form.title}
								onChange={handleChange}
								required
								placeholder="My brilliant snippet"
								disabled={busy}
							/>
						</div>
						<div className="docs-app__field">
							<label htmlFor="content">Markdown</label>
							<textarea
								id="content"
								name="content"
								rows={18}
								value={form.content}
								onChange={handleChange}
								placeholder="# Hello world\nWrite some markdown here…"
								disabled={busy}
							/>
						</div>
						<div className="docs-app__actions">
							<button type="submit" disabled={busy}>
								{selectedDoc ? 'Save changes' : 'Create document'}
							</button>
							{selectedDoc ? (
								<button type="button" className="danger" onClick={() => void handleDelete()} disabled={busy}>
									Delete
								</button>
							) : null}
							{shareUrl ? (
								<a className="docs-app__share" href={shareUrl} target="_blank" rel="noreferrer">
									Open share link
								</a>
							) : null}
						</div>
						{error ? <p className="docs-app__error">{error}</p> : null}
					</form>
				</section>
			</main>
		</div>
	);
}
