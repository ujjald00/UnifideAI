import { INSIGHTS_PATH, INSIGHTS_PAGE_SIZE, validateInsights, insightSearchText, validateTextLinks, isSafeArticleHref } from './model.mjs';

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const plain = value => esc(value).replace(/\r\n?|\n/g, '<br>');

function renderAutoLinkedText(text) {
  let output = '';
  let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'\u201C\u201D\u2018\u2019]+/g)) {
    let candidate = match[0].replace(/[.,;:!?]+$/, '');
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length) candidate = candidate.slice(0, -1);
    }
    output += plain(text.slice(cursor, match.index));
    try {
      if (!isSafeArticleHref(candidate)) throw new Error('Unsafe link');
      output += `<a href="${esc(candidate)}" rel="noopener noreferrer">${esc(candidate)}</a>${plain(match[0].slice(candidate.length))}`;
    } catch { output += plain(match[0]); }
    cursor = match.index + match[0].length;
  }
  return output + plain(text.slice(cursor));
}
export function renderInsightText(text, links) {
  validateTextLinks(text, links);
  if (!links?.length) return renderAutoLinkedText(text);
  let output = '';
  let cursor = 0;
  for (const link of links) {
    output += renderAutoLinkedText(text.slice(cursor, link.start));
    output += `<a href="${esc(link.href)}" rel="noopener noreferrer">${plain(text.slice(link.start, link.end))}</a>`;
    cursor = link.end;
  }
  return output + renderAutoLinkedText(text.slice(cursor));
}
function dateLabel(post) {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', ...(post.datePrecision === 'month' ? {} : { day: 'numeric' }), timeZone: 'UTC' }).format(new Date(`${post.publishedAt}T00:00:00Z`));
}
const dateValue = post => post.datePrecision === 'month' ? post.publishedAt.slice(0, 7) : post.publishedAt;
const topics = post => post.topics.length ? `<ul class="insight-topics" role="list">${post.topics.map(topic => `<li>${esc(topic)}</li>`).join('')}</ul>` : '';
function card(post, headingLevel, searchable = false) {
  return `<article class="insight-card"${searchable ? ` data-insight data-insight-id="${esc(post.id)}" data-insight-search="${esc(insightSearchText(post))}" data-insight-topics="${esc(JSON.stringify(post.topics))}"` : ''}><p class="insight-meta"><time datetime="${dateValue(post)}">${dateLabel(post)}</time></p><h${headingLevel}><a href="${INSIGHTS_PATH}${post.slug}/">${esc(post.title)}</a></h${headingLevel}><p class="insight-excerpt">${esc(post.excerpt)}</p>${topics(post)}</article>`;
}

export function renderInsightsPreview(records, { limit = 6 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error('Invalid Insights preview limit');
  const posts = validateInsights(records).slice(0, limit);
  return `<section class="wrap insights-section" id="latest-insights" aria-labelledby="latest-insights-title"><div class="insights-section-heading"><h2 id="latest-insights-title">Latest insights</h2><a class="section-link" href="${INSIGHTS_PATH}">View all insights <span aria-hidden="true">→</span></a></div>${posts.length ? `<div class="insights-grid">${posts.map(post => card(post, 3)).join('')}</div>` : '<p>No insights are available yet.</p>'}</section>`;
}

export function renderInsightsArchive(records) {
  const posts = validateInsights(records);
  const allTopics = [...new Set(posts.flatMap(post => post.topics))].sort((a, b) => a.localeCompare(b));
  return `<section class="wrap insights-archive" data-insights-archive data-page-size="${INSIGHTS_PAGE_SIZE}" aria-label="All insights"><div class="insights-controls" data-insights-controls hidden><div class="insights-field"><label for="insights-search">Search insights</label><input id="insights-search" data-insights-search type="search" placeholder="Search titles and full text" autocomplete="off" aria-controls="insights-results"></div><div class="insights-field"><label for="insights-topic">Topic</label><select id="insights-topic" data-insights-topic aria-controls="insights-results"><option value="">All topics</option>${allTopics.map(topic => `<option value="${esc(topic)}">${esc(topic)}</option>`).join('')}</select></div><button class="button button-secondary" type="button" data-insights-clear>Reset</button></div><p class="insights-status" data-insights-status role="status" aria-live="polite" aria-atomic="true">${posts.length} ${posts.length === 1 ? 'insight' : 'insights'}</p><div class="insights-grid" id="insights-results" data-insights-list tabindex="-1">${posts.map(post => card(post, 2, true)).join('')}</div><p class="insights-empty" data-insights-empty hidden>No insights match your search. Try another term or reset the filters.</p><nav class="insights-pagination" data-insights-pagination aria-label="Insights pages" hidden><button class="button button-secondary" type="button" data-insights-previous aria-controls="insights-results">Previous</button><span data-insights-page-status></span><button class="button button-secondary" type="button" data-insights-next aria-controls="insights-results">Next</button></nav><noscript><p>All insights are listed above. Search, topic filters, and pagination need JavaScript.</p></noscript></section>`;
}

export function renderInsightDetail(record) {
  const [post] = validateInsights([record]);
  const media = new Map(post.media.map(item => [item.src, item]));
  const positioned = new Set();
  const image = src => {
    const item = media.get(src);
    positioned.add(src);
    return `<figure class="insight-media"><img src="${esc(item.src)}" alt="${esc(item.alt)}" width="${item.width}" height="${item.height}" loading="lazy" decoding="async"></figure>`;
  };
  const body = post.blocks.map(block => {
    if (block.type === 'image') return image(block.src);
    if (block.type === 'list') return `<ul>${block.items.map(item => `<li>${typeof item === 'string' ? renderInsightText(item) : renderInsightText(item.text, item.links)}</li>`).join('')}</ul>`;
    const tag = block.type === 'heading' ? `h${block.level || 2}` : 'p';
    return `<${tag}>${renderInsightText(block.text, block.links)}</${tag}>`;
  }).join('');
  const remaining = post.media.filter(item => !positioned.has(item.src)).map(item => image(item.src)).join('');
  return `<article class="wrap insight-article"><p class="insight-meta"><span>${esc(post.author)}</span> · <time datetime="${dateValue(post)}">${dateLabel(post)}</time></p>${topics(post)}<div class="insight-body">${body}${remaining}</div><p class="insight-source"><a href="${esc(post.sourceUrl)}" rel="noopener noreferrer">Originally published on LinkedIn</a></p><a class="section-link" href="${INSIGHTS_PATH}">All insights <span aria-hidden="true">→</span></a></article>`;
}
