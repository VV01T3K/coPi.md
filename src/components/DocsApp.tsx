import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import './DocsApp.css';
import { DEFAULT_DOC_TTL_SECONDS, MAX_DOC_TTL_SECONDS, MIN_DOC_TTL_SECONDS } from '../lib/docExpiration';

type DocSummary = {
    slug: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    expiresAt: string | null;
};

type Doc = DocSummary & { content: string };

type FormState = {
    title: string;
    content: string;
    slug: string;
    expirationDays: string;
};

const SECONDS_PER_DAY = 24 * 60 * 60;
const MS_PER_DAY = SECONDS_PER_DAY * 1000;
const MIN_EXPIRATION_DAYS = MIN_DOC_TTL_SECONDS / SECONDS_PER_DAY;
const MAX_EXPIRATION_DAYS = MAX_DOC_TTL_SECONDS / SECONDS_PER_DAY;
const DEFAULT_EXPIRATION_DAYS = DEFAULT_DOC_TTL_SECONDS / SECONDS_PER_DAY;

const EMPTY_FORM: FormState = {
    title: '',
    content: '',
    slug: '',
    expirationDays: DEFAULT_EXPIRATION_DAYS.toString(),
};

function deriveExpirationDays(expiresAt: string | null): string {
    if (!expiresAt) {
        return DEFAULT_EXPIRATION_DAYS.toString();
    }

    const expiresTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const diffMs = expiresTime - now;
    if (!Number.isFinite(diffMs) || diffMs <= 0) {
        return DEFAULT_EXPIRATION_DAYS.toString();
    }

    const diffDays = diffMs / MS_PER_DAY;
    const clamped = Math.min(MAX_EXPIRATION_DAYS, Math.max(MIN_EXPIRATION_DAYS, Math.ceil(diffDays)));
    return clamped.toString();
}

function formatExpirationLabel(expiresAt: string | null): string | null {
    if (!expiresAt) {
        return null;
    }
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return `Expires ${date.toLocaleString()}`;
}

