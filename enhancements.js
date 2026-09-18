import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = 'https://ehyivgyprxiyhldxrzpx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tukBY1endjNBJdVFoSBHbA__pHOPGGx';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let gamesBySlug = new Map();
let linksByGame = new Map();
let loaded = false;
let timer = null;
let calendarLoading = false;
let currentHash = location.hash || '#dashboard';

const statusText = {
  released: '已上市 / Released',
  preorder: '預購中 / Pre-order',
  announced: '已公布 / Announced',
  delayed: '延期 / Delayed',
  early_access: '搶先體驗 / Early Access',
  cancelled: '取消 / Cancelled',
  unknown: '日期待定 / TBA'
};

function safeUrl(url) {
  try {
    const u = new URL(url);
    return ['https:', 'http:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
}

function zhDate(value) {
  if (!value) return '日期待定 / TBA';
  try {
    return new Intl.DateTimeFormat('zh-TW', { year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value));
  } catch {
    return String(value).slice(0,10);
  }
}

function addImage(container, url, alt) {
  if (!container || !url || container.dataset.imageApplied === '1') return;
  const src = safeUrl(url);
  if (!src) return;
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || '遊戲封面 / Game cover';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => {
    container.classList.remove('has-image');
    img.remove();
    container.dataset.imageApplied = '0';
  });
  container.textContent = '';
  container.appendChild(img);
  container.classList.add('has-image');
  container.dataset.imageApplied = '1';
}

async function ensureGameMetadata(slugs) {
  const missing = [...new Set(slugs.filter(Boolean))].filter(slug => !gamesBySlug.has(slug));
  if (!missing.length) return;
  for (let i=0; i<missing.length; i+=100) {
    const chunk = missing.slice(i,i+100);
    const { data } = await supabase.from('games').select('id,slug,name_en,name_zh_hant,cover_url,release_date,release_status').in('slug', chunk);
    for (const game of data || []) gamesBySlug.set(game.slug, game);
  }
}

async function ensureLinks(gameIds) {
  const ids = [...new Set(gameIds.filter(Boolean).map(String))].filter(id => !linksByGame.has(id));
  if (!ids.length) return;
  for (let i=0;i<ids.length;i+=100) {
    const chunk = ids.slice(i,i+100);
    const { data } = await supabase.from('official_links').select('game_id,label,url,tier,link_type').in('game_id', chunk);
    const seen = new Set(chunk);
    for (const id of seen) linksByGame.set(String(id), []);
    for (const link of data || []) {
      const key = String(link.game_id);
      const list = linksByGame.get(key) || [];
      list.push(link);
      list.sort((a,b) => (a.tier === 'official' ? -1 : 1) - (b.tier === 'official' ? -1 : 1));
      linksByGame.set(key,list);
    }
  }
}

function renderSourceLinks(card, game) {
  if (!card || card.querySelector('.card-source-row')) return;
  const links = linksByGame.get(String(game.id)) || [];
  if (!links.length) return;
  const row = document.createElement('div');
  row.className = 'card-source-row';
  const label = document.createElement('span');
  label.textContent = '來源 / Source';
  row.appendChild(label);
  for (const link of links.slice(0,2)) {
    const href = safeUrl(link.url);
    if (!href) continue;
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = `source-chip ${link.tier === 'official' ? 'official-source' : 'third-party-source'}`;
    a.textContent = link.tier === 'official' ? '官方 / Official' : (link.label || '第三方來源 / Third-party');
    row.appendChild(a);
  }
  const actions = card.querySelector('.card-actions');
  if (actions) card.insertBefore(row, actions);
  else card.appendChild(row);
}

function renderReleaseDate(card, game) {
  if (!card || card.querySelector('.card-release-row')) return;
  const row = document.createElement('div');
  row.className = 'card-release-row';
  const icon = document.createElement('span');
  icon.className = 'card-release-icon';
  icon.textContent = '📅';
  const label = document.createElement('span');
  label.className = 'card-release-label';
  label.textContent = '上市 / Release';
  const value = document.createElement('strong');
  value.className = game.release_date ? 'card-release-date' : 'card-release-date tba';
  value.textContent = game.release_date ? zhDate(game.release_date) : '日期待定 / TBA';
  row.append(icon, label, value);
  const tags = card.querySelector('.tags');
  if (tags) card.insertBefore(row, tags);
  else {
    const stats = card.querySelector('.game-stats');
    if (stats) card.insertBefore(row, stats);
    else card.appendChild(row);
  }
}

async function decorateCards() {
  const cards = [...document.querySelectorAll('.game-card[data-game]')];
  if (!cards.length) return;
  await ensureGameMetadata(cards.map(card => card.dataset.game));
  const games = cards.map(card => gamesBySlug.get(card.dataset.game)).filter(Boolean);
  await ensureLinks(games.map(g=>g.id));
  for (const card of cards) {
    const game = gamesBySlug.get(card.dataset.game);
    if (!game) continue;
    addImage(card.querySelector('.cover'), game.cover_url, game.name_zh_hant || game.name_en);
    renderReleaseDate(card, game);
    renderSourceLinks(card, game);
  }
}

async function decorateDetail() {
  const hash = location.hash.replace(/^#/, '');
  if (!hash.startsWith('game/')) return;
  const slug = hash.split('/')[1];
  await ensureGameMetadata([slug]);
  const game = gamesBySlug.get(slug);
  if (!game) return;
  addImage(document.querySelector('.detail-cover'), game.cover_url, game.name_zh_hant || game.name_en);
  const panels = [...document.querySelectorAll('.detail-grid .panel')];
  for (const panel of panels) {
    const h2 = panel.querySelector('.section-head h2');
    if (h2?.textContent?.trim() === '官方連結') {
      h2.textContent = '連結與資料來源 / Links & Sources';
      const p = panel.querySelector('.section-head p');
      if (p) p.textContent = '官方 / Official · 第三方 / Third-party';
    }
  }
  const metricLabels = [...document.querySelectorAll('.metric span')];
  const officialMetric = metricLabels.find(x => x.textContent?.trim() === '官方連結');
  if (officialMetric) officialMetric.textContent = '來源／連結 / Sources';
}

function addAttribution() {
  if (document.querySelector('.data-attribution')) return;
  const footer = document.querySelector('.footer');
  if (!footer) return;
  const div = document.createElement('div');
  div.className = 'data-attribution';
  div.innerHTML = '部分免費遊戲資料由 <a href="https://www.freetogame.com/" target="_blank" rel="noopener noreferrer">FreeToGame</a> 提供。 / Some free-game metadata provided by FreeToGame.';
  footer.appendChild(div);
}

function addBackButton() {
  const topbar = document.querySelector('.topbar');
  if (!topbar || topbar.querySelector('.nav-back-btn')) return;
  const hash = location.hash || '#dashboard';
  if (hash === '#dashboard' || hash === '') return;
  const btn = document.createElement('button');
  btn.className = 'btn ghost nav-back-btn';
  btn.type = 'button';
  btn.innerHTML = '<span class="back-arrow">←</span><span>返回 / Back</span>';
  btn.onclick = () => {
    const prev = sessionStorage.getItem('game-intel-prev-hash');
    const target = prev && prev !== location.hash ? prev : (location.hash.startsWith('#game/') ? '#games' : '#dashboard');
    location.hash = target.replace(/^#/, '');
  };
  topbar.insertBefore(btn, topbar.firstChild);
}

function releaseItem(g) {
  const title = g.name_zh_hant || g.name_en;
  const english = g.name_zh_hant && g.name_en && g.name_zh_hant !== g.name_en ? g.name_en : '';
  const cover = safeUrl(g.cover_url);
  return `<button class="release-card open-game" data-slug="${esc(g.slug)}">
    <span class="release-cover">${cover ? `<img src="${esc(cover)}" alt="${esc(title)}" loading="lazy" referrerpolicy="no-referrer">` : '<span>GI</span>'}</span>
    <span class="release-info"><strong>${esc(title)}</strong>${english ? `<small>${esc(english)}</small>` : '<small>暫無官方繁體中文名稱 / No official Traditional Chinese title</small>'}<em>${esc(zhDate(g.release_date))}</em></span>
    <span class="badge ${g.release_status === 'released' ? 'ok' : g.release_status === 'preorder' || g.release_status === 'delayed' ? 'warn' : ''}">${esc(statusText[g.release_status] || statusText.unknown)}</span>
  </button>`;
}

function releaseSection(title, subtitle, rows, total = null) {
  return `<section class="release-section panel"><div class="section-head"><div><h2>${title}</h2><p>${subtitle}</p></div><span class="release-count">${(total ?? rows.length).toLocaleString()} 款 / games</span></div><div class="release-list">${rows.map(releaseItem).join('') || '<div class="empty">目前沒有資料 / No data yet</div>'}</div></section>`;
}

async function enhanceCalendar() {
  if (location.hash.replace(/^#/,'') !== 'calendar' || calendarLoading) return;
  const page = document.querySelector('#page');
  if (!page || page.dataset.fullCalendar === '1') return;
  calendarLoading = true;
  try {
    const now = new Date();
    const future = new Date(now.getTime() + 3*365*86400000).toISOString();
    const recent = new Date(now.getTime() - 180*86400000).toISOString();
    const nowIso = now.toISOString();
    const [upcomingQ, recentQ, announcedQ, tbaQ, tbaCountQ, datedCountQ] = await Promise.all([
      supabase.from('games').select('id,slug,name_en,name_zh_hant,cover_url,release_status,release_date').gte('release_date',nowIso).lte('release_date',future).order('release_date',{ascending:true}).limit(300),
      supabase.from('games').select('id,slug,name_en,name_zh_hant,cover_url,release_status,release_date').gte('release_date',recent).lt('release_date',nowIso).order('release_date',{ascending:false}).limit(200),
      supabase.from('games').select('id,slug,name_en,name_zh_hant,cover_url,release_status,release_date,updated_at').is('release_date',null).in('release_status',['announced','preorder','delayed','early_access']).order('updated_at',{ascending:false}).limit(250),
      supabase.from('games').select('id,slug,name_en,name_zh_hant,cover_url,release_status,release_date,updated_at').is('release_date',null).order('updated_at',{ascending:false}).limit(250),
      supabase.from('games').select('id',{count:'exact',head:true}).is('release_date',null),
      supabase.from('games').select('id',{count:'exact',head:true}).not('release_date','is',null)
    ]);
    if ([upcomingQ,recentQ,announcedQ,tbaQ].some(q=>q.error)) throw new Error('上市資料讀取失敗');
    const announced = announcedQ.data || [];
    const announcedIds = new Set(announced.map(g=>g.id));
    const otherTba = (tbaQ.data || []).filter(g=>!announcedIds.has(g.id));
    page.innerHTML = `<section class="hero"><div><div class="eyebrow">RELEASE INTELLIGENCE · 上市情報</div><h1>上市名單 / Release Calendar</h1><p>完整保留有日期與日期待定遊戲。即將上市、近期上市、已公布 TBA 與其他 TBA 分開顯示。</p></div><div class="sync-card"><strong>${(datedCountQ.count||0).toLocaleString()} 有日期 / dated</strong><span>${(tbaCountQ.count||0).toLocaleString()} 日期待定 / TBA</span></div></section>
      <div class="calendar-summary"><span>未來 3 年 / Next 3 years</span><span>近期 180 天 / Last 180 days</span><span>TBA 不再隱藏 / TBA included</span></div>
      ${releaseSection('即將上市 / Upcoming','未來三年已有明確上市日期 / Confirmed dates in the next 3 years', upcomingQ.data||[])}
      ${releaseSection('近期上市 / Recently Released','過去 180 天已上市 / Released in the last 180 days', recentQ.data||[])}
      ${releaseSection('已公布・日期待定 / Announced TBA','已公布、預購、延期或搶先體驗，但尚無確切日期 / Announced without a confirmed date', announced, announced.length)}
      ${releaseSection('其他日期待定 / Other TBA','目前資料源尚未提供確切日期；顯示最近更新的項目 / Recently updated titles without a confirmed date', otherTba, tbaCountQ.count||otherTba.length)}
      <div class="footer">上市資料會隨 Steam 與後續跨平台來源持續補齊 / Release data continues to improve as sources sync.</div>`;
    page.dataset.fullCalendar = '1';
    document.querySelectorAll('.release-card.open-game').forEach(b=>b.onclick=()=>{location.hash=`game/${b.dataset.slug}`});
    addBackButton();
  } catch (error) {
    console.warn('[Game Intel] calendar enhancement failed', error);
  } finally {
    calendarLoading = false;
  }
}

async function decorate() {
  addBackButton();
  await decorateCards();
  await decorateDetail();
  addAttribution();
  /* Calendar is rendered natively by app.js so release categories, search and pagination remain intact. */
}

async function loadMetadata() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  loaded = true;
  decorate();
}

const observer = new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(() => { if (loaded) decorate(); }, 90);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('hashchange', () => {
  const next = location.hash || '#dashboard';
  if (currentHash !== next) sessionStorage.setItem('game-intel-prev-hash', currentHash);
  currentHash = next;
  setTimeout(() => { if (loaded) decorate(); }, 120);
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) setTimeout(loadMetadata, 250);
});
setTimeout(loadMetadata, 500);
