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

function safeUrl(url) {
  try {
    const u = new URL(url);
    return ['https:', 'http:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function addImage(container, url, alt) {
  if (!container || !url || container.dataset.imageApplied === '1') return;
  const src = safeUrl(url);
  if (!src) return;
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || 'Game cover';
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

function renderSourceLinks(card, game) {
  if (!card || card.querySelector('.card-source-row')) return;
  const links = linksByGame.get(String(game.id)) || [];
  if (!links.length) return;

  const row = document.createElement('div');
  row.className = 'card-source-row';
  const label = document.createElement('span');
  label.textContent = '來源';
  row.appendChild(label);

  for (const link of links.slice(0, 2)) {
    const href = safeUrl(link.url);
    if (!href) continue;
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = `source-chip ${link.tier === 'official' ? 'official-source' : 'third-party-source'}`;
    a.textContent = link.tier === 'official' ? '官方' : (link.label || '第三方來源');
    row.appendChild(a);
  }

  const actions = card.querySelector('.card-actions');
  if (actions) card.insertBefore(row, actions);
  else card.appendChild(row);
}

function decorateCards() {
  document.querySelectorAll('.game-card[data-game]').forEach(card => {
    const slug = card.dataset.game;
    const game = gamesBySlug.get(slug);
    if (!game) return;
    addImage(card.querySelector('.cover'), game.cover_url, game.name_zh_hant || game.name_en);
    renderSourceLinks(card, game);
  });
}

function decorateDetail() {
  const hash = location.hash.replace(/^#/, '');
  if (!hash.startsWith('game/')) return;
  const slug = hash.split('/')[1];
  const game = gamesBySlug.get(slug);
  if (!game) return;

  addImage(document.querySelector('.detail-cover'), game.cover_url, game.name_zh_hant || game.name_en);

  const panels = [...document.querySelectorAll('.detail-grid .panel')];
  for (const panel of panels) {
    const h2 = panel.querySelector('.section-head h2');
    if (h2?.textContent?.trim() === '官方連結') {
      h2.textContent = '連結與資料來源';
      const p = panel.querySelector('.section-head p');
      if (p) p.textContent = 'Official / Verified third-party';
    }
  }

  const metricLabels = [...document.querySelectorAll('.metric span')];
  const officialMetric = metricLabels.find(x => x.textContent?.trim() === '官方連結');
  if (officialMetric) officialMetric.textContent = '來源／連結';
}

function addAttribution() {
  if (document.querySelector('.data-attribution')) return;
  const footer = document.querySelector('.footer');
  if (!footer) return;
  const div = document.createElement('div');
  div.className = 'data-attribution';
  div.innerHTML = '部分免費遊戲資料由 <a href="https://www.freetogame.com/" target="_blank" rel="noopener noreferrer">FreeToGame</a> 提供。';
  footer.appendChild(div);
}

function decorate() {
  if (!loaded) return;
  decorateCards();
  decorateDetail();
  addAttribution();
}

async function loadMetadata() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const [{ data: games, error: ge }, { data: links, error: le }] = await Promise.all([
    supabase.from('games').select('id,slug,name_en,name_zh_hant,cover_url').limit(1000),
    supabase.from('official_links').select('game_id,label,url,tier,link_type').limit(2500)
  ]);
  if (ge || le) return;

  gamesBySlug = new Map((games || []).map(g => [g.slug, g]));
  linksByGame = new Map();
  for (const link of links || []) {
    const key = String(link.game_id);
    const list = linksByGame.get(key) || [];
    list.push(link);
    list.sort((a, b) => (a.tier === 'official' ? -1 : 1) - (b.tier === 'official' ? -1 : 1));
    linksByGame.set(key, list);
  }
  loaded = true;
  decorate();
}

const observer = new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(decorate, 80);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', () => setTimeout(decorate, 100));
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) setTimeout(loadMetadata, 250);
});
setTimeout(loadMetadata, 500);
