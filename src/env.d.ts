/// <reference types="astro/client-image" />

interface ImportMetaEnv {
	readonly PUBLIC_VERCEL_ANALYTICS_ID: string;
	readonly REDIS_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
