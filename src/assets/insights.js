export function normalizeSearch(value) {
  return String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function filterAndPaginate(records, { query = '', topic = '', page = 1, pageSize = 12 } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Invalid Insights page size');
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  const filtered = records.filter(record => (!topic || record.topics.includes(topic)) && terms.every(term => record.search.includes(term)));
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Number.isFinite(Number(page)) ? Math.min(pages, Math.max(1, Math.floor(Number(page)))) : 1;
  const start = total ? (current - 1) * pageSize + 1 : 0;
  const end = total ? Math.min(current * pageSize, total) : 0;
  return { items: filtered.slice((current - 1) * pageSize, current * pageSize), total, pages, page: current, start, end };
}

export function enhanceInsights(root) {
  const find = attribute => root.querySelector(`[data-insights-${attribute}]`);
  const controls = find('controls');
  const search = find('search');
  const topic = find('topic');
  const clear = find('clear');
  const status = find('status');
  const list = find('list');
  const empty = find('empty');
  const pagination = find('pagination');
  const previous = find('previous');
  const next = find('next');
  const pageStatus = find('page-status');
  if (![controls, search, topic, clear, status, list, empty, pagination, previous, next, pageStatus].every(Boolean)) return false;
  let records;
  try {
    records = [...root.querySelectorAll('[data-insight]')].map(node => ({ id: node.dataset.insightId, search: normalizeSearch(node.dataset.insightSearch), topics: JSON.parse(node.dataset.insightTopics), node }));
    if (records.some(record => !record.id || !Array.isArray(record.topics) || record.topics.some(label => typeof label !== 'string')) || new Set(records.map(record => record.id)).size !== records.length) return false;
  } catch { return false; }
  const pageSize = Number(root.dataset.pageSize || 12);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return false;
  let page = 1;
  const update = () => {
    const result = filterAndPaginate(records, { query: search.value, topic: topic.value, page, pageSize });
    page = result.page;
    const visible = new Set(result.items.map(item => item.id));
    records.forEach(record => { record.node.hidden = !visible.has(record.id); });
    status.textContent = result.total ? `${result.start}–${result.end} of ${result.total} ${result.total === 1 ? 'insight' : 'insights'}` : 'No insights found';
    empty.hidden = result.total !== 0;
    pagination.hidden = result.pages <= 1;
    previous.disabled = result.page <= 1;
    next.disabled = result.page >= result.pages;
    pageStatus.textContent = `Page ${result.page} of ${result.pages}`;
  };
  const resetPage = () => { page = 1; update(); };
  search.addEventListener('input', resetPage);
  topic.addEventListener('change', resetPage);
  clear.addEventListener('click', () => { search.value = ''; topic.value = ''; resetPage(); search.focus(); });
  const changePage = amount => {
    page += amount;
    update();
    list.focus({ preventScroll: true });
    list.scrollIntoView({ behavior: 'auto', block: 'start' });
  };
  previous.addEventListener('click', () => changePage(-1));
  next.addEventListener('click', () => changePage(1));
  update();
  controls.hidden = false;
  return true;
}

if (typeof document !== 'undefined') document.querySelectorAll('[data-insights-archive]').forEach(enhanceInsights);
