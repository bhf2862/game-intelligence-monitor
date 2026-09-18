import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = 'https://ehyivgyprxiyhldxrzpx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tukBY1endjNBJdVFoSBHbA__pHOPGGx';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const app = document.querySelector('#app');
const state = { session:null, allowed:false, lang:localStorage.getItem('game-intel-lang') || 'zh', search:'', page:0, pageSize:36, gameFilter:'released', releaseFilter:localStorage.getItem('game-intel-release-filter') || 'unreleased', releasePage:0 };
const fmtDate = (v, withTime=false) => v ? new Intl.DateTimeFormat('zh-TW', withTime ? {dateStyle:'medium',timeStyle:'short'} : {year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)) : 'TBA';
const money = (v, c='TWD') => v == null ? '—' : Number(v) === 0 ? '免費' : c === 'TWD' ? `NT$${Number(v).toLocaleString()}` : `${c} ${Number(v).toLocaleString()}`;
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const initials = name => (name || 'GI').trim().slice(0,2).toUpperCase();
const statusZh = s => ({released:'已上市',preorder:'預購中',announced:'已公布',delayed:'延期',early_access:'搶先體驗',cancelled:'取消',unknown:'追蹤中'})[s] || s || '追蹤中';
const statusClass = s => s === 'released' ? 'ok' : s === 'delayed' || s === 'preorder' ? 'warn' : '';
const eventZh = t => ({GAME_ANNOUNCED:'新遊戲公布',STORE_LISTED:'商店上架',PREORDER_OPEN:'預購開放',RELEASE_DATE_CHANGED:'上市日期異動',RELEASE_DELAYED:'延期',RELEASED:'正式上市',PRICE_CHANGED:'價格異動',DISCOUNT_STARTED:'折扣開始',HISTORICAL_LOW:'歷史低價',TARGET_PRICE_REACHED:'目標價達成',REVIEW_DROP:'評價下降',ISSUE_SPIKE:'問題暴增',STREAM_SPIKE:'直播暴增',STREAM_DROP:'直播下降',PLATFORM_ADDED:'新增平台',LANGUAGE_ADDED:'新增語言'})[t] || t;


const gameFilters=[
  {id:'all',icon:'🎮',zh:'全部',en:'All'},
  {id:'upcoming',icon:'📅',zh:'即將上市',en:'Upcoming'},
  {id:'released',icon:'✓',zh:'已上市',en:'Released'},
  {id:'preorder',icon:'🛒',zh:'預購中',en:'Pre-order'},
  {id:'announced',icon:'📣',zh:'已公布',en:'Announced'},
  {id:'early_access',icon:'⚡',zh:'搶先體驗',en:'Early Access'},
  {id:'delayed',icon:'⏳',zh:'延期',en:'Delayed'},
  {id:'tba',icon:'?',zh:'日期待定',en:'TBA'},
  {id:'cancelled',icon:'×',zh:'已取消',en:'Cancelled'}
];
const gameFilterInfo=id=>gameFilters.find(x=>x.id===id)||gameFilters[0];
function applyGameFilter(q,id){
  const now=new Date().toISOString();
  if(id==='upcoming') return q.gte('release_date',now).neq('release_status','released').neq('release_status','cancelled');
  if(id==='tba') return q.is('release_date',null);
  if(['released','preorder','announced','early_access','delayed','cancelled'].includes(id)) return q.eq('release_status',id);
  return q;
}
function applyGameSort(q,id){
  if(id==='upcoming') return q.order('release_date',{ascending:true,nullsFirst:false});
  if(id==='tba'||id==='announced'||id==='preorder'||id==='delayed') return q.order('updated_at',{ascending:false,nullsFirst:false});
  return q.order('release_date',{ascending:false,nullsFirst:false});
}
async function loadGameFilterCounts(){
  const now=new Date().toISOString();
  const queries={
    all:supabase.from('games').select('id',{count:'exact',head:true}),
    released:supabase.from('games').select('id',{count:'exact',head:true}).eq('release_status','released'),
    cancelled:supabase.from('games').select('id',{count:'exact',head:true}).eq('release_status','cancelled'),
    preorder:supabase.from('games').select('id',{count:'exact',head:true}).eq('release_status','preorder'),
    delayed:supabase.from('games').select('id',{count:'exact',head:true}).eq('release_status','delayed'),
    early_access:supabase.from('games').select('id',{count:'exact',head:true}).eq('release_status','early_access'),
    upcoming:supabase.from('games').select('id',{count:'exact',head:true})
      .gte('release_date',now)
      .neq('release_status','preorder')
      .neq('release_status','delayed')
      .neq('release_status','early_access')
      .neq('release_status','released')
      .neq('release_status','cancelled'),
    announced:supabase.from('games').select('id',{count:'exact',head:true})
      .eq('release_status','announced')
      .or(`release_date.is.null,release_date.lt.${now}`),
    tba:supabase.from('games').select('id',{count:'exact',head:true})
      .eq('release_status','unknown')
      .or(`release_date.is.null,release_date.lt.${now}`)
  };
  const entries=await Promise.all(Object.entries(queries).map(async([id,p])=>{
    const r=await p;
    if(r.error) throw r.error;
    return[id,r.count||0];
  }));
  return Object.fromEntries(entries);
}
function renderGameFilterTabs(counts){
  return `<div class="game-filter-tabs" role="tablist" aria-label="遊戲分類 / Game categories">${gameFilters.map(f=>`<button class="game-filter-tab ${state.gameFilter===f.id?'active':''}" data-game-filter="${f.id}" role="tab" aria-selected="${state.gameFilter===f.id?'true':'false'}"><span class="game-filter-icon">${f.icon}</span><span class="game-filter-name">${f.zh}<small>${f.en}</small></span><b>${Number(counts?.[f.id]||0).toLocaleString()}</b></button>`).join('')}</div>`;
}


const releaseFilters=[
  {id:'unreleased',icon:'◷',zh:'全部未上市',en:'All Unreleased'},
  {id:'preorder',icon:'🛒',zh:'預購中',en:'Pre-order'},
  {id:'delayed',icon:'⏳',zh:'延期',en:'Delayed'},
  {id:'early_access',icon:'⚡',zh:'搶先體驗',en:'Early Access'},
  {id:'upcoming',icon:'📅',zh:'即將上市',en:'Upcoming'},
  {id:'announced',icon:'📣',zh:'已公布',en:'Announced'},
  {id:'tba',icon:'?',zh:'日期待定',en:'TBA'}
];
const releaseFilterInfo=id=>releaseFilters.find(x=>x.id===id)||releaseFilters[0];
function applyReleaseFilter(q,id){
  const now=new Date().toISOString();
  if(id==='preorder') return q.eq('release_status','preorder');
  if(id==='delayed') return q.eq('release_status','delayed');
  if(id==='early_access') return q.eq('release_status','early_access');
  if(id==='upcoming') return q.gte('release_date',now)
    .neq('release_status','preorder')
    .neq('release_status','delayed')
    .neq('release_status','early_access')
    .neq('release_status','released')
    .neq('release_status','cancelled');
  if(id==='announced') return q.eq('release_status','announced')
    .or(`release_date.is.null,release_date.lt.${now}`);
  if(id==='tba') return q.eq('release_status','unknown')
    .or(`release_date.is.null,release_date.lt.${now}`);
  return q.neq('release_status','released').neq('release_status','cancelled');
}
function applyReleaseSort(q,id){
  if(id==='upcoming') return q.order('release_date',{ascending:true,nullsFirst:false});
  return q.order('updated_at',{ascending:false,nullsFirst:false});
}
async function loadReleaseCounts(){
  const now=new Date().toISOString();
  const queries={
    unreleased:supabase.from('games').select('id',{count:'exact',head:true})
      .neq('release_status','released').neq('release_status','cancelled'),
    preorder:supabase.from('games').select('id',{count:'exact',head:true})
      .eq('release_status','preorder'),
    delayed:supabase.from('games').select('id',{count:'exact',head:true})
      .eq('release_status','delayed'),
    early_access:supabase.from('games').select('id',{count:'exact',head:true})
      .eq('release_status','early_access'),
    upcoming:supabase.from('games').select('id',{count:'exact',head:true})
      .gte('release_date',now)
      .neq('release_status','preorder')
      .neq('release_status','delayed')
      .neq('release_status','early_access')
      .neq('release_status','released')
      .neq('release_status','cancelled'),
    announced:supabase.from('games').select('id',{count:'exact',head:true})
      .eq('release_status','announced')
      .or(`release_date.is.null,release_date.lt.${now}`),
    tba:supabase.from('games').select('id',{count:'exact',head:true})
      .eq('release_status','unknown')
      .or(`release_date.is.null,release_date.lt.${now}`)
  };
  const entries=await Promise.all(Object.entries(queries).map(async([id,p])=>{
    const r=await p;
    if(r.error) throw r.error;
    return[id,r.count||0];
  }));
  return Object.fromEntries(entries);
}
function renderReleaseFilterTabs(counts){
  return `<div class="game-filter-tabs release-filter-tabs" role="tablist" aria-label="上市情報分類 / Release categories">${releaseFilters.map(f=>`<button class="game-filter-tab ${state.releaseFilter===f.id?'active':''}" data-release-filter="${f.id}" role="tab" aria-selected="${state.releaseFilter===f.id?'true':'false'}"><span class="game-filter-icon">${f.icon}</span><span class="game-filter-name">${f.zh}<small>${f.en}</small></span><b>${Number(counts?.[f.id]||0).toLocaleString()}</b></button>`).join('')}</div>`;
}

