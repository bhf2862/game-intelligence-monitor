import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = 'https://ehyivgyprxiyhldxrzpx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tukBY1endjNBJdVFoSBHbA__pHOPGGx';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let gamesBySlug = new Map();
let linksByGame = new Map();
let timer = null;
let priceRendering = false;

const editionZh = {
  Standard: '標準版',
  Deluxe: '豪華版',
  Ultimate: '終極版',
  Collector: '典藏版',
  "Collector's Edition": '典藏版',
  DLC: '下載內容',
  Bundle: '組合包',
  'Season Pass': '季票',
  Upgrade: '升級包'
};

const platformZh = {
  Steam: 'Steam / PC',
  PC: '電腦 / PC',
  'PC (Windows)': 'Windows 電腦 / PC',
  PlayStation: 'PlayStation',
  PS5: 'PlayStation 5 / PS5',
  PS4: 'PlayStation 4 / PS4',
  Xbox: 'Xbox',
  'Xbox Series': 'Xbox Series X|S',
  Nintendo: '任天堂 / Nintendo',
  'Nintendo Switch': 'Nintendo Switch',
  'Nintendo Switch 2': 'Nintendo Switch 2',
  Epic: 'Epic Games'
};

function safeUrl(url) {
  try {
    const u = new URL(url);
    return ['https:', 'http:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[c]));
}

function money(v, c='TWD') {
  if (v == null) return '—';
  if (Number(v) === 0) return '免費 / Free';
  return c === 'TWD'
    ? `NT$${Number(v).toLocaleString()}`
    : `${escapeHtml(c)} ${Number(v).toLocaleString()}`;
}

function storeIcon(store='') {
  const s = String(store).toLowerCase();
  if (s.includes('steam')) return '◉';
  if (s.includes('playstation') || s === 'ps5' || s === 'ps4') return 'PS';
  if (s.includes('xbox') || s.includes('microsoft')) return 'X';
  if (s.includes('nintendo') || s.includes('switch')) return 'N';
  if (s.includes('epic')) return 'E';
  return '▣';
}

function editionLabel(value) {
  const e = String(value || 'Standard');
  return `${editionZh[e] || '版本'} / ${e}`;
}

function platformLabel(value) {
  const p = String(value || '');
  return platformZh[p] || p || '平台待同步 / Platform pending';
}

function gamePrimaryName(game) {
  return game?.name_zh_hant || game?.name_en || 'Unknown';
}

function gameSecondaryName(game) {
  if (!game) return '';
  return game.name_zh_hant
    ? game.name_en
    : '暫無官方繁體中文名稱 / No official Traditional Chinese title';
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

async function ensureMetadataForSlugs(slugs) {
  const unique = [...new Set(slugs.filter(Boolean))].filter(s => !gamesBySlug.has(s));
  if (!unique.length) return;

  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80);
    const { data: games, error } = await supabase
      .from('games')
      .select('id,slug,name_en,name_zh_hant,cover_url,developer,publisher,release_date')
      .in('slug', chunk);
    if (error || !games?.length) continue;

    for (const g of games) gamesBySlug.set(g.slug, g);

    const ids = games.map(g => g.id);
    const { data: links } = await supabase
      .from('official_links')
      .select('game_id,label,url,tier,link_type')
      .in('game_id', ids)
      .limit(1000);

    for (const link of links || []) {
      const key = String(link.game_id);
      const list = linksByGame.get(key) || [];
      if (!list.some(x => x.url === link.url)) list.push(link);
      list.sort((a, b) => {
        const ao = a.tier === 'official' ? 0 : 1;
        const bo = b.tier === 'official' ? 0 : 1;
        return ao - bo;
      });
      linksByGame.set(key, list);
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

  for (const link of links.slice(0, 2)) {
    const href = safeUrl(link.url);
    if (!href) continue;
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = `source-chip ${link.tier === 'official' ? 'official-source' : 'third-party-source'}`;
    a.textContent = link.tier === 'official'
      ? '官方 / Official'
      : `${link.label || '第三方來源'} / Third-party`;
    row.appendChild(a);
  }

  const actions = card.querySelector('.card-actions');
  if (actions) card.insertBefore(row, actions);
  else card.appendChild(row);
}

function decorateGameName(card, game) {
  if (!card || !game) return;
  const h3 = card.querySelector('h3');
  const en = card.querySelector('.en');
  if (h3) h3.textContent = gamePrimaryName(game);
  if (en) en.textContent = gameSecondaryName(game);
}

async function decorateCards() {
  const cards = [...document.querySelectorAll('.game-card[data-game]')];
  if (!cards.length) return;
  await ensureMetadataForSlugs(cards.map(c => c.dataset.game));
  for (const card of cards) {
    const game = gamesBySlug.get(card.dataset.game);
    if (!game) continue;
    addImage(card.querySelector('.cover'), game.cover_url, gamePrimaryName(game));
    decorateGameName(card, game);
    renderSourceLinks(card, game);

    card.querySelectorAll('.tag').forEach(tag => {
      const text = tag.textContent?.trim();
      if (text && platformZh[text]) tag.textContent = platformZh[text];
    });

    const liveLabel = [...card.querySelectorAll('.game-stats small')]
      .find(x => x.textContent?.trim() === 'Live');
    if (liveLabel) liveLabel.textContent = '直播 / Live';
  }
}

async function decorateDetail() {
  const hash = location.hash.replace(/^#/, '');
  if (!hash.startsWith('game/')) return;
  const slug = hash.split('/')[1];
  await ensureMetadataForSlugs([slug]);
  const game = gamesBySlug.get(slug);
  if (!game) return;

  addImage(document.querySelector('.detail-cover'), game.cover_url, gamePrimaryName(game));

  const hero = document.querySelector('.detail-hero');
  if (hero) {
    const h2 = hero.querySelector('h2');
    const p = hero.querySelector('p');
    if (h2) h2.textContent = gamePrimaryName(game);
    if (p) {
      p.textContent = `${gameSecondaryName(game)} · 開發商 / Developer: ${game.developer || '待同步 / Pending'} · 發行商 / Publisher: ${game.publisher || '待同步 / Pending'}`;
    }
  }

  const panels = [...document.querySelectorAll('.detail-grid .panel')];
  for (const panel of panels) {
    const h2 = panel.querySelector('.section-head h2');
    const title = h2?.textContent?.trim();
    const p = panel.querySelector('.section-head p');
    if (title === '官方連結' || title === '連結與資料來源') {
      h2.textContent = '連結與資料來源 / Links & Sources';
      if (p) p.textContent = '官方與已標示第三方來源 / Official & labeled third-party';
    } else if (title === '平台與價格') {
      h2.textContent = '平台與價格 / Platforms & Prices';
      if (p) p.textContent = '台灣 / TW · 新台幣 / NTD';
    } else if (title === '平台支援') {
      h2.textContent = '平台支援 / Platform Support';
    } else if (title === '玩家主要問題') {
      h2.textContent = '玩家主要問題 / Top Player Issues';
    }
  }

  for (const el of document.querySelectorAll('.metric span')) {
    const t = el.textContent?.trim();
    if (t === '玩家評價') el.textContent = '玩家評價 / Reviews';
    if (t === '直播觀看') el.textContent = '直播觀看 / Live Viewers';
    if (t === '未解決問題') el.textContent = '未解決問題 / Open Issues';
    if (t === '官方連結' || t === '來源／連結') el.textContent = '來源／連結 / Sources & Links';
  }
}

async function renderEnhancedPrices() {
  if (location.hash.replace(/^#/, '').split('/')[0] !== 'prices') return;
  const page = document.querySelector('#page');
  if (!page || page.dataset.priceEnhanced === '1' || priceRendering) return;
  priceRendering = true;

  try {
    const { data: products, error } = await supabase
      .from('store_products')
      .select('id,game_id,platform,store,edition,region,currency,list_price,current_price,discount_percent,is_free,is_preorder,store_url,updated_at,games!inner(slug,name_en,name_zh_hant,cover_url)')
      .eq('region', 'TW')
      .order('discount_percent', { ascending: false })
      .limit(500);
    if (error) return;

    const ids = (products || []).map(x => x.id);
    const { data: history } = ids.length
      ? await supabase.from('price_history').select('product_id,price,captured_at').in('product_id', ids).limit(5000)
      : { data: [] };

    const lows = new Map();
    for (const h of history || []) {
      const k = String(h.product_id);
      const v = Number(h.price);
      if (!lows.has(k) || v < lows.get(k)) lows.set(k, v);
    }

    const updated = (products || [])
      .map(x => x.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1);

    page.innerHTML = `
      <section class="hero price-hero">
        <div>
          <div class="eyebrow">PRICE INTELLIGENCE · TW / NTD</div>
          <h1>價格追蹤 / Price Tracker</h1>
          <p>遊戲封面、平台、商店、版本、折扣與歷史低價集中比較。中文主顯示，英文保留於輔助資訊。</p>
        </div>
        <div class="sync-card">
          <strong>${(products || []).length.toLocaleString()} 筆價格 / Price records</strong>
          <span>最近更新 / Last update: ${updated ? new Date(updated).toLocaleString('zh-TW') : '待同步 / Pending'}</span>
        </div>
      </section>
      <section class="price-cards">
        ${(products || []).map(x => {
          const g = x.games || {};
          const cover = safeUrl(g.cover_url);
          const low = lows.get(String(x.id));
          const isLow = low != null && x.current_price != null && Number(x.current_price) <= Number(low);
          return `
            <article class="price-card">
              <div class="price-cover ${cover ? 'has-image' : ''}">
                ${cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(gamePrimaryName(g))}" loading="lazy" referrerpolicy="no-referrer">` : '<span>GAME</span>'}
              </div>
              <div class="price-game">
                <strong>${escapeHtml(gamePrimaryName(g))}</strong>
                <span>${escapeHtml(gameSecondaryName(g))}</span>
                <div class="price-labels">
                  <span class="store-badge"><i>${escapeHtml(storeIcon(x.store || x.platform))}</i>${escapeHtml(x.store || x.platform)}</span>
                  <span class="tag">${escapeHtml(platformLabel(x.platform))}</span>
                  <span class="tag">${escapeHtml(editionLabel(x.edition))}</span>
                  ${x.is_preorder ? '<span class="badge warn">預購 / Pre-order</span>' : ''}
                  ${x.is_free ? '<span class="badge ok">免費 / Free</span>' : ''}
                </div>
              </div>
              <div class="price-value"><small>原價 / List</small><span>${money(x.list_price, x.currency)}</span></div>
              <div class="price-value current"><small>現價 / Current</small><b>${money(x.current_price, x.currency)}</b>${Number(x.discount_percent) > 0 ? `<span class="badge ok">-${Number(x.discount_percent)}%</span>` : ''}</div>
              <div class="price-value"><small>歷史低價 / Historical Low</small><b>${low != null ? money(low, x.currency) : '—'}</b>${isLow ? '<span class="badge ok">目前最低 / At low</span>' : ''}</div>
              <div class="price-open">${safeUrl(x.store_url) ? `<a class="btn primary" href="${escapeHtml(x.store_url)}" target="_blank" rel="noopener noreferrer">前往商店 / Store ↗</a>` : '<span class="sub">連結待同步 / Link pending</span>'}</div>
            </article>`;
        }).join('') || '<div class="empty">價格資料正在同步 / Price data is syncing.</div>'}
      </section>`;

    page.dataset.priceEnhanced = '1';
  } finally {
    priceRendering = false;
  }
}

function bilingualizeStaticText() {
  const replacements = new Map([
    ['全部遊戲 / Games', '全部遊戲 / Games'],
    ['上市日曆 / Calendar', '上市日曆 / Release Calendar'],
    ['價格追蹤 / Price Tracker', '價格追蹤 / Price Tracker'],
    ['玩家問題 / Issues', '玩家問題 / Player Issues'],
    ['直播熱度 / Live Trends', '直播熱度 / Live Trends'],
    ['重大變化 / Changes', '重大變化 / Major Changes'],
    ['我的收藏 / Watchlist', '我的收藏 / Watchlist'],
    ['設定 / Settings', '設定 / Settings']
  ]);

  document.querySelectorAll('.hero h1').forEach(el => {
    const t = el.textContent?.trim();
    if (replacements.has(t)) el.textContent = replacements.get(t);
  });

  document.querySelectorAll('.badge').forEach(el => {
    const t = el.textContent?.trim();
    if (t === '已上市') el.textContent = '已上市 / Released';
    if (t === '預購中') el.textContent = '預購中 / Pre-order';
    if (t === '已公布') el.textContent = '已公布 / Announced';
    if (t === '延期') el.textContent = '延期 / Delayed';
    if (t === '搶先體驗') el.textContent = '搶先體驗 / Early Access';
    if (t === '追蹤中') el.textContent = '追蹤中 / Tracking';
  });
}

function addAttribution() {
  if (document.querySelector('.data-attribution')) return;
  const footer = document.querySelector('.footer');
  if (!footer) return;
  const div = document.createElement('div');
  div.className = 'data-attribution';
  div.innerHTML = '資料來源 / Data source：部分免費遊戲資料由 <a href="https://www.freetogame.com/" target="_blank" rel="noopener noreferrer">FreeToGame</a> 提供；Steam 資料以官方商店來源優先。';
  footer.appendChild(div);
}

async function decorate() {
  await decorateCards();
  await decorateDetail();
  bilingualizeStaticText();
  addAttribution();
  await renderEnhancedPrices();
}

const observer = new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(() => decorate().catch(() => {}), 100);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('hashchange', () => {
  setTimeout(() => {
    const page = document.querySelector('#page');
    if (page) delete page.dataset.priceEnhanced;
    decorate().catch(() => {});
  }, 180);
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) setTimeout(() => decorate().catch(() => {}), 300);
});

setTimeout(() => decorate().catch(() => {}), 650);