function slugify(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export default function DocsApp() {
    const [docs, setDocs] = useState<DocSummary[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [origin, setOrigin] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setOrigin(window.location.origin);
        }
        void refreshList();
    }, []);

    const slugPrefix = useMemo(() => {
        const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
        return base ? `${base}/docs/` : '/docs/';
    }, [origin]);

    const shareUrl = useMemo(() => {
        if (!selectedDoc) {
            return null;
        }
        return `${slugPrefix}${selectedDoc.slug}`;
    }, [selectedDoc, slugPrefix]);

    const expirationLabel = useMemo(
        () => formatExpirationLabel(selectedDoc ? selectedDoc.expiresAt : null),
        [selectedDoc?.expiresAt],
    );

    async function refreshList(activeSlug?: string) {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/docs');
            if (!response.ok) {
                throw new Error('Failed to load documents');
            }
            const data = (await response.json()) as DocSummary[];
            setDocs(data);
            const targetSlug = activeSlug ?? selectedDoc?.slug;
            if (targetSlug) {
                const stillExists = data.find((item) => item.slug === targetSlug);
                if (!stillExists) {
                    setSelectedDoc(null);
                    setForm(EMPTY_FORM);
                } else if (selectedDoc) {
                    setSelectedDoc({ ...stillExists, content: selectedDoc.content });
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unexpected error while loading documents.');
        } finally {
            setLoading(false);
        }
    }

    async function loadDoc(slug: string) {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/docs/${slug}`);
            if (!response.ok) {
                throw new Error('Failed to load document');
            }
            const doc = (await response.json()) as Doc;
            setSelectedDoc(doc);
            setForm({
                title: doc.title,
                content: doc.content,
                slug: doc.slug,
                expirationDays: deriveExpirationDays(doc.expiresAt),
            });
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
        if (name === 'expirationDays') {
            setForm((prev: FormState) => ({ ...prev, expirationDays: value }));
            return;
        }
        if (name === 'title') {
            const nextTitle = value;
            setForm((prev: FormState) => {
                const shouldUpdateSlug = !selectedDoc && (prev.slug === '' || prev.slug === slugify(prev.title));
                const nextState: FormState = {
                    ...prev,
                    title: nextTitle,
                };
                if (shouldUpdateSlug) {
                    nextState.slug = slugify(nextTitle);
                }
                return nextState;
            });
            return;
        }

        const normalizedValue = name === 'slug' ? slugify(value) : value;
        setForm((prev: FormState) => ({ ...prev, [name]: normalizedValue }));
    }

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!form.title.trim()) {
            setError('Title is required.');
            return;
        }
        if (form.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
            setError('Slug can only contain lowercase letters, numbers, and hyphens.');
            return;
        }

        const expirationDaysValue = Number(form.expirationDays);
        if (
            Number.isNaN(expirationDaysValue) ||
            expirationDaysValue < MIN_EXPIRATION_DAYS ||
            expirationDaysValue > MAX_EXPIRATION_DAYS
        ) {
            setError(`Expiration must be between ${MIN_EXPIRATION_DAYS} and ${MAX_EXPIRATION_DAYS} days.`);
            return;
        }

        const expiresInSeconds = Math.round(expirationDaysValue) * SECONDS_PER_DAY;

        setBusy(true);
        setError(null);
        try {
            const response = await fetch('/api/docs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: form.title,
                    content: form.content,
                    slug: form.slug,
                    expiresInSeconds,
                }),
            });
            if (!response.ok) {
                const payload = (await response.json()) as { message?: string };
                throw new Error(payload.message || 'Failed to create document.');
            }
            const doc = (await response.json()) as Doc;
            setSelectedDoc(doc);
            setForm({
                title: doc.title,
                content: doc.content,
                slug: doc.slug,
                expirationDays: deriveExpirationDays(doc.expiresAt),
            });
            await refreshList(doc.slug);
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
        if (!form.slug.trim()) {
            setError('Slug is required.');
            return;
        }
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
            setError('Slug can only contain lowercase letters, numbers, and hyphens.');
            return;
        }

        const expirationDaysValue = Number(form.expirationDays);
        if (
            Number.isNaN(expirationDaysValue) ||
            expirationDaysValue < MIN_EXPIRATION_DAYS ||
            expirationDaysValue > MAX_EXPIRATION_DAYS
        ) {
            setError(`Expiration must be between ${MIN_EXPIRATION_DAYS} and ${MAX_EXPIRATION_DAYS} days.`);
            return;
        }

        const expiresInSeconds = Math.round(expirationDaysValue) * SECONDS_PER_DAY;

        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/docs/${selectedDoc.slug}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: form.title,
                    content: form.content,
                    slug: form.slug,
                    expiresInSeconds,
                }),
            });
            if (!response.ok) {
                const payload = (await response.json()) as { message?: string };
                throw new Error(payload.message || 'Failed to save document.');
            }
            const doc = (await response.json()) as Doc;
            setSelectedDoc(doc);
            setForm({
                title: doc.title,
                content: doc.content,
                slug: doc.slug,
                expirationDays: deriveExpirationDays(doc.expiresAt),
            });
            await refreshList(doc.slug);
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
            const response = await fetch(`/api/docs/${selectedDoc.slug}`, {
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
                <h1>co<span className="PI_HIGHLIGHT">Pi</span>.md</h1>
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
                                <li key={doc.slug}>
                                    <button
                                        type="button"
                                        title={`Open ${doc.title}`}
                                        className={doc.slug === selectedDoc?.slug ? 'is-active' : ''}
                                        onClick={() => {
                                            // Avoid breaking double-click by disabling; guard instead
                                            if (busy) return;
                                            if (doc.slug === selectedDoc?.slug) return;
                                            void loadDoc(doc.slug);
                                        }}
                                        onDoubleClick={() => {
                                            const url = `/docs/${doc.slug}`;
                                            if (typeof window !== 'undefined') {
                                                window.location.assign(url);
                                            }
                                        }}
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
                            <label htmlFor="slug">Share link</label>
                            <div className="docs-app__slug">
                                <span className="docs-app__slug-prefix">{slugPrefix}</span>
                                <input
                                    id="slug"
                                    name="slug"
                                    type="text"
                                    value={form.slug}
                                    onChange={handleChange}
                                    required={!!selectedDoc}
                                    placeholder="my-snippet"
                                    disabled={busy}
                                />
                            </div>
                            <small className="docs-app__hint">Lowercase letters, numbers, and hyphens only.</small>
                        </div>
                        <div className="docs-app__field">
                            <label htmlFor="expirationDays">Expires after (days)</label>
                            <input
                                id="expirationDays"
                                name="expirationDays"
                                type="number"
                                min={MIN_EXPIRATION_DAYS}
                                max={MAX_EXPIRATION_DAYS}
                                step={1}
                                value={form.expirationDays}
                                onChange={handleChange}
                                disabled={busy}
                            />
                            <small className="docs-app__hint">
                                Between {MIN_EXPIRATION_DAYS} and {MAX_EXPIRATION_DAYS} days (default {DEFAULT_EXPIRATION_DAYS}{' '}
                                {DEFAULT_EXPIRATION_DAYS === 1 ? 'day' : 'days'}).
                            </small>
                            {expirationLabel ? (
                                <small className="docs-app__hint docs-app__hint--meta">{expirationLabel}</small>
                            ) : null}
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
