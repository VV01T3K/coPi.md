import { remark } from 'remark';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import type { Options as HighlightOptions } from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Schema } from 'hast-util-sanitize';
import rehypeStringify from 'rehype-stringify';

const sanitizeSchema: Schema = (() => {
    const schema = structuredClone(defaultSchema) as Schema;
    const attributes = (schema.attributes ??= {});
    const tagNames = new Set(schema.tagNames ?? []);
    // Allow span wrappers inserted by highlight.js.
    tagNames.add('span');
    schema.tagNames = Array.from(tagNames);

    type AttributeList = NonNullable<typeof attributes>[string];
    const allowClass = (tag: string, value: string | RegExp) => {
        const list = (attributes[tag] ??= [] as AttributeList);
        if (Array.isArray(list)) {
            list.push(['className', value]);
        } else {
            attributes[tag] = [['className', value]] as AttributeList;
        }
    };

    ['hljs', /^language-/, /^hljs-/].forEach((rule) => {
        allowClass('code', rule);
        allowClass('pre', rule);
    });

    allowClass('span', /^hljs-/);

    return schema;
})();

/**
 * Converts markdown content to sanitized HTML for safe rendering.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
    const highlightOptions = { ignoreMissing: true } as unknown as HighlightOptions;

    const file = await remark()
        .use(remarkParse)
        .use(remarkRehype)
        .use(rehypeHighlight, highlightOptions)
        .use(rehypeSanitize, sanitizeSchema)
        .use(rehypeStringify)
        .process(markdown);

    return String(file);
}