function toast(msg, error=false){
  document.querySelector('.toast')?.remove();
  const el=document.createElement('div');el.className=`toast${error?' error':''}`;el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),3500);
}

async function init(){
  const {data:{session}}=await supabase.auth.getSession();
  state.session=session;
  if(session) state.allowed=await checkAllowed();
  supabase.auth.onAuthStateChange(async (_event,session)=>{state.session=session;state.allowed=session?await checkAllowed():false;render();});
  render();
}
async function checkAllowed(){
  const {data,error}=await supabase.from('allowed_users').select('email').limit(1);
  return !error && Array.isArray(data) && data.length>0;
}

function render(){
  if(!state.session) return renderAuth();
  if(!state.allowed) return renderDenied();
  renderShell();
}
function renderAuth(){
  app.innerHTML=`<div class="auth-page"><div class="auth-card"><div class="auth-logo">GI</div><h1>Game Intelligence</h1><p>私人遊戲情報監控台。登入後查看上市、價格、評價、玩家問題與直播熱度。</p><form id="auth-form" class="auth-form"><label>Email<input id="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label>Password<input id="password" type="password" autocomplete="current-password" required minlength="8" placeholder="••••••••"></label><div id="auth-message" class="auth-message">請使用已授權的帳號登入。</div><div class="auth-actions"><button class="btn primary" type="submit">登入 Sign in</button><button class="btn" type="button" id="signup">建立帳號 Sign up</button></div></form></div></div>`;
  const form=document.querySelector('#auth-form'),msg=document.querySelector('#auth-message');
  form.addEventListener('submit',async e=>{e.preventDefault();msg.className='auth-message';msg.textContent='登入中…';const email=document.querySelector('#email').value.trim(),password=document.querySelector('#password').value;const {error}=await supabase.auth.signInWithPassword({email,password});if(error){msg.className='auth-message error';msg.textContent=error.message;}});
  document.querySelector('#signup').addEventListener('click',async()=>{const email=document.querySelector('#email').value.trim(),password=document.querySelector('#password').value;if(!email||password.length<8){msg.className='auth-message error';msg.textContent='請輸入 Email 與至少 8 碼密碼。';return;}msg.className='auth-message';msg.textContent='建立帳號中…';const {data,error}=await supabase.auth.signUp({email,password});if(error){msg.className='auth-message error';msg.textContent=error.message;}else if(!data.session){msg.className='auth-message ok';msg.textContent='帳號已建立，請至信箱完成驗證後再登入。';}});
}
function renderDenied(){
  app.innerHTML=`<div class="auth-page"><div class="auth-card"><div class="auth-logo">!</div><h1>未授權 / Access denied</h1><p>這個帳號已登入，但不在此私人監控站的允許清單內。</p><div class="auth-message error">${esc(state.session?.user?.email)}</div><button class="btn danger" id="logout" style="width:100%;margin-top:12px">登出</button></div></div>`;
  document.querySelector('#logout').onclick=()=>supabase.auth.signOut();
}

