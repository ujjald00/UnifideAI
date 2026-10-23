import fs from 'node:fs';

export const INSIGHTS_PATH = '/resources/insights/';
export const INSIGHTS_CUTOFF = '2026-05-01';
export const INSIGHTS_PAGE_SIZE = 12;
export const MEDIA_PATH = /^\/_marketing\/media\/([a-f0-9]{64})\.(png|jpg|jpeg|webp)$/;
const recordKeys = ['id', 'slug', 'title', 'excerpt', 'publishedAt', 'author', 'sourceUrl', 'topics', 'blocks', 'media'];
const reservedSlugs = new Set(['page', 'index', 'search', 'topics']);

function requireValue(condition, message) { if (!condition) throw new Error(`Invalid insight: ${message}`); }
function exactKeys(value, keys, label, optional = []) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  requireValue(Object.keys(value).every(key => keys.includes(key) || optional.includes(key)) && keys.every(key => Object.hasOwn(value, key)), `${label} has missing or unknown fields`);
}
function text(value, label, maximum = 200000) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value), `${label} must be nonempty plain text`);
}
export function isPublicSourceURL(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['linkedin.com', 'www.linkedin.com'].includes(url.hostname) && !url.port && !url.username && !url.password && !url.search && !url.hash && !/[\s\\]/.test(value) && /^(?:\/posts\/[^/%]+|\/feed\/update\/urn:li:(?:activity|share):\d+|\/pulse\/[^/%]+)\/?$/.test(url.pathname);
  } catch { return false; }
}
export function isSafeArticleHref(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\s\\\u0000-\u001F\u007F]/.test(value)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}
export function validateTextLinks(value, links) {
  if (links === undefined) return;
  requireValue(typeof value === 'string' && Array.isArray(links), 'text links must be an array');
  const splitsSurrogate = index => index > 0 && index < value.length && /[\uD800-\uDBFF]/.test(value[index - 1]) && /[\uDC00-\uDFFF]/.test(value[index]);
  let previousEnd = 0;
  for (const link of links) {
    exactKeys(link, ['start', 'end', 'href'], 'text link');
    requireValue(Number.isInteger(link.start) && Number.isInteger(link.end) && link.start >= previousEnd && link.end > link.start && link.end <= value.length, 'text links must have sorted, nonoverlapping, in-bounds ranges');
    requireValue(!splitsSurrogate(link.start) && !splitsSurrogate(link.end), 'text link range splits a Unicode character');
    requireValue(isSafeArticleHref(link.href), 'text link must be an absolute HTTP(S) URL without credentials');
    previousEnd = link.end;
  }
}
export function insightBodyText(post) {
  return post.blocks.filter(block => block.type !== 'image').map(block => block.type === 'list' ? block.items.map(item => typeof item === 'string' ? item : item.text).join('\n') : block.text).join('\n\n');
}
export function normalizeInsightSearch(value) {
  return String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
export function insightSearchText(post) {
  return normalizeInsightSearch([post.title, post.excerpt, post.author, ...post.topics, insightBodyText(post), ...post.media.map(item => item.alt)].join(' '));
}

export function validateInsights(records) {
  requireValue(Array.isArray(records), 'posts must be an array');
  const ids = new Set();
  const slugs = new Set();
  const sources = new Set();
  for (const post of records) {
    exactKeys(post, recordKeys, 'post', ['datePrecision']);
    requireValue(typeof post.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(post.id), 'id must be a stable identifier');
    requireValue(typeof post.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) && post.slug.length <= 160 && !reservedSlugs.has(post.slug), 'slug is invalid or reserved');
    text(post.title, 'title', 240);
    text(post.excerpt, 'excerpt', 700);
    requireValue(post.author === 'Ujjal Dutta', 'unexpected author');
    requireValue(typeof post.publishedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(post.publishedAt), 'publication date must be YYYY-MM-DD');
    const date = new Date(`${post.publishedAt}T00:00:00.000Z`);
    requireValue(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === post.publishedAt && post.publishedAt >= INSIGHTS_CUTOFF, 'publication date is invalid or before the cutoff');
    if (Object.hasOwn(post, 'datePrecision')) requireValue(post.datePrecision === 'day' || post.datePrecision === 'month', 'date precision must be day or month');
    requireValue(isPublicSourceURL(post.sourceUrl), 'source must be a canonical public LinkedIn post or article URL');
    const sourceKey = new URL(post.sourceUrl).pathname.replace(/\/$/, '');
    requireValue(!ids.has(post.id) && !slugs.has(post.slug) && !sources.has(sourceKey), 'duplicate id, slug, or source URL');
    ids.add(post.id); slugs.add(post.slug); sources.add(sourceKey);
    requireValue(Array.isArray(post.topics) && post.topics.length <= 8, 'topics must be an array with at most eight labels');
    for (const topic of post.topics) { text(topic, 'topic', 80); requireValue(topic === topic.trim() && !/[\r\n]/.test(topic), 'topic must be one trimmed label'); }
    requireValue(new Set(post.topics.map(normalizeInsightSearch)).size === post.topics.length, 'duplicate topic');
    requireValue(Array.isArray(post.media), 'media must be an array');
    const media = new Set();
    for (const item of post.media) {
      exactKeys(item, ['src', 'alt', 'width', 'height'], 'media');
      requireValue(typeof item.src === 'string' && MEDIA_PATH.test(item.src) && !media.has(item.src), 'media must use a unique content-hashed local path');
      text(item.alt, 'image alt text', 2000);
      requireValue(Number.isInteger(item.width) && Number.isInteger(item.height) && item.width > 0 && item.height > 0 && item.width <= 20000 && item.height <= 20000, 'image dimensions must be positive integers within bounds');
      media.add(item.src);
    }
    requireValue(Array.isArray(post.blocks) && post.blocks.length > 0, 'complete body blocks are required');
    let textBlocks = 0;
    for (const block of post.blocks) {
      requireValue(block && typeof block === 'object' && !Array.isArray(block), 'body block must be an object');
      if (block.type === 'paragraph' || block.type === 'heading') {
        exactKeys(block, ['type', 'text'], 'text block', block.type === 'heading' ? ['links', 'level'] : ['links']);
        text(block.text, 'body text');
        validateTextLinks(block.text, block.links);
        if (Object.hasOwn(block, 'level')) requireValue(block.level === 2 || block.level === 3, 'heading level must be 2 or 3');
        textBlocks++;
      } else if (block.type === 'list') {
        exactKeys(block, ['type', 'items'], 'list block');
        requireValue(Array.isArray(block.items) && block.items.length > 0, 'list needs items');
        for (const item of block.items) {
          if (typeof item === 'string') text(item, 'list item');
          else {
            exactKeys(item, ['text'], 'list item', ['links']);
            text(item.text, 'list item text');
            validateTextLinks(item.text, item.links);
          }
        }
        textBlocks++;
      } else if (block.type === 'image') {
        exactKeys(block, ['type', 'src'], 'image block');
        requireValue(media.has(block.src), 'image block must reference declared media');
      } else requireValue(false, 'unsupported block type');
    }
    requireValue(textBlocks > 0, 'body must include original text');
  }
  return [...records].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}

export function readInsights({ allowMissing = false } = {}) {
  const source = new URL('./posts.json', import.meta.url);
  if (allowMissing && !fs.existsSync(source)) return [];
  return validateInsights(JSON.parse(fs.readFileSync(source, 'utf8')));
}
export function insightRoutes(records) {
  return [INSIGHTS_PATH, ...validateInsights(records).map(post => `${INSIGHTS_PATH}${post.slug}/`)];
}
export const routes = insightRoutes;