const navItems=[['dashboard','◈','總覽','Dashboard'],['games','🎮','已上市遊戲','Released Games'],['calendar','◷','上市情報','Upcoming'],['prices','＄','價格','Prices'],['issues','⚠','玩家問題','Issues'],['live','◉','直播','Live'],['changes','↯','重大變化','Changes'],['watchlist','★','收藏','Watchlist'],['settings','⚙','設定','Settings']];
function route(){const h=location.hash.replace(/^#/,'')||'dashboard';const [name,arg]=h.split('/');return{name,arg};}
function renderShell(){
  const r=route();
  app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><div class="brand-icon">GI</div><div><strong>Game Intel</strong><small>遊戲情報監控</small></div></div><nav class="nav">${navItems.map(([id,icon,zh,en])=>`<button data-route="${id}" class="${r.name===id?'active':''}"><i class="icon">${icon}</i><span>${state.lang==='zh'?zh:en}</span></button>`).join('')}</nav><div class="sidebar-foot"><div class="health"><i class="dot"></i><span class="detail">Supabase connected</span></div><div class="detail">TW · NTD · UTC+8</div></div></aside><main class="main"><header class="topbar"><div class="search"><input id="global-search" placeholder="搜尋中文 / English 遊戲名稱" value="${esc(state.search)}"></div><div class="top-actions"><button class="btn ghost" id="lang">🌐 <span>${state.lang==='zh'?'繁中':'EN'}</span></button><span class="user-pill">${esc(state.session.user.email)}</span><button class="btn ghost" id="logout">登出</button></div></header><div id="page"><div class="empty">讀取資料中…</div></div></main></div>`;
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{location.hash=b.dataset.route});
  document.querySelector('#lang').onclick=()=>{state.lang=state.lang==='zh'?'en':'zh';localStorage.setItem('game-intel-lang',state.lang);renderShell();};
  document.querySelector('#logout').onclick=()=>supabase.auth.signOut();
  const gs=document.querySelector('#global-search');let t;gs.addEventListener('input',e=>{state.search=e.target.value;clearTimeout(t);t=setTimeout(()=>{state.page=0;location.hash='games';loadRoute();},350)});
  loadRoute();
}
window.addEventListener('hashchange',()=>state.session&&state.allowed&&renderShell());

async function loadRoute(){
  const r=route();
  const loader={dashboard:pageDashboard,games:pageGames,calendar:pageCalendar,prices:pagePrices,issues:pageIssues,live:pageLive,changes:pageChanges,watchlist:pageWatchlist,settings:pageSettings,game:()=>pageGame(r.arg)}[r.name]||pageDashboard;
  try{await loader();}catch(e){console.error(e);document.querySelector('#page').innerHTML=`<div class="empty">讀取失敗：${esc(e.message)}</div>`;}
}
const pageEl=()=>document.querySelector('#page');
function header(title,subtitle){return `<section class="hero"><div><div class="eyebrow">GAME INTELLIGENCE · LIVE DATABASE</div><h1>${title}</h1><p>${subtitle}</p></div><div class="sync-card"><strong>官方來源優先</strong><span>最後畫面更新 ${new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</span></div></section>`;}

async function latestPerGame(table,fields='*',limit=500){const {data,error}=await supabase.from(table).select(fields).order('captured_at',{ascending:false}).limit(limit);if(error)throw error;const map=new Map();for(const row of data||[])if(!map.has(String(row.game_id)))map.set(String(row.game_id),row);return map;}
async function hydrateGames(games){
  const ids=games.map(g=>g.id);if(!ids.length)return games;
  const [pl,pr,rv,is,st]=await Promise.all([
    supabase.from('game_platforms').select('*').in('game_id',ids),supabase.from('store_products').select('*').in('game_id',ids).eq('region','TW'),supabase.from('review_snapshots').select('*').in('game_id',ids).order('captured_at',{ascending:false}),supabase.from('game_issues').select('*').in('game_id',ids).eq('resolved',false).order('mention_count_24h',{ascending:false}),supabase.from('streaming_snapshots').select('*').in('game_id',ids).order('captured_at',{ascending:false})
  ]);
  return games.map(g=>{const gid=String(g.id);const products=(pr.data||[]).filter(x=>String(x.game_id)===gid).sort((a,b)=>(a.current_price??1e15)-(b.current_price??1e15));return{...g,platforms:(pl.data||[]).filter(x=>String(x.game_id)===gid),price:products[0]||null,review:(rv.data||[]).find(x=>String(x.game_id)===gid)||null,issue:(is.data||[]).find(x=>String(x.game_id)===gid)||null,live:(st.data||[]).find(x=>String(x.game_id)===gid)||null};});
}

function gameCoverInner(g){
  const title=g?.name_zh_hant||g?.name_en||'Game';
  const fallback=esc(initials(g?.name_en||title));
  const src=g?.cover_url?esc(g.cover_url):'';
  return `${src?`<img class="native-cover-img" data-cover-img src="${src}" alt="${esc(title)}" loading="lazy" decoding="async">`:''}<span class="cover-fallback">${fallback}</span>`;
}
function closeGamePreview(){
  document.querySelector('.game-preview-backdrop')?.remove();
}
async function showGamePreview(slug){
  if(!slug)return;
  closeGamePreview();
  const shell=document.createElement('div');
  shell.className='game-preview-backdrop';
  shell.innerHTML='<div class="game-preview-modal"><div class="game-preview-loading">讀取預覽 / Loading preview…</div></div>';
  document.body.appendChild(shell);
  shell.addEventListener('click',e=>{if(e.target===shell)closeGamePreview();});
  const escHandler=e=>{if(e.key==='Escape'){closeGamePreview();document.removeEventListener('keydown',escHandler);}};
  document.addEventListener('keydown',escHandler);
  try{
    const {data:g,error}=await supabase.from('games').select('*').eq('slug',slug).single();
    if(error)throw error;
    const [pl,pr,rv,is]=await Promise.all([
      supabase.from('game_platforms').select('platform,availability,supports_zh_hant').eq('game_id',g.id),
      supabase.from('store_products').select('platform,store,edition,current_price,list_price,discount_percent,currency,region').eq('game_id',g.id).eq('region','TW').order('current_price',{ascending:true}).limit(5),
      supabase.from('review_snapshots').select('source,positive_percentage,total_reviews,captured_at').eq('game_id',g.id).order('captured_at',{ascending:false}).limit(1),
      supabase.from('game_issues').select('title_zh,title_en,issue_category,mention_count_24h,growth_24h').eq('game_id',g.id).eq('resolved',false).order('mention_count_24h',{ascending:false}).limit(3)
    ]);
    const product=pr.data?.[0]||null;
    const review=rv.data?.[0]||null;
    const platforms=(pl.data||[]).slice(0,6);
    const issues=is.data||[];
    const title=g.name_zh_hant||g.name_en;
    const desc=g.description_zh_hant||g.description_en||'目前沒有簡介 / No description available.';
    shell.innerHTML=`<div class="game-preview-modal" role="dialog" aria-modal="true" aria-label="${esc(title)} 預覽">
      <button class="game-preview-close" type="button" aria-label="關閉預覽">×</button>
      <div class="game-preview-hero">
        <div class="game-preview-cover native-cover">${gameCoverInner(g)}</div>
        <div class="game-preview-main">
          <div class="game-preview-status"><span class="badge ${statusClass(g.release_status)}">${esc(statusZh(g.release_status))}</span></div>
          <h2>${esc(title)}</h2>
          <div class="game-preview-en">${esc(g.name_en||'')}</div>
          <div class="game-preview-date">📅 <b>上市 / Release</b> ${g.release_date?fmtDate(g.release_date):'日期待定 / TBA'}</div>
          <div class="tags">${platforms.map(x=>`<span class="tag">${esc(x.platform)}${x.supports_zh_hant?' · 繁中':''}</span>`).join('')||'<span class="tag">平台待同步</span>'}</div>
        </div>
      </div>
      <p class="game-preview-desc">${esc(String(desc).slice(0,320))}</p>
      <div class="game-preview-metrics">
        <div><small>台灣最低價 / TW price</small><strong>${product?money(product.current_price,product.currency):'—'}</strong><span>${product?esc(product.store):'待同步'} ${product&&Number(product.discount_percent)>0?`· -${Number(product.discount_percent)}%`:''}</span></div>
        <div><small>玩家評價 / Reviews</small><strong>${review?.positive_percentage!=null?`${Number(review.positive_percentage)}%`:'—'}</strong><span>${review?Number(review.total_reviews||0).toLocaleString()+' reviews':'待同步'}</span></div>
        <div><small>玩家問題 / Issues</small><strong>${issues.length}</strong><span>${issues[0]?esc(issues[0].title_zh||issues[0].issue_category):'目前無主要問題'}</span></div>
      </div>
      <div class="game-preview-issues">${issues.map(x=>`<span>${esc(x.title_zh||x.issue_category)} · 24H ${Number(x.mention_count_24h||0).toLocaleString()}</span>`).join('')}</div>
      <div class="game-preview-actions">
        <button class="btn" id="preview-close">關閉 / Close</button>
        <button class="btn primary" id="preview-full">完整情報 / Full details →</button>
      </div>
    </div>`;
    shell.querySelector('.game-preview-close').onclick=closeGamePreview;
    shell.querySelector('#preview-close').onclick=closeGamePreview;
    shell.querySelector('#preview-full').onclick=()=>{closeGamePreview();location.hash=`game/${slug}`;};
    bindCoverImages(shell);
  }catch(err){
    shell.innerHTML=`<div class="game-preview-modal"><button class="game-preview-close" type="button">×</button><div class="empty">預覽讀取失敗：${esc(err.message)}</div></div>`;
    shell.querySelector('.game-preview-close').onclick=closeGamePreview;
  }
}
function bindCoverImages(root=document){
  root.querySelectorAll('[data-cover-img]').forEach(img=>{
    if(img.dataset.bound==='1')return;
    img.dataset.bound='1';
    img.addEventListener('load',()=>img.parentElement?.classList.add('has-native-image'));
    img.addEventListener('error',()=>{img.remove();});
    if(img.complete&&img.naturalWidth>0)img.parentElement?.classList.add('has-native-image');
  });
}
function gameCard(g){const releaseText=g.release_date?fmtDate(g.release_date):'日期待定 / TBA';return `<article class="game-card" data-game="${esc(g.slug)}"><div class="cover native-cover">${gameCoverInner(g)}</div><span class="badge ${statusClass(g.release_status)}">${esc(statusZh(g.release_status))}</span><h3>${esc(g.name_zh_hant||g.name_en)}</h3><div class="en">${esc(g.name_en)}</div><div class="card-release-row"><span class="card-release-icon">📅</span><span class="card-release-label">上市 / Release</span><strong class="card-release-date ${g.release_date?'':'tba'}">${esc(releaseText)}</strong></div><div class="tags">${(g.platforms||[]).slice(0,4).map(p=>`<span class="tag">${esc(p.platform)}</span>`).join('')||'<span class="tag">平台待同步</span>'}</div><div class="game-stats"><div><small>最低價</small><b>${g.price?money(g.price.current_price,g.price.currency):'—'}</b></div><div><small>評價</small><b>${g.review?.positive_percentage!=null?`${Number(g.review.positive_percentage)}%`:'—'}</b></div><div><small>Live</small><b>${g.live?Number(g.live.viewer_count).toLocaleString():'—'}</b></div></div><div class="card-actions"><button class="btn primary open-game" data-slug="${esc(g.slug)}">預覽 / Preview</button>${g.official_website_url?`<button class="btn official" data-url="${esc(g.official_website_url)}">官方 ↗</button>`:''}</div></article>`;}
function bindCards(){document.querySelectorAll('.open-game').forEach(b=>{if(b.dataset.previewBound==='1')return;b.dataset.previewBound='1';b.onclick=e=>{e.stopPropagation();showGamePreview(b.dataset.slug);};});document.querySelectorAll('.official').forEach(b=>b.onclick=e=>{e.stopPropagation();window.open(b.dataset.url,'_blank','noopener,noreferrer')});bindCoverImages();}

async function pageDashboard(){
  const now=new Date();
  const nowIso=now.toISOString();
  const since=new Date(now.getTime()-24*3600e3).toISOString();
  const [countsRes,upcomingRes,recentRes,priceRes,issueRes,changeRes,healthRes]=await Promise.all([
    loadGameFilterCounts(),
    supabase.from('games').select('*').gte('release_date',nowIso).neq('release_status','released').neq('release_status','cancelled').order('release_date',{ascending:true}).limit(6),
    supabase.from('games').select('*').eq('release_status','released').order('updated_at',{ascending:false}).limit(6),
    supabase.from('store_products').select('*,games!inner(slug,name_en,name_zh_hant,cover_url)').eq('region','TW').gt('discount_percent',0).order('discount_percent',{ascending:false}).limit(6),
    supabase.from('game_issues').select('*,games!inner(slug,name_en,name_zh_hant)').eq('resolved',false).order('mention_count_24h',{ascending:false}).limit(6),
    supabase.from('change_events').select('*,games(name_zh_hant,name_en,slug)').gte('detected_at',since).order('detected_at',{ascending:false}).limit(8),
    supabase.from('source_health').select('source_name,status,message,checked_at').in('source_name',['twitch','youtube']).order('source_name')
  ]);
  if(upcomingRes.error)throw upcomingRes.error;
  if(recentRes.error)throw recentRes.error;
  const counts=countsRes||{};
  const upcoming=await hydrateGames(upcomingRes.data||[]);
  const recent=await hydrateGames((recentRes.data||[]).filter(g=>g.release_status==='released'));
  const prices=priceRes.data||[];
  const issues=issueRes.data||[];
  const changes=changeRes.data||[];
  const health=healthRes.data||[];
  const twitch=health.find(x=>x.source_name==='twitch');
  const youtube=health.find(x=>x.source_name==='youtube');

  const quick=[
    ['released','✓','已上市遊戲','Released Games',counts.released||0],
    ['unreleased','◷','全部未上市','All Unreleased',(counts.all||0)-(counts.released||0)-(counts.cancelled||0)],
    ['upcoming','📅','即將上市','Upcoming',counts.upcoming||0],
    ['preorder','🛒','預購中','Pre-order',counts.preorder||0],
    ['announced','📣','已公布','Announced',counts.announced||0],
    ['tba','?','日期待定','TBA',counts.tba||0]
  ];

  const healthLabel=x=>!x?'尚未設定 / Not configured':x.status==='ok'?'正常 / Connected':x.status==='credential_required'?'需要 API 憑證 / Credentials required':esc(x.status);
  const healthClass=x=>x?.status==='ok'?'ok':x?.status==='credential_required'?'warn':'';

  pageEl().innerHTML=`
    ${header('遊戲情報總覽 / Dashboard','先看最重要的：上市、價格、玩家問題、直播與重大變化。')}
    <section class="dashboard-kpis">
      ${quick.map(([id,icon,zh,en,count])=>`<button class="dashboard-kpi" data-dashboard-filter="${id}">
        <span class="dashboard-kpi-icon">${icon}</span>
        <span><small>${zh} / ${en}</small><strong>${Number(count).toLocaleString()}</strong></span>
        <i>→</i>
      </button>`).join('')}
    </section>

    <section class="dashboard-shortcuts">
      <button data-route-jump="calendar"><span>◷</span><b>上市情報</b><small>Upcoming & Announced</small></button>
      <button data-route-jump="prices"><span>＄</span><b>價格追蹤</b><small>Price Tracker</small></button>
      <button data-route-jump="issues"><span>⚠</span><b>玩家問題</b><small>Issues</small></button>
      <button data-route-jump="live"><span>◉</span><b>直播熱度</b><small>Live Trends</small></button>
    </section>

    <section class="dashboard-two">
      <div class="panel dashboard-panel">
        <div class="section-head"><div><h2>即將上市 / Upcoming</h2><p>依上市日期由近到遠</p></div><button class="btn ghost" data-dashboard-filter="upcoming">查看全部 →</button></div>
        <div class="dashboard-release-list">
          ${upcoming.map(g=>`<button class="dashboard-release open-game" data-slug="${esc(g.slug)}">
            <span class="dashboard-thumb native-cover">${gameCoverInner(g)}</span>
            <span class="dashboard-release-date"><b>${g.release_date?fmtDate(g.release_date):'TBA'}</b><small>${statusZh(g.release_status)}</small></span>
            <span class="dashboard-release-name"><strong>${esc(g.name_zh_hant||g.name_en)}</strong><small>${esc(g.name_en)}</small></span>
            <span>→</span>
          </button>`).join('')||'<div class="empty">目前沒有已確認日期的即將上市遊戲。</div>'}
        </div>
      </div>

      <div class="panel dashboard-panel">
        <div class="section-head"><div><h2>價格情報 / Price Deals</h2><p>台灣區目前折扣較高的商品</p></div><button class="btn ghost" data-route-jump="prices">價格頁 →</button></div>
        <div class="dashboard-signal-list">
          ${prices.map(x=>`<button class="dashboard-signal dashboard-signal-button open-game" data-slug="${esc(x.games?.slug)}">
            <div class="dashboard-signal-game"><span class="dashboard-thumb native-cover">${gameCoverInner(x.games||{})}</span><span><strong>${esc(x.games?.name_zh_hant||x.games?.name_en)}</strong><small>${esc(x.store)} · ${esc(x.edition)}</small></span></div>
            <div class="dashboard-signal-value"><b>${money(x.current_price,x.currency)}</b><span class="badge ok">-${Number(x.discount_percent)}%</span></div>
          </button>`).join('')||'<div class="empty">目前沒有折扣資料。</div>'}
        </div>
      </div>
    </section>

    <section class="dashboard-two">
      <div class="panel dashboard-panel">
        <div class="section-head"><div><h2>玩家問題 / Player Issues</h2><p>24 小時提及量最高</p></div><button class="btn ghost" data-route-jump="issues">問題頁 →</button></div>
        <div class="dashboard-signal-list">
          ${issues.map(x=>`<button class="dashboard-signal dashboard-signal-button open-game" data-slug="${esc(x.games?.slug)}">
            <div><strong>${esc(x.games?.name_zh_hant||x.games?.name_en)}</strong><small>${esc(x.title_zh||x.issue_category)} / ${esc(x.title_en||x.issue_category)}</small></div>
            <div class="dashboard-signal-value"><b>24H ${Number(x.mention_count_24h||0).toLocaleString()}</b><span class="badge ${x.official_confirmed?'ok':''}">${x.official_confirmed?'官方確認':'追蹤中'}</span></div>
          </button>`).join('')||'<div class="empty">目前沒有達門檻的玩家問題。</div>'}
        </div>
      </div>

      <div class="panel dashboard-panel">
        <div class="section-head"><div><h2>直播資料 / Live Data</h2><p>不顯示假數字，只顯示真實 API 狀態</p></div><button class="btn ghost" data-route-jump="live">直播頁 →</button></div>
        <div class="dashboard-health">
          <div><span class="health-service">Twitch</span><span class="badge ${healthClass(twitch)}">${healthLabel(twitch)}</span><small>${esc(twitch?.message||'等待串接官方 API')}</small></div>
          <div><span class="health-service">YouTube</span><span class="badge ${healthClass(youtube)}">${healthLabel(youtube)}</span><small>${esc(youtube?.message||'等待串接官方 API')}</small></div>
        </div>
      </div>
    </section>

    <section class="section dashboard-section">
      <div class="section-head"><div><h2>最近更新的已上市遊戲 / Released Games</h2><p>卡片外直接查看上市日期、價格、評價與直播</p></div><button class="btn ghost" data-dashboard-filter="released">已上市遊戲 →</button></div>
      <div class="grid">${recent.map(gameCard).join('')||'<div class="empty">尚無遊戲資料</div>'}</div>
    </section>

    <section class="panel dashboard-panel dashboard-changes">
      <div class="section-head"><div><h2>24 小時重大變化 / Changes</h2><p>上市、價格、評價、問題與直播事件</p></div><button class="btn ghost" data-route-jump="changes">全部變化 →</button></div>
      ${changes.map(x=>`<div class="timeline-row dashboard-change-row"><div><span class="badge ${x.severity==='critical'?'danger':x.severity==='high'?'warn':''}">${esc(eventZh(x.event_type))}</span><small class="sub">${fmtDate(x.detected_at,true)}</small></div><div><b>${esc(x.games?.name_zh_hant||x.games?.name_en||'系統事件')}</b><small class="sub">${esc(x.games?.name_en||'')}</small></div></div>`).join('')||'<div class="empty">過去 24 小時沒有達門檻的重大變化。</div>'}
    </section>
    <div class="footer">Game Intelligence Monitor · Supabase / GitHub Pages</div>
  `;

  bindCards();
  document.querySelectorAll('[data-dashboard-filter]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.dashboardFilter;
    if(id==='released'){
      state.page=0;
      location.hash='games';
      return;
    }
    state.releaseFilter=id==='unreleased'?'unreleased':id;
    localStorage.setItem('game-intel-release-filter',state.releaseFilter);
    state.releasePage=0;
    location.hash='calendar';
  });
  document.querySelectorAll('[data-route-jump]').forEach(b=>b.onclick=()=>{location.hash=b.dataset.routeJump});
}
async function pageGames(){
  let q=supabase.from('games').select('*',{count:'exact'}).eq('release_status','released');
  if(state.search.trim()){const safe=state.search.replace(/[%,()]/g,'');q=q.or(`name_en.ilike.%${safe}%,name_zh_hant.ilike.%${safe}%,original_name.ilike.%${safe}%`)}
  q=q.order('release_date',{ascending:false,nullsFirst:false}).range(state.page*state.pageSize,state.page*state.pageSize+state.pageSize-1);
  const {data,count,error}=await q;if(error)throw error;
  const games=await hydrateGames(data||[]);
  const pages=Math.max(1,Math.ceil((count||0)/state.pageSize));
  pageEl().innerHTML=`${header('已上市遊戲 / Released Games','只顯示已經正式上市的遊戲；未上市、預購與已公布遊戲統一移到「上市情報」。')}<div class="game-filter-summary released-summary"><div><span>分類 / Category</span><strong>✓ 已上市 / Released</strong></div><div><span>遊戲數量 / Games</span><strong>${(count||0).toLocaleString()} 款</strong></div><div><span>目前頁數 / Page</span><strong>${state.page+1} / ${pages}</strong></div></div><div class="toolbar"><input class="control" id="game-search" value="${esc(state.search)}" placeholder="搜尋已上市遊戲…"><button class="btn" id="search-btn">搜尋 / Search</button>${state.search?'<button class="btn ghost" id="clear-search">清除 / Clear</button>':''}<button class="btn ghost" id="open-release-center">查看未上市 / Upcoming →</button></div><div class="grid">${games.map(gameCard).join('')||'<div class="empty">沒有符合條件的已上市遊戲。</div>'}</div><div class="pagination"><button class="btn" id="prev" ${state.page===0?'disabled':''}>← 上一頁</button><span class="page-indicator">第 ${state.page+1} / ${pages} 頁</span><button class="btn" id="next" ${state.page+1>=pages?'disabled':''}>下一頁 →</button></div>`;
  bindCards();
  document.querySelector('#search-btn').onclick=()=>{state.search=document.querySelector('#game-search').value.trim();state.page=0;pageGames()};
  document.querySelector('#game-search').onkeydown=e=>{if(e.key==='Enter')document.querySelector('#search-btn').click()};
  document.querySelector('#clear-search')?.addEventListener('click',()=>{state.search='';state.page=0;pageGames()});
  document.querySelector('#open-release-center').onclick=()=>{state.releaseFilter='unreleased';state.releasePage=0;location.hash='calendar'};
  document.querySelector('#prev').onclick=()=>{state.page=Math.max(0,state.page-1);pageGames()};
  document.querySelector('#next').onclick=()=>{state.page++;pageGames()};
}
async function pageCalendar(){
  const counts=await loadReleaseCounts();
  let q=supabase.from('games').select('*',{count:'exact'});
  q=applyReleaseFilter(q,state.releaseFilter);
  if(state.search.trim()){const safe=state.search.replace(/[%,()]/g,'');q=q.or(`name_en.ilike.%${safe}%,name_zh_hant.ilike.%${safe}%,original_name.ilike.%${safe}%`)}
  q=applyReleaseSort(q,state.releaseFilter).range(state.releasePage*state.pageSize,state.releasePage*state.pageSize+state.pageSize-1);
  const {data,count,error}=await q;if(error)throw error;
  const games=await hydrateGames(data||[]);
  const pages=Math.max(1,Math.ceil((count||0)/state.pageSize));
  const active=releaseFilterInfo(state.releaseFilter);
  pageEl().innerHTML=`${header('上市情報 / Upcoming & Announced','所有尚未正式上市的遊戲集中在這裡，並以互斥規則分類，每款遊戲只會出現在一個狀態。')}${renderReleaseFilterTabs(counts)}<div class="release-priority-note">分類優先順序 / Priority：<b>預購中</b> → <b>延期</b> → <b>搶先體驗</b> → <b>即將上市</b> → <b>已公布</b> → <b>日期待定</b></div><div class="game-filter-summary"><div><span>目前分類 / Category</span><strong>${active.icon} ${active.zh} / ${active.en}</strong></div><div><span>符合條件 / Results</span><strong>${(count||0).toLocaleString()} 款</strong></div><div><span>目前頁數 / Page</span><strong>${state.releasePage+1} / ${pages}</strong></div></div><div class="toolbar"><input class="control" id="release-search" value="${esc(state.search)}" placeholder="在「${active.zh}」中搜尋…"><button class="btn" id="release-search-btn">搜尋 / Search</button>${state.search?'<button class="btn ghost" id="release-clear-search">清除 / Clear</button>':''}<button class="btn ghost" id="open-released-games">已上市遊戲 →</button></div><div class="grid">${games.map(gameCard).join('')||'<div class="empty">這個分類目前沒有符合條件的遊戲。</div>'}</div><div class="pagination"><button class="btn" id="release-prev" ${state.releasePage===0?'disabled':''}>← 上一頁</button><span class="page-indicator">第 ${state.releasePage+1} / ${pages} 頁</span><button class="btn" id="release-next" ${state.releasePage+1>=pages?'disabled':''}>下一頁 →</button></div>`;
  bindCards();
  document.querySelectorAll('[data-release-filter]').forEach(b=>b.onclick=()=>{state.releaseFilter=b.dataset.releaseFilter;localStorage.setItem('game-intel-release-filter',state.releaseFilter);state.releasePage=0;pageCalendar();});
  document.querySelector('#release-search-btn').onclick=()=>{state.search=document.querySelector('#release-search').value.trim();state.releasePage=0;pageCalendar()};
  document.querySelector('#release-search').onkeydown=e=>{if(e.key==='Enter')document.querySelector('#release-search-btn').click()};
  document.querySelector('#release-clear-search')?.addEventListener('click',()=>{state.search='';state.releasePage=0;pageCalendar()});
  document.querySelector('#open-released-games').onclick=()=>{state.page=0;location.hash='games'};
  document.querySelector('#release-prev').onclick=()=>{state.releasePage=Math.max(0,state.releasePage-1);pageCalendar()};
  document.querySelector('#release-next').onclick=()=>{state.releasePage++;pageCalendar()};
}
async function pagePrices(){
  const {data,error}=await supabase.from('store_products')
    .select('*,games!inner(id,slug,name_en,name_zh_hant,cover_url)')
    .eq('region','TW')
    .order('discount_percent',{ascending:false})
    .order('updated_at',{ascending:false})
    .limit(500);
  if(error)throw error;
  const rows=data||[];
  const ids=rows.map(x=>x.id);
  const {data:hist,error:histErr}=ids.length
    ? await supabase.from('price_history')
        .select('product_id,price,list_price,discount_percent,currency,captured_at')
        .in('product_id',ids)
        .order('captured_at',{ascending:true})
    : {data:[],error:null};
  if(histErr)throw histErr;

  const historyByProduct=new Map();
  for(const h of hist||[]){
    const k=String(h.product_id);
    const list=historyByProduct.get(k)||[];
    list.push(h);
    historyByProduct.set(k,list);
  }

  const fmtOfferEnd=(x)=>{
    if(Number(x.discount_percent||0)<=0)return {main:'目前無優惠',sub:'No active offer',cls:''};
    if(!x.sale_end)return {main:'期限未提供',sub:'End date unavailable',cls:'warn'};
    const end=new Date(x.sale_end);
    const ms=end-Date.now();
    if(ms<=0)return {main:'優惠已結束',sub:fmtDate(x.sale_end,true),cls:'danger'};
    const hours=Math.floor(ms/3600000);
    const days=Math.floor(hours/24);
    return {
      main:days>=1?`剩 ${days} 天 ${hours%24} 小時`:`剩 ${hours} 小時`,
      sub:`至 ${fmtDate(x.sale_end,true)}`,
      cls:days<=1?'warn':'ok'
    };
  };

  const compareHistory=(x)=>{
    const all=historyByProduct.get(String(x.id))||[];
    const currentAt=x.updated_at?new Date(x.updated_at).getTime():Date.now();
    const previous=all.filter(h=>new Date(h.captured_at).getTime()<currentAt-1000);
    const previousOffers=previous.filter(h=>Number(h.discount_percent||0)>0);
    const currentPrice=x.current_price==null?null:Number(x.current_price);
    const currentDiscount=Number(x.discount_percent||0);

    if(!previous.length){
      return {
        low:null,
        maxDiscount:null,
        offerCount:0,
        badge:'首次追蹤 / First tracked',
        detail:'尚無先前價格可比較',
        cls:''
      };
    }
    const prices=previous.map(h=>Number(h.price)).filter(Number.isFinite);
    const discounts=previousOffers.map(h=>Number(h.discount_percent||0)).filter(Number.isFinite);
    const low=prices.length?Math.min(...prices):null;
    const maxDiscount=discounts.length?Math.max(...discounts):null;
    let badge='歷史資料 / History';
    let detail=`已累積 ${previous.length} 筆先前價格快照`;
    let cls='';

    if(currentPrice!=null&&low!=null){
      if(currentPrice<low){badge='🔥 新歷史低價 / New low';detail=`比先前最低價少 ${money(low-currentPrice,x.currency)}`;cls='ok';}
      else if(currentPrice===low){badge='＝ 歷史最低價 / Matches low';detail=`等同先前最低價 ${money(low,x.currency)}`;cls='ok';}
      else{detail=`先前最低 ${money(low,x.currency)}，目前高 ${money(currentPrice-low,x.currency)}`;}
    }
    if(currentDiscount>0&&maxDiscount!=null){
      if(currentDiscount>maxDiscount){badge='🏷 最大折扣 / Best discount';detail+=` · 比先前最大折扣多 ${currentDiscount-maxDiscount} 個百分點`;cls='ok';}
      else if(currentDiscount===maxDiscount){detail+=` · 等同先前最大折扣 -${maxDiscount}%`;}
      else{detail+=` · 先前最大折扣 -${maxDiscount}%`;}
    }
    return {low,maxDiscount,offerCount:previousOffers.length,badge,detail,cls};
  };

  const platformMeta=(platform,store)=>{
    const p=String(platform||store||'Store').toLowerCase();
    if(p.includes('steam'))return ['ST','Steam'];
    if(p.includes('playstation')||p.includes('ps5')||p.includes('ps4'))return ['PS','PlayStation'];
    if(p.includes('xbox'))return ['XB','Xbox'];
    if(p.includes('nintendo')||p.includes('switch'))return ['NS','Nintendo'];
    if(p.includes('epic'))return ['EP','Epic'];
    return ['◈',platform||store||'Store'];
  };

  const activeDeals=rows.filter(x=>Number(x.discount_percent||0)>0).length;
  pageEl().innerHTML=`${header('價格追蹤 / Price Tracker','圖片、平台、優惠期限與歷史優惠比較集中顯示；TW / NTD 優先。')}
    <div class="price-summary-grid">
      <div><span>商品 / Products</span><strong>${rows.length.toLocaleString()}</strong></div>
      <div><span>目前優惠 / Active deals</span><strong>${activeDeals.toLocaleString()}</strong></div>
      <div><span>歷史快照 / History</span><strong>${(hist||[]).length.toLocaleString()}</strong></div>
    </div>
    <div class="price-cards">
      ${rows.map(x=>{
        const game=x.games||{};
        const [icon,platformName]=platformMeta(x.platform,x.store);
        const offer=fmtOfferEnd(x);
        const history=compareHistory(x);
        const cover=game.cover_url?esc(game.cover_url):'';
        const editionZh=({'Standard':'標準版','Deluxe':'豪華版','Ultimate':'終極版','Collector':'典藏版','DLC':'下載內容','Bundle':'組合包'})[x.edition]||x.edition||'版本';
        return `<article class="price-card price-card-rich">
          <button class="price-cover native-cover open-game" data-slug="${esc(game.slug)}" aria-label="預覽 ${esc(game.name_zh_hant||game.name_en)}">${gameCoverInner(game)}</button>
          <div class="price-game">
            <strong>${esc(game.name_zh_hant||game.name_en)}</strong>
            <span>${esc(game.name_en||'')}</span>
            <div class="price-labels">
              <span class="store-badge"><i>${icon}</i>${esc(platformName)}</span>
              <span class="store-badge">${esc(x.store||'Store')}</span>
              <span class="store-badge">${esc(editionZh)} / ${esc(x.edition||'Edition')}</span>
            </div>
          </div>
          <div class="price-value">
            <small>原價 / List</small>
            <span>${money(x.list_price,x.currency)}</span>
          </div>
          <div class="price-value current">
            <small>現價 / Current</small>
            <b>${money(x.current_price,x.currency)}</b>
            ${Number(x.discount_percent)>0?`<span class="badge ok">-${Number(x.discount_percent)}%</span>`:''}
          </div>
          <div class="price-value offer-end">
            <small>優惠期限 / Offer ends</small>
            <b class="${offer.cls}">${offer.main}</b>
            <span>${offer.sub}</span>
          </div>
          <div class="price-history-compare">
            <small>與之前優惠相比 / vs Previous deals</small>
            <span class="badge ${history.cls}">${history.badge}</span>
            <p>${esc(history.detail)}</p>
            <div class="price-history-mini">
              <span>先前最低 <b>${history.low==null?'—':money(history.low,x.currency)}</b></span>
              <span>先前最大折扣 <b>${history.maxDiscount==null?'—':`-${history.maxDiscount}%`}</b></span>
              <span>先前優惠快照 <b>${history.offerCount}</b></span>
            </div>
          </div>
          <div class="price-open">
            <button class="btn primary open-game" data-slug="${esc(game.slug)}">預覽 / Preview</button>
            ${x.store_url?`<button class="btn" data-url="${esc(x.store_url)}">前往商店 ↗</button>`:''}
          </div>
        </article>`;
      }).join('')||'<div class="empty">尚無價格資料</div>'}
    </div>`;
  bindCards();
  document.querySelectorAll('[data-url]').forEach(b=>b.onclick=()=>window.open(b.dataset.url,'_blank','noopener,noreferrer'));
}
async function pageIssues(){const {data,error}=await supabase.from('game_issues').select('*,games!inner(slug,name_en,name_zh_hant)').eq('resolved',false).order('mention_count_24h',{ascending:false}).limit(300);if(error)throw error;pageEl().innerHTML=`${header('玩家問題 / Issues','問題分類、提及量、成長率與官方確認狀態。')}<div class="panel">${(data||[]).map(x=>`<div class="issue-row" style="grid-template-columns:minmax(220px,1.3fr) 1fr 90px 90px"><div><b>${esc(x.games?.name_zh_hant||x.games?.name_en)}</b><div class="sub">${esc(x.title_zh)} / ${esc(x.title_en)}</div></div><span class="badge ${x.official_confirmed?'ok':''}">${esc(x.issue_category)}${x.official_confirmed?' · 官方確認':''}</span><span>24H ${Number(x.mention_count_24h).toLocaleString()}</span><b>${x.growth_24h!=null?`${Number(x.growth_24h)>0?'+':''}${Number(x.growth_24h)}%`:'—'}</b></div>`).join('')||'<div class="empty">目前尚未偵測到達門檻的玩家問題。</div>'}</div>`;}

async function pageLive(){const {data,error}=await supabase.from('streaming_snapshots').select('*,games!inner(slug,name_en,name_zh_hant)').order('captured_at',{ascending:false}).limit(1000);if(error)throw error;const latest=new Map();for(const x of data||[]){const k=`${x.game_id}:${x.source}`;if(!latest.has(k))latest.set(k,x)}const combined=new Map();for(const x of latest.values()){const k=String(x.game_id),cur=combined.get(k)||{game:x.games,viewers:0,channels:0,sources:[]};cur.viewers+=Number(x.viewer_count);cur.channels+=Number(x.channel_count);cur.sources.push(x.source);combined.set(k,cur)}const rows=[...combined.values()].sort((a,b)=>b.viewers-a.viewers);pageEl().innerHTML=`${header('直播熱度 / Live Trends','Twitch + YouTube 分開採集，排行榜顯示合計觀看與頻道數。')}<div class="panel">${rows.map((x,i)=>`<div class="rank-row"><span class="rank">${String(i+1).padStart(2,'0')}</span><div><b>${esc(x.game?.name_zh_hant||x.game?.name_en)}</b><div class="sub">${esc(x.sources.join(' + '))}</div></div><b>${x.viewers.toLocaleString()}</b><span>${x.channels.toLocaleString()} 頻道</span></div>`).join('')||'<div class="empty">尚未取得直播快照；接通 Twitch / YouTube 同步後會自動累積。</div>'}</div>`;}

async function pageChanges(){const {data,error}=await supabase.from('change_events').select('*,games(name_zh_hant,name_en,slug)').order('detected_at',{ascending:false}).limit(300);if(error)throw error;pageEl().innerHTML=`${header('重大變化 / Changes','只記錄達到門檻的上市、價格、評價、問題與直播事件。')}<div class="panel">${(data||[]).map(x=>`<div class="timeline-row" style="grid-template-columns:120px minmax(220px,1fr) 1fr"><div><span class="badge ${x.severity==='critical'?'danger':x.severity==='high'?'warn':''}">${esc(eventZh(x.event_type))}</span><div class="sub" style="margin-top:5px">${fmtDate(x.detected_at,true)}</div></div><div><b>${esc(x.games?.name_zh_hant||x.games?.name_en||'系統事件')}</b><div class="sub">${esc(x.games?.name_en||'')}</div></div><code class="sub">${esc(JSON.stringify(x.new_value||{}))}</code></div>`).join('')||'<div class="empty">目前沒有重大變化。</div>'}</div>`;}

async function pageWatchlist(){const uid=state.session.user.id;const {data,error}=await supabase.from('watchlist').select('*,games!inner(slug,name_en,name_zh_hant,release_date)').eq('user_id',uid).order('created_at',{ascending:false});if(error)throw error;pageEl().innerHTML=`${header('我的收藏 / Watchlist','收藏遊戲與個人通知條件。')}<div class="panel">${(data||[]).map(x=>`<div class="price-row" style="grid-template-columns:minmax(220px,1fr) 120px 1fr 80px"><div><b>${esc(x.games?.name_zh_hant||x.games?.name_en)}</b><div class="sub">${esc(x.games?.name_en)} · ${fmtDate(x.games?.release_date)}</div></div><span>目標 ${x.target_price!=null?money(x.target_price):'未設定'}</span><span class="sub">${[['上市',x.notify_release],['預購',x.notify_preorder],['價格',x.notify_price],['評價',x.notify_reviews],['問題',x.notify_issues],['直播',x.notify_streams]].filter(y=>y[1]).map(y=>y[0]).join(' · ')||'未開通知'}</span><button class="btn danger remove-watch" data-id="${x.id}">移除</button></div>`).join('')||'<div class="empty">尚未收藏遊戲。可在遊戲詳細頁加入收藏。</div>'}</div>`;document.querySelectorAll('.remove-watch').forEach(b=>b.onclick=async()=>{const {error}=await supabase.from('watchlist').delete().eq('id',b.dataset.id);if(error)toast(error.message,true);else{toast('已移除收藏');pageWatchlist();}});}

async function pageSettings(){const [{data:health},{data:runs},{data:allowed}]=await Promise.all([supabase.from('source_health').select('*').order('source_name'),supabase.from('sync_runs').select('*').order('started_at',{ascending:false}).limit(15),supabase.from('allowed_users').select('email')]);pageEl().innerHTML=`${header('設定 / Settings','帳號、資料來源與同步健康度。')}<section class="two-col"><div class="panel"><div class="section-head"><div><h2>帳號</h2><p>Supabase Auth</p></div></div><div class="signal-row"><span>Email</span><b>${esc(state.session.user.email)}</b></div><div class="signal-row"><span>私人白名單</span><span class="badge ok">${allowed?.length?'已授權':'未授權'}</span></div><button class="btn danger" id="settings-logout" style="margin-top:12px">登出</button></div><div class="panel"><div class="section-head"><div><h2>資料來源健康度</h2><p>只顯示後端紀錄，不暴露 API 金鑰</p></div></div>${(health||[]).map(x=>`<div class="signal-row"><div><b>${esc(x.source_name)}</b><div class="sub">${esc(x.message||'—')}</div></div><span class="badge ${x.status==='ok'?'ok':x.status==='credential_required'?'warn':'danger'}">${esc(x.status)}</span></div>`).join('')||'<div class="empty">尚無健康度紀錄</div>'}</div></section><section class="section panel"><div class="section-head"><div><h2>最近同步</h2><p>最多 15 筆</p></div></div>${(runs||[]).map(x=>`<div class="timeline-row" style="grid-template-columns:100px 90px 1fr 150px"><b>${esc(x.source_name)}</b><span class="badge ${x.status==='ok'?'ok':x.status==='running'?'':'danger'}">${esc(x.status)}</span><span>${Number(x.items_seen).toLocaleString()} seen · ${Number(x.items_changed).toLocaleString()} changed</span><span class="sub">${fmtDate(x.started_at,true)}</span></div>`).join('')||'<div class="empty">尚無同步紀錄</div>'}</section>`;document.querySelector('#settings-logout').onclick=()=>supabase.auth.signOut();}

async function pageGame(slug){if(!slug){location.hash='games';return;}const {data:g,error}=await supabase.from('games').select('*').eq('slug',slug).single();if(error)throw error;const [pl,pr,rv,is,st,li,wl]=await Promise.all([supabase.from('game_platforms').select('*').eq('game_id',g.id),supabase.from('store_products').select('*').eq('game_id',g.id).eq('region','TW').order('current_price'),supabase.from('review_snapshots').select('*').eq('game_id',g.id).order('captured_at',{ascending:false}).limit(20),supabase.from('game_issues').select('*').eq('game_id',g.id).eq('resolved',false).order('mention_count_24h',{ascending:false}),supabase.from('streaming_snapshots').select('*').eq('game_id',g.id).order('captured_at',{ascending:false}).limit(30),supabase.from('official_links').select('*').eq('game_id',g.id),supabase.from('watchlist').select('*').eq('user_id',state.session.user.id).eq('game_id',g.id).maybeSingle()]);const latestR=rv.data?.[0],latestS=st.data?.[0],watch=wl.data;
  pageEl().innerHTML=`${header('遊戲情報 / Game Detail','平台、價格、評價、問題、直播與官方連結集中顯示。')}<section class="detail-hero"><div class="detail-cover">${esc(initials(g.name_en))}</div><div><span class="badge ${statusClass(g.release_status)}">${statusZh(g.release_status)}</span><h2>${esc(g.name_zh_hant||g.name_en)}</h2><p>${esc(g.name_en)} · ${esc(g.developer||'Developer 待同步')} · ${esc(g.publisher||'Publisher 待同步')}</p><div class="tags" style="margin-top:10px">${(g.genres||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}<span class="tag">Release ${fmtDate(g.release_date)}</span></div></div>${g.official_website_url?`<button class="btn primary" id="official-site">官方網站 ↗</button>`:''}</section><section class="metrics"><article class="metric"><span>玩家評價</span><strong>${latestR?.positive_percentage!=null?`${Number(latestR.positive_percentage)}%`:'—'}</strong><small>${esc(latestR?.source||'待同步')}</small></article><article class="metric"><span>直播觀看</span><strong>${latestS?Number(latestS.viewer_count).toLocaleString():'—'}</strong><small>${latestS?`${esc(latestS.source)} · ${Number(latestS.channel_count)} 頻道`:'待同步'}</small></article><article class="metric"><span>未解決問題</span><strong>${is.data?.length||0}</strong><small>Issues</small></article><article class="metric"><span>官方連結</span><strong>${li.data?.length||0}</strong><small>Verified</small></article></section><div class="detail-grid"><div class="panel"><div class="section-head"><div><h2>平台與價格</h2><p>TW / NTD</p></div></div>${(pr.data||[]).map(x=>`<div class="price-row" style="grid-template-columns:1fr 110px 45px"><div><b>${esc(x.store)}</b><div class="sub">${esc(x.platform)} · ${esc(x.edition)}</div></div><b>${money(x.current_price,x.currency)} ${Number(x.discount_percent)>0?`<span class="badge ok">-${Number(x.discount_percent)}%</span>`:''}</b><button class="btn" data-url="${esc(x.store_url)}">↗</button></div>`).join('')||'<div class="empty">價格待同步</div>'}</div><div class="panel"><div class="section-head"><div><h2>平台支援</h2><p>語言與上市狀態</p></div></div>${(pl.data||[]).map(x=>`<div class="signal-row"><div><b>${esc(x.platform)}</b><div class="sub">${fmtDate(x.release_date)}</div></div><span>${x.supports_zh_hant?'繁中 · ':''}${esc(x.availability)}</span></div>`).join('')||'<div class="empty">平台待同步</div>'}</div><div class="panel"><div class="section-head"><div><h2>玩家主要問題</h2><p>目前未解決</p></div></div>${(is.data||[]).map(x=>`<div class="issue-row" style="grid-template-columns:1fr 80px"><div><b>${esc(x.title_zh)}</b><div class="sub">${esc(x.title_en)} · 24H ${Number(x.mention_count_24h)}</div></div><b>${x.growth_24h!=null?`${Number(x.growth_24h)>0?'+':''}${Number(x.growth_24h)}%`:'—'}</b></div>`).join('')||'<div class="empty">目前沒有達門檻的玩家問題</div>'}</div><div class="panel"><div class="section-head"><div><h2>官方連結</h2><p>Official / Verified</p></div></div>${(li.data||[]).map(x=>`<div class="signal-row"><div><b>${esc(x.label)}</b><div class="sub">${esc(x.region||'GLOBAL')} · ${esc(x.tier)}</div></div><button class="btn" data-url="${esc(x.url)}">開啟 ↗</button></div>`).join('')||'<div class="empty">尚無官方連結</div>'}</div></div><section class="section panel"><div class="section-head"><div><h2>我的收藏通知</h2><p>只有你的帳號可存取</p></div><button class="btn ${watch?'danger':'primary'}" id="watch-btn">${watch?'移除收藏':'加入收藏'}</button></div>${watch?`<div class="toolbar"><label class="sub">目標價 <input class="control" id="target-price" type="number" min="0" step="1" value="${watch.target_price??''}" placeholder="例如 1200"></label></div><div class="toolbar">${[['notify_release','上市'],['notify_preorder','預購'],['notify_price','價格'],['notify_reviews','評價'],['notify_issues','問題'],['notify_streams','直播']].map(([k,l])=>`<button class="btn notify-toggle ${watch[k]?'primary':''}" data-key="${k}">${l}</button>`).join('')}<button class="btn primary" id="save-watch">儲存設定</button></div>`:''}</section>`;
  if(g.official_website_url)document.querySelector('#official-site').onclick=()=>window.open(g.official_website_url,'_blank','noopener,noreferrer');document.querySelectorAll('[data-url]').forEach(b=>b.onclick=()=>window.open(b.dataset.url,'_blank','noopener,noreferrer'));
  document.querySelector('#watch-btn').onclick=async()=>{if(watch){const {error}=await supabase.from('watchlist').delete().eq('id',watch.id);if(error)toast(error.message,true);else{toast('已移除收藏');pageGame(slug)}}else{const {error}=await supabase.from('watchlist').insert({user_id:state.session.user.id,game_id:g.id});if(error)toast(error.message,true);else{toast('已加入收藏');pageGame(slug)}}};
  if(watch){document.querySelectorAll('.notify-toggle').forEach(b=>b.onclick=()=>b.classList.toggle('primary'));document.querySelector('#save-watch').onclick=async()=>{const payload={target_price:document.querySelector('#target-price').value?Number(document.querySelector('#target-price').value):null};document.querySelectorAll('.notify-toggle').forEach(b=>payload[b.dataset.key]=b.classList.contains('primary'));const {error}=await supabase.from('watchlist').update(payload).eq('id',watch.id);if(error)toast(error.message,true);else toast('收藏通知設定已更新');};}
}

init();
