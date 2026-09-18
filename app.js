const SUPABASE_URL = 'https://ehyivgyprxiyhldxrzpx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tukBY1endjNBJdVFoSBHbA__pHOPGGx';
let supabase = null;

const app = document.querySelector('#app');

function bootMessage(title,detail='',error=false){
  if(!app)return;
  app.innerHTML=`<div class="boot boot-diagnostic ${error?'error':''}">
    <strong>${esc(title)}</strong>
    ${detail?`<span>${esc(detail)}</span>`:''}
    ${error?'<button class="btn primary" id="boot-retry" type="button">重新載入 / Retry</button>':''}
  </div>`;
  document.querySelector('#boot-retry')?.addEventListener('click',()=>location.reload());
}

async function loadSupabaseSdk(){
  const sources=[
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm',
    'https://esm.sh/@supabase/supabase-js@2.57.4',
    'https://esm.run/@supabase/supabase-js@2.57.4'
  ];
  let lastError=null;
  for(const url of sources){
    try{
      bootMessage('Loading Game Intelligence Monitor…',`載入核心元件 / Loading SDK: ${new URL(url).hostname}`);
      const mod=await Promise.race([
        import(url),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('SDK load timeout')),7000))
      ]);
      if(typeof mod?.createClient==='function')return mod.createClient;
      throw new Error('createClient not found');
    }catch(err){
      lastError=err;
      console.warn('[Game Intel] Supabase SDK source failed',url,err);
    }
  }
  throw lastError||new Error('Supabase SDK unavailable');
}

function withTimeout(promise,ms,label){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timeout after ${Math.round(ms/1000)}s`)),ms))
  ]);
}
const state = { session:null, allowed:false, lang:localStorage.getItem('game-intel-lang') || 'zh', search:'', page:0, pageSize:36, gameFilter:'released', releaseFilter:localStorage.getItem('game-intel-release-filter') || 'unreleased', releasePage:0, issueSearch:'', issueGame:'all', gameplayFilters:(()=>{const multi=localStorage.getItem('game-intel-gameplay-filters');if(multi){try{const v=JSON.parse(multi);if(Array.isArray(v))return v.filter(Boolean);}catch{}}const legacy=localStorage.getItem('game-intel-gameplay-filter');return legacy&&legacy!=='all'?[legacy]:[];})() };
const fmtDate = (v, withTime=false) => v ? new Intl.DateTimeFormat('zh-TW', withTime ? {dateStyle:'medium',timeStyle:'short'} : {year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)) : 'TBA';
const money = (v, c='TWD') => v == null ? '—' : Number(v) === 0 ? '免費' : c === 'TWD' ? `NT$${Number(v).toLocaleString()}` : `${c} ${Number(v).toLocaleString()}`;
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const initials = name => (name || 'GI').trim().slice(0,2).toUpperCase();
const statusZh = s => ({released:'已上市',preorder:'預購中',announced:'已公布',delayed:'延期',early_access:'搶先體驗',cancelled:'取消',unknown:'追蹤中'})[s] || s || '追蹤中';
const statusClass = s => s === 'released' ? 'ok' : s === 'delayed' || s === 'preorder' ? 'warn' : '';
const eventZh = t => ({GAME_ANNOUNCED:'新遊戲公布',STORE_LISTED:'商店上架',PREORDER_OPEN:'預購開放',RELEASE_DATE_CHANGED:'上市日期異動',RELEASE_DELAYED:'延期',RELEASED:'正式上市',PRICE_CHANGED:'價格異動',DISCOUNT_STARTED:'折扣開始',HISTORICAL_LOW:'歷史低價',TARGET_PRICE_REACHED:'目標價達成',REVIEW_DROP:'評價下降',ISSUE_SPIKE:'問題暴增',STREAM_SPIKE:'直播暴增',STREAM_DROP:'直播下降',PLATFORM_ADDED:'新增平台',LANGUAGE_ADDED:'新增語言'})[t] || t;

const gameplayTagDefs=[
  ['soulslike','類魂','Soulslike'],['roguelike','Roguelike','Roguelike'],['roguelite','Roguelite','Roguelite'],
  ['metroidvania','銀河惡魔城','Metroidvania'],['arpg','動作 RPG','ARPG'],['tactical_rpg','戰術 RPG','Tactical RPG'],
  ['turn_based_rpg','回合制 RPG','Turn-based RPG'],['survival_crafting','生存製作','Survival Crafting'],
  ['open_world','開放世界','Open World'],['survival_horror','生存恐怖','Survival Horror'],['horror','恐怖','Horror'],
  ['deckbuilder','卡牌構築','Deckbuilder'],['city_builder','城市建造','City Builder'],['management_sim','模擬經營','Management Sim'],
  ['coop_pve','合作 PvE','Co-op PvE'],['extraction_shooter','撤離射擊','Extraction Shooter'],['battle_royale','大逃殺','Battle Royale'],
  ['moba','MOBA','MOBA'],['mmo','MMO / MMORPG','MMO'],['colony_sim','聚落模擬','Colony Sim'],
  ['tower_defense','塔防','Tower Defense'],['farming_sim','農場模擬','Farming Sim'],['life_sim','生活模擬','Life Sim'],
  ['automation','工廠自動化','Automation'],['stealth','潛行','Stealth'],['hack_and_slash','砍殺','Hack & Slash'],
  ['rhythm','節奏','Rhythm'],['bullet_hell','彈幕','Bullet Hell'],['visual_novel','視覺小說','Visual Novel'],['sandbox','沙盒','Sandbox']
];
const gameplayTagMap=new Map(gameplayTagDefs.map(x=>[x[0],x]));
const gameplayTagLabel=tag=>{const d=gameplayTagMap.get(tag);return d?`${d[1]} / ${d[2]}`:tag;};
function renderGameplayTags(game,limit=4){
  const tags=Array.isArray(game?.gameplay_tags)?game.gameplay_tags:[];
  return tags.slice(0,limit).map(tag=>`<span class="gameplay-chip" data-gameplay-tag="${esc(tag)}">${esc(gameplayTagLabel(tag))}</span>`).join('');
}
function saveGameplayFilters(){
  localStorage.setItem('game-intel-gameplay-filters',JSON.stringify(state.gameplayFilters));
  localStorage.removeItem('game-intel-gameplay-filter');
}
function gameplayFilterSummary(){
  if(!state.gameplayFilters.length)return '全部玩法 / All gameplay';
  return state.gameplayFilters.map(gameplayTagLabel).join(' + ');
}
function gameplayFilterControl(id='gameplay-filter'){
  const selected=new Set(state.gameplayFilters);
  return `<div class="gameplay-multi-filter" id="${id}">
    <div class="gameplay-multi-head">
      <span><b>玩法分類 / Gameplay</b><small>多選為 AND：必須符合全部條件 / Match all selected</small></span>
      <span class="gameplay-selected-count">${state.gameplayFilters.length} selected</span>
    </div>
    <div class="gameplay-choice-list">
      ${gameplayTagDefs.map(([key,zh,en])=>`<button type="button" class="gameplay-choice ${selected.has(key)?'active':''}" data-gameplay-choice="${key}" aria-pressed="${selected.has(key)?'true':'false'}">${zh}<small>${en}</small></button>`).join('')}
    </div>
    <div class="gameplay-multi-foot">
      <span>目前條件：<b>${esc(gameplayFilterSummary())}</b></span>
      ${state.gameplayFilters.length?'<button type="button" class="btn ghost gameplay-clear">清除玩法 / Clear</button>':''}
    </div>
  </div>`;
}
function bindGameplayFilter(containerId,onChange){
  const root=document.querySelector('#'+containerId);
  if(!root)return;
  root.querySelectorAll('[data-gameplay-choice]').forEach(btn=>btn.onclick=()=>{
    const key=btn.dataset.gameplayChoice;
    const set=new Set(state.gameplayFilters);
    if(set.has(key))set.delete(key);else set.add(key);
    state.gameplayFilters=[...set];
    saveGameplayFilters();
    onChange();
  });
  root.querySelector('.gameplay-clear')?.addEventListener('click',()=>{
    state.gameplayFilters=[];
    saveGameplayFilters();
    onChange();
  });
}


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
  try{
    const createClient=await loadSupabaseSdk();
    supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });

    bootMessage('Loading Game Intelligence Monitor…','正在確認登入狀態 / Checking session…');
    const sessionResult=await withTimeout(supabase.auth.getSession(),8000,'Auth session');
    const session=sessionResult?.data?.session||null;
    state.session=session;

    if(session){
      bootMessage('Loading Game Intelligence Monitor…','正在驗證私人存取權限 / Checking access…');
      state.allowed=await withTimeout(checkAllowed(),8000,'Access check');
    }

    supabase.auth.onAuthStateChange((_event,nextSession)=>{
      setTimeout(async()=>{
        try{
          state.session=nextSession;
          state.allowed=nextSession?await withTimeout(checkAllowed(),8000,'Access check'):false;
          render();
        }catch(err){
          console.error('[Game Intel] auth state render failed',err);
          bootMessage('登入狀態更新失敗 / Auth update failed',err?.message||String(err),true);
        }
      },0);
    });

    render();
  }catch(err){
    console.error('[Game Intel] boot failed',err);
    bootMessage('網站啟動失敗 / Startup failed',err?.message||String(err),true);
  }
}
async function checkAllowed(){
  const {data,error}=await supabase.rpc('is_allowed_user');
  if(error){
    console.error('[Game Intel] allowlist check failed',error);
    return false;
  }
  return data===true;
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
  const loader={dashboard:pageDashboard,games:pageGames,calendar:pageCalendar,prices:pagePrices,price:()=>pagePrice(r.arg),issues:pageIssues,live:pageLive,changes:pageChanges,watchlist:pageWatchlist,settings:pageSettings,game:()=>pageGame(r.arg)}[r.name]||pageDashboard;
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

function steamAppIdFromGame(g){
  const slug=String(g?.slug||'');
  const m=slug.match(/^steam-(\d+)$/);
  return m?m[1]:null;
}
function coverCandidates(g){
  const urls=[];
  if(g?.cover_url)urls.push(String(g.cover_url));
  const appid=steamAppIdFromGame(g);
  if(appid){
    urls.push(`https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`);
    urls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`);
  }
  return [...new Set(urls)];
}
function gameCoverInner(g){
  const title=g?.name_zh_hant||g?.name_en||'Game';
  const fallback=esc(initials(g?.name_en||title));
  const candidates=coverCandidates(g);
  const first=candidates[0]?esc(candidates[0]):'';
  const encoded=esc(JSON.stringify(candidates));
  return `${first?`<img class="native-cover-img" data-cover-img data-cover-candidates='${encoded}' data-cover-index="0" src="${first}" alt="${esc(title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}<span class="cover-fallback">${fallback}</span>`;
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
          ${Array.isArray(g.gameplay_tags)&&g.gameplay_tags.length?`<div class="game-preview-gameplay"><small>玩法分類 / Gameplay</small><div class="gameplay-row">${renderGameplayTags(g,8)}</div></div>`:''}
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
    const parent=img.parentElement;
    const candidates=(()=>{
      try{return JSON.parse(img.dataset.coverCandidates||'[]');}
      catch{return [];}
    })();
    const markLoaded=()=>parent?.classList.add('has-native-image');
    img.addEventListener('load',markLoaded);
    img.addEventListener('error',()=>{
      parent?.classList.remove('has-native-image');
      const current=Number(img.dataset.coverIndex||0);
      const next=current+1;
      if(next<candidates.length){
        img.dataset.coverIndex=String(next);
        img.src=candidates[next];
      }else{
        img.remove();
      }
    });
    if(img.complete&&img.naturalWidth>0)markLoaded();
  });
}

function gameCard(g){const releaseText=g.release_date?fmtDate(g.release_date):'日期待定 / TBA';return `<article class="game-card" data-game="${esc(g.slug)}"><div class="cover native-cover">${gameCoverInner(g)}</div><span class="badge ${statusClass(g.release_status)}">${esc(statusZh(g.release_status))}</span><h3>${esc(g.name_zh_hant||g.name_en)}</h3><div class="en">${esc(g.name_en)}</div>${Array.isArray(g.gameplay_tags)&&g.gameplay_tags.length?`<div class="gameplay-row">${renderGameplayTags(g,3)}</div>`:''}<div class="card-release-row"><span class="card-release-icon">📅</span><span class="card-release-label">上市 / Release</span><strong class="card-release-date ${g.release_date?'':'tba'}">${esc(releaseText)}</strong></div><div class="tags">${(g.platforms||[]).slice(0,4).map(p=>`<span class="tag">${esc(p.platform)}</span>`).join('')||'<span class="tag">平台待同步</span>'}</div><div class="game-stats"><div><small>最低價</small><b>${g.price?money(g.price.current_price,g.price.currency):'—'}</b></div><div><small>評價</small><b>${g.review?.positive_percentage!=null?`${Number(g.review.positive_percentage)}%`:'—'}</b></div><div><small>Live</small><b>${g.live?Number(g.live.viewer_count).toLocaleString():'—'}</b></div></div><div class="card-actions"><button class="btn primary open-game" data-slug="${esc(g.slug)}">預覽 / Preview</button>${g.official_website_url?`<button class="btn official" data-url="${esc(g.official_website_url)}">官方 ↗</button>`:''}</div></article>`;}
function bindCards(){document.querySelectorAll('.open-game').forEach(b=>{if(b.dataset.previewBound==='1')return;b.dataset.previewBound='1';b.onclick=e=>{e.stopPropagation();showGamePreview(b.dataset.slug);};});document.querySelectorAll('.official').forEach(b=>b.onclick=e=>{e.stopPropagation();window.open(b.dataset.url,'_blank','noopener,noreferrer')});document.querySelectorAll('[data-gameplay-tag]').forEach(chip=>{if(chip.dataset.filterBound==='1')return;chip.dataset.filterBound='1';chip.onclick=e=>{e.stopPropagation();const key=chip.dataset.gameplayTag;if(!state.gameplayFilters.includes(key))state.gameplayFilters=[...state.gameplayFilters,key];saveGameplayFilters();state.page=0;closeGamePreview();location.hash='games';};});bindCoverImages();}

async function pageDashboard(){
  const now=new Date();
  const nowIso=now.toISOString();
  const since=new Date(now.getTime()-24*3600e3).toISOString();
  const [countsRes,upcomingRes,recentRes,priceRes,issueRes,changeRes,healthRes]=await Promise.all([
    loadGameFilterCounts(),
    supabase.from('games').select('*').gte('release_date',nowIso).neq('release_status','released').neq('release_status','cancelled').order('release_date',{ascending:true}).limit(6),
    supabase.from('games').select('*').eq('release_status','released').order('updated_at',{ascending:false}).limit(6),
    supabase.from('store_products').select('*,games!inner(slug,name_en,name_zh_hant,cover_url)').eq('region','TW').gt('discount_percent',0).order('discount_percent',{ascending:false}).limit(6),
    supabase.from('game_issues').select('*,games!inner(slug,name_en,name_zh_hant,cover_url)').eq('resolved',false).order('mention_count_24h',{ascending:false}).limit(6),
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
            <div class="dashboard-signal-game"><span class="dashboard-thumb native-cover">${gameCoverInner(x.games||{})}</span><span><small class="issue-game-label">遊戲 / Game</small><strong>${esc(x.games?.name_zh_hant||x.games?.name_en)}</strong><small>問題 / Issue：${esc(x.title_zh||x.issue_category)} / ${esc(x.title_en||x.issue_category)}</small></span></div>
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
  if(state.gameplayFilters.length)q=q.contains('gameplay_tags',state.gameplayFilters);
  if(state.search.trim()){const safe=state.search.replace(/[%,()]/g,'');q=q.or(`name_en.ilike.%${safe}%,name_zh_hant.ilike.%${safe}%,original_name.ilike.%${safe}%`)}
  q=q.order('release_date',{ascending:false,nullsFirst:false}).range(state.page*state.pageSize,state.page*state.pageSize+state.pageSize-1);
  const {data,count,error}=await q;if(error)throw error;
  const games=await hydrateGames(data||[]);
  const pages=Math.max(1,Math.ceil((count||0)/state.pageSize));
  pageEl().innerHTML=`${header('已上市遊戲 / Released Games','只顯示已經正式上市的遊戲；未上市、預購與已公布遊戲統一移到「上市情報」。')}<div class="game-filter-summary released-summary"><div><span>分類 / Category</span><strong>✓ 已上市 / Released</strong></div><div><span>遊戲數量 / Games</span><strong>${(count||0).toLocaleString()} 款</strong></div><div><span>玩法條件 / Gameplay AND</span><strong>${esc(gameplayFilterSummary())}</strong></div><div><span>目前頁數 / Page</span><strong>${state.page+1} / ${pages}</strong></div></div><div class="gameplay-filter-section">${gameplayFilterControl('gameplay-filter')}</div><div class="toolbar gameplay-toolbar"><input class="control" id="game-search" value="${esc(state.search)}" placeholder="搜尋已上市遊戲…"><button class="btn" id="search-btn">搜尋 / Search</button>${state.search?'<button class="btn ghost" id="clear-search">清除 / Clear</button>':''}<button class="btn ghost" id="open-release-center">查看未上市 / Upcoming →</button></div><div class="grid">${games.map(gameCard).join('')||'<div class="empty">沒有符合條件的已上市遊戲。</div>'}</div><div class="pagination"><button class="btn" id="prev" ${state.page===0?'disabled':''}>← 上一頁</button><span class="page-indicator">第 ${state.page+1} / ${pages} 頁</span><button class="btn" id="next" ${state.page+1>=pages?'disabled':''}>下一頁 →</button></div>`;
  bindCards();
  bindGameplayFilter('gameplay-filter',()=>{state.page=0;pageGames();});
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
  if(state.gameplayFilters.length)q=q.contains('gameplay_tags',state.gameplayFilters);
  if(state.search.trim()){const safe=state.search.replace(/[%,()]/g,'');q=q.or(`name_en.ilike.%${safe}%,name_zh_hant.ilike.%${safe}%,original_name.ilike.%${safe}%`)}
  q=applyReleaseSort(q,state.releaseFilter).range(state.releasePage*state.pageSize,state.releasePage*state.pageSize+state.pageSize-1);
  const {data,count,error}=await q;if(error)throw error;
  const games=await hydrateGames(data||[]);
  const pages=Math.max(1,Math.ceil((count||0)/state.pageSize));
  const active=releaseFilterInfo(state.releaseFilter);
  pageEl().innerHTML=`${header('上市情報 / Upcoming & Announced','所有尚未正式上市的遊戲集中在這裡，並以互斥規則分類，每款遊戲只會出現在一個狀態。')}${renderReleaseFilterTabs(counts)}<div class="release-priority-note">分類優先順序 / Priority：<b>預購中</b> → <b>延期</b> → <b>搶先體驗</b> → <b>即將上市</b> → <b>已公布</b> → <b>日期待定</b></div><div class="game-filter-summary"><div><span>目前分類 / Category</span><strong>${active.icon} ${active.zh} / ${active.en}</strong></div><div><span>符合條件 / Results</span><strong>${(count||0).toLocaleString()} 款</strong></div><div><span>玩法條件 / Gameplay AND</span><strong>${esc(gameplayFilterSummary())}</strong></div><div><span>目前頁數 / Page</span><strong>${state.releasePage+1} / ${pages}</strong></div></div><div class="gameplay-filter-section">${gameplayFilterControl('release-gameplay-filter')}</div><div class="toolbar gameplay-toolbar"><input class="control" id="release-search" value="${esc(state.search)}" placeholder="在「${active.zh}」中搜尋…"><button class="btn" id="release-search-btn">搜尋 / Search</button>${state.search?'<button class="btn ghost" id="release-clear-search">清除 / Clear</button>':''}<button class="btn ghost" id="open-released-games">已上市遊戲 →</button></div><div class="grid">${games.map(gameCard).join('')||'<div class="empty">這個分類目前沒有符合條件的遊戲。</div>'}</div><div class="pagination"><button class="btn" id="release-prev" ${state.releasePage===0?'disabled':''}>← 上一頁</button><span class="page-indicator">第 ${state.releasePage+1} / ${pages} 頁</span><button class="btn" id="release-next" ${state.releasePage+1>=pages?'disabled':''}>下一頁 →</button></div>`;
  bindCards();
  document.querySelectorAll('[data-release-filter]').forEach(b=>b.onclick=()=>{state.releaseFilter=b.dataset.releaseFilter;localStorage.setItem('game-intel-release-filter',state.releaseFilter);state.releasePage=0;pageCalendar();});
  bindGameplayFilter('release-gameplay-filter',()=>{state.releasePage=0;pageCalendar();});
  document.querySelector('#release-search-btn').onclick=()=>{state.search=document.querySelector('#release-search').value.trim();state.releasePage=0;pageCalendar()};
  document.querySelector('#release-search').onkeydown=e=>{if(e.key==='Enter')document.querySelector('#release-search-btn').click()};
  document.querySelector('#release-clear-search')?.addEventListener('click',()=>{state.search='';state.releasePage=0;pageCalendar()});
  document.querySelector('#open-released-games').onclick=()=>{state.page=0;location.hash='games'};
  document.querySelector('#release-prev').onclick=()=>{state.releasePage=Math.max(0,state.releasePage-1);pageCalendar()};
  document.querySelector('#release-next').onclick=()=>{state.releasePage++;pageCalendar()};
}

function renderPriceHistoryTrend(history,currentPrice,currentAt,currency){
  const raw=(history||[])
    .map(h=>({price:Number(h.price),at:h.captured_at}))
    .filter(x=>Number.isFinite(x.price)&&x.at)
    .sort((a,b)=>new Date(a.at)-new Date(b.at));

  const current=currentPrice==null?null:Number(currentPrice);
  const currentTime=currentAt||new Date().toISOString();
  const points=[...raw];
  const last=points.length?points[points.length-1]:null;

  if(current!=null&&Number.isFinite(current)){
    const sameAsLast=last&&Number(last.price)===current&&Math.abs(new Date(currentTime).getTime()-new Date(last.at).getTime())<6*3600000;
    if(!sameAsLast)points.push({price:current,at:currentTime,current:true});
    else last.current=true;
  }

  if(!points.length){
    return '<section class="price-history-chart-panel"><div class="empty">尚無價格歷史資料 / No price history yet</div></section>';
  }

  const prices=points.map(x=>x.price);
  const low=Math.min(...prices);
  const lowIndex=prices.indexOf(low);
  let currentIndex=points.findIndex(x=>x.current);
  if(currentIndex<0)currentIndex=points.length-1;
  points[currentIndex].current=true;

  const width=760,height=250,left=58,right=28,top=30,bottom=46;
  const innerW=width-left-right,innerH=height-top-bottom;
  const times=points.map(x=>new Date(x.at).getTime()).map((t,i)=>Number.isFinite(t)?t:i);
  const minT=Math.min(...times),maxT=Math.max(...times);
  const minP=Math.min(...prices),maxP=Math.max(...prices);
  const rangeP=Math.max(1,maxP-minP);
  const padP=Math.max(1,rangeP*.12);
  const yMin=Math.max(0,minP-padP),yMax=maxP+padP;

  const x=i=>{
    if(points.length===1||minT===maxT)return left+innerW/2;
    return left+((times[i]-minT)/(maxT-minT))*innerW;
  };
  const y=v=>top+innerH-((v-yMin)/(yMax-yMin))*innerH;
  const linePoints=points.map((p,i)=>`${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const formatPrice=v=>money(Math.round(Number(v)*100)/100,currency);
  const formatDate=v=>new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit'}).format(new Date(v));
  const formatDateTime=v=>new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v));

  const grid=[0,.25,.5,.75,1].map(r=>{
    const gy=top+innerH-innerH*r;
    const val=yMin+(yMax-yMin)*r;
    return `<line x1="${left}" y1="${gy}" x2="${width-right}" y2="${gy}" class="price-chart-grid"/><text x="${left-8}" y="${gy+3}" text-anchor="end" class="price-chart-axis">${esc(formatPrice(val))}</text>`;
  }).join('');

  const tickIndexes=[0,Math.floor((points.length-1)/2),points.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  const labels=tickIndexes.map(i=>`<text x="${x(i)}" y="${height-13}" text-anchor="middle" class="price-chart-axis">${esc(formatDate(points[i].at))}</text>`).join('');

  const lowPoint=points[lowIndex];
  const currentPoint=points[currentIndex];
  const samePoint=lowIndex===currentIndex&&Number(lowPoint.price)===Number(currentPoint.price);
  const dots=points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.price)}" r="2.5" class="price-chart-dot"/>`).join('');

  const lowMarker=`<line x1="${x(lowIndex)}" y1="${top}" x2="${x(lowIndex)}" y2="${top+innerH}" class="price-chart-low-line"/><circle cx="${x(lowIndex)}" cy="${y(lowPoint.price)}" r="5.5" class="price-chart-low"/><text x="${Math.max(left+82,Math.min(width-right-82,x(lowIndex)))}" y="${Math.max(16,y(lowPoint.price)-12)}" text-anchor="middle" class="price-chart-low-label">${samePoint?'目前＝歷史低 / Current = Low':'歷史最低 / Historical Low'} · ${esc(formatPrice(lowPoint.price))}</text>`;

  const currentMarker=samePoint?'':`<line x1="${x(currentIndex)}" y1="${top}" x2="${x(currentIndex)}" y2="${top+innerH}" class="price-chart-current-line"/><circle cx="${x(currentIndex)}" cy="${y(currentPoint.price)}" r="5.5" class="price-chart-current"/><text x="${Math.max(left+74,Math.min(width-right-74,x(currentIndex)))}" y="${Math.min(top+innerH-8,y(currentPoint.price)+20)}" text-anchor="middle" class="price-chart-current-label">目前 / Current · ${esc(formatPrice(currentPoint.price))}</text>`;

  const note=points.length===1
    ? '<div class="price-chart-note">目前只有 1 筆價格快照，歷史資料仍在累積 / Only one snapshot; history is still accumulating.</div>'
    : `<div class="price-chart-note">共 ${points.length.toLocaleString()} 個價格時間點 · 歷史最低 ${esc(formatPrice(low))}（${esc(formatDateTime(lowPoint.at))}）</div>`;

  return `<section class="price-history-chart-panel">
    <div class="section-head price-history-chart-head">
      <div><h2>價格歷史趨勢 / Price History</h2><p>依資料庫實際價格快照繪製，不補估計資料。</p></div>
      <div class="price-chart-legend"><span class="low">● 歷史最低</span><span class="current">● 目前價格</span></div>
    </div>
    <div class="price-chart-wrap">
      <svg class="price-history-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="價格歷史趨勢，歷史最低 ${esc(formatPrice(low))}，目前價格 ${esc(formatPrice(currentPoint.price))}">
        ${grid}
        ${points.length>1?`<polyline points="${linePoints}" class="price-chart-line"/>`:''}
        ${dots}
        ${lowMarker}
        ${currentMarker}
        ${labels}
      </svg>
    </div>
    ${note}
  </section>`;
}

async function showPricePreview(productId){
  if(!productId)return;
  closeGamePreview();

  const shell=document.createElement('div');
  shell.className='game-preview-backdrop';
  shell.innerHTML='<div class="game-preview-modal price-preview-modal"><button class="game-preview-close" type="button" aria-label="關閉預覽">×</button><div class="game-preview-loading"><strong>價格預覽 / Price Preview</strong><span>正在讀取商品與價格資料…</span></div></div>';
  document.body.appendChild(shell);
  shell.dataset.productId=String(productId);
  shell.querySelector('.game-preview-close').onclick=closeGamePreview;
  shell.addEventListener('click',e=>{if(e.target===shell)closeGamePreview();});

  try{
    const {data:p,error}=await supabase.from('store_products')
      .select('*,games!inner(id,slug,name_en,name_zh_hant,cover_url,release_date,release_status,gameplay_tags)')
      .eq('id',Number(productId))
      .single();
    if(error)throw error;

    const g=p.games||{};
    const title=g.name_zh_hant||g.name_en||'Game';

    const {data:history,error:histError}=await supabase.from('price_history')
      .select('price,list_price,discount_percent,currency,captured_at')
      .eq('product_id',Number(productId))
      .order('captured_at',{ascending:true});
    const hist=histError?[]:(history||[]);

    const prices=hist.map(x=>Number(x.price)).filter(Number.isFinite);
    const discounts=hist.map(x=>Number(x.discount_percent||0)).filter(x=>Number.isFinite(x)&&x>0);
    const previousHistoricalLow=prices.length?Math.min(...prices):null;
    const historicalBestDiscount=discounts.length?Math.max(...discounts):null;
    const current=p.current_price==null?null:Number(p.current_price);
    const list=p.list_price==null?null:Number(p.list_price);
    const discount=Number(p.discount_percent||0);
    const historicalLow=current!=null&&Number.isFinite(current)
      ? (previousHistoricalLow==null?current:Math.min(previousHistoricalLow,current))
      : previousHistoricalLow;

    let comparison='歷史資料累積中 / History accumulating';
    let compareClass='';
    if(previousHistoricalLow!=null&&current!=null&&Number.isFinite(current)){
      if(current<previousHistoricalLow){comparison='🔥 新歷史低價 / New historical low';compareClass='ok';}
      else if(current===previousHistoricalLow){comparison='＝ 歷史最低價 / Matches historical low';compareClass='ok';}
      else comparison=`目前比歷史最低高 ${money(current-previousHistoricalLow,p.currency)}`;
    }

    const offerEnd=(()=>{
      if(discount<=0)return {main:'目前無優惠',sub:'No active offer'};
      if(!p.sale_end)return {main:'期限未提供',sub:'Official end date unavailable'};
      const ms=new Date(p.sale_end).getTime()-Date.now();
      if(ms<=0)return {main:'優惠已結束',sub:fmtDate(p.sale_end,true)};
      const hours=Math.max(0,Math.floor(ms/3600000));
      const days=Math.floor(hours/24);
      return {main:days>0?`剩 ${days} 天 ${hours%24} 小時`:`剩 ${hours} 小時`,sub:`至 ${fmtDate(p.sale_end,true)}`};
    })();

    let chartHtml='';
    try{
      chartHtml=renderPriceHistoryTrend(hist,p.current_price,p.updated_at,p.currency);
    }catch(chartError){
      console.error('price history chart failed',chartError);
      chartHtml='<section class="price-history-chart-panel"><div class="empty">價格歷史圖暫時無法顯示，但價格預覽仍可使用。</div></section>';
    }

    shell.innerHTML=`<div class="game-preview-modal price-preview-modal" role="dialog" aria-modal="true" aria-label="${esc(title)} 價格預覽">
      <button class="game-preview-close" type="button" aria-label="關閉預覽">×</button>
      <div class="price-preview-hero">
        <div class="price-preview-cover native-cover">${gameCoverInner(g)}</div>
        <div class="price-preview-title">
          <span class="badge ${statusClass(g.release_status)}">${esc(statusZh(g.release_status))}</span>
          <h2>${esc(title)}</h2>
          <p>${esc(g.name_en||'')}</p>
          <div class="price-labels">
            <span class="store-badge">${esc(p.platform||'Platform')}</span>
            <span class="store-badge">${esc(p.store||'Store')}</span>
            <span class="store-badge">${esc(p.edition||'Edition')}</span>
          </div>
        </div>
      </div>

      <div class="price-preview-grid">
        <div><small>原價 / List</small><strong>${list==null?'—':money(list,p.currency)}</strong></div>
        <div><small>現價 / Current</small><strong>${current==null?'—':money(current,p.currency)}</strong>${discount>0?`<span class="badge ok">-${discount}%</span>`:''}</div>
        <div><small>優惠期限 / Offer ends</small><strong>${esc(offerEnd.main)}</strong><span>${esc(offerEnd.sub)}</span></div>
        <div><small>歷史最低 / Historical low</small><strong>${historicalLow==null?'—':money(historicalLow,p.currency)}</strong></div>
        <div><small>歷史最大折扣 / Best discount</small><strong>${historicalBestDiscount==null?'—':`-${historicalBestDiscount}%`}</strong></div>
        <div><small>價格快照 / Snapshots</small><strong>${hist.length.toLocaleString()}</strong></div>
      </div>

      <div class="price-preview-comparison">
        <small>與之前優惠相比 / vs Previous deals</small>
        <strong class="${compareClass}">${esc(comparison)}</strong>
      </div>

      ${chartHtml}

      ${Array.isArray(g.gameplay_tags)&&g.gameplay_tags.length?`<div class="game-preview-gameplay"><small>玩法分類 / Gameplay</small><div class="gameplay-row">${renderGameplayTags(g,8)}</div></div>`:''}

      <div class="game-preview-actions">
        <button class="btn" id="price-preview-close">關閉 / Close</button>
        <button class="btn" id="price-preview-game">遊戲情報 / Game details</button>
        ${p.store_url?`<button class="btn primary" id="price-preview-store">前往商店 / Store ↗</button>`:''}
      </div>
    </div>`;

    shell.querySelector('.game-preview-close').onclick=closeGamePreview;
    shell.querySelector('#price-preview-close').onclick=closeGamePreview;
    shell.querySelector('#price-preview-game').onclick=()=>{closeGamePreview();location.hash=`game/${g.slug}`;};
    shell.querySelector('#price-preview-store')?.addEventListener('click',()=>window.open(p.store_url,'_blank','noopener,noreferrer'));
    bindCoverImages(shell);
    bindCards();
  }catch(err){
    shell.innerHTML=`<div class="game-preview-modal price-preview-modal"><button class="game-preview-close" type="button">×</button><div class="empty">價格預覽讀取失敗：${esc(err?.message||String(err))}</div></div>`;
    shell.querySelector('.game-preview-close').onclick=closeGamePreview;
  }
}

function bindPricePreviews(){
  document.querySelectorAll('[data-price-preview]').forEach(btn=>{
    if(btn.dataset.pricePreviewBound==='1')return;
    btn.dataset.pricePreviewBound='1';
    btn.type='button';
    btn.onclick=e=>{
      e.preventDefault();
      e.stopPropagation();
      const productId=btn.dataset.pricePreview;
      if(!productId){
        toast('價格預覽缺少商品 ID / Missing product ID',true);
        return;
      }
      location.hash=`price/${productId}`;
    };
  });
}
window.__showPricePreview=productId=>{location.hash=`price/${productId}`;};
async function pagePrice(productId){
  const id=Number(productId);
  if(!Number.isFinite(id)||id<=0){location.hash='prices';return;}

  pageEl().innerHTML=`${header('價格預覽 / Price Preview','商品價格、歷史最低價與價格趨勢。')}<div class="panel"><div class="game-preview-loading"><strong>價格預覽 / Price Preview</strong><span>正在讀取商品與價格資料…</span></div></div>`;

  const {data:p,error}=await supabase.from('store_products')
    .select('*,games!inner(id,slug,name_en,name_zh_hant,cover_url,release_date,release_status,gameplay_tags)')
    .eq('id',id)
    .single();
  if(error)throw error;

  const {data:history,error:histError}=await supabase.from('price_history')
    .select('price,list_price,discount_percent,currency,captured_at')
    .eq('product_id',id)
    .order('captured_at',{ascending:true});
  if(histError)throw histError;

  const g=p.games||{};
  const hist=history||[];
  const prices=hist.map(x=>Number(x.price)).filter(Number.isFinite);
  const discounts=hist.map(x=>Number(x.discount_percent||0)).filter(x=>Number.isFinite(x)&&x>0);
  const previousHistoricalLow=prices.length?Math.min(...prices):null;
  const historicalBestDiscount=discounts.length?Math.max(...discounts):null;
  const current=p.current_price==null?null:Number(p.current_price);
  const list=p.list_price==null?null:Number(p.list_price);
  const discount=Number(p.discount_percent||0);
  const historicalLow=current!=null&&Number.isFinite(current)
    ? (previousHistoricalLow==null?current:Math.min(previousHistoricalLow,current))
    : previousHistoricalLow;

  let comparison='歷史資料累積中 / History accumulating';
  let compareClass='';
  if(previousHistoricalLow!=null&&current!=null&&Number.isFinite(current)){
    if(current<previousHistoricalLow){comparison='🔥 新歷史低價 / New historical low';compareClass='ok';}
    else if(current===previousHistoricalLow){comparison='＝ 歷史最低價 / Matches historical low';compareClass='ok';}
    else comparison=`目前比歷史最低高 ${money(current-previousHistoricalLow,p.currency)}`;
  }

  const offerEnd=(()=>{
    if(discount<=0)return {main:'目前無優惠',sub:'No active offer'};
    if(!p.sale_end)return {main:'期限未提供',sub:'Official end date unavailable'};
    const ms=new Date(p.sale_end).getTime()-Date.now();
    if(ms<=0)return {main:'優惠已結束',sub:fmtDate(p.sale_end,true)};
    const hours=Math.max(0,Math.floor(ms/3600000));
    const days=Math.floor(hours/24);
    return {main:days>0?`剩 ${days} 天 ${hours%24} 小時`:`剩 ${hours} 小時`,sub:`至 ${fmtDate(p.sale_end,true)}`};
  })();

  let chartHtml='';
  try{chartHtml=renderPriceHistoryTrend(hist,p.current_price,p.updated_at,p.currency);}
  catch(err){
    console.error('price history chart failed',err);
    chartHtml='<section class="price-history-chart-panel"><div class="empty">價格歷史圖暫時無法顯示，但價格資料仍可查看。</div></section>';
  }

  const title=g.name_zh_hant||g.name_en||'Game';
  pageEl().innerHTML=`${header('價格預覽 / Price Preview','商品價格、歷史最低價與價格趨勢。')}
    <section class="price-detail-page panel">
      <div class="price-preview-hero">
        <div class="price-preview-cover native-cover">${gameCoverInner(g)}</div>
        <div class="price-preview-title">
          <span class="badge ${statusClass(g.release_status)}">${esc(statusZh(g.release_status))}</span>
          <h2>${esc(title)}</h2>
          <p>${esc(g.name_en||'')}</p>
          <div class="price-labels">
            <span class="store-badge">${esc(p.platform||'Platform')}</span>
            <span class="store-badge">${esc(p.store||'Store')}</span>
            <span class="store-badge">${esc(p.edition||'Edition')}</span>
          </div>
        </div>
      </div>

      <div class="price-preview-grid">
        <div><small>原價 / List</small><strong>${list==null?'—':money(list,p.currency)}</strong></div>
        <div><small>現價 / Current</small><strong>${current==null?'—':money(current,p.currency)}</strong>${discount>0?`<span class="badge ok">-${discount}%</span>`:''}</div>
        <div><small>優惠期限 / Offer ends</small><strong>${esc(offerEnd.main)}</strong><span>${esc(offerEnd.sub)}</span></div>
        <div><small>歷史最低 / Historical low</small><strong>${historicalLow==null?'—':money(historicalLow,p.currency)}</strong></div>
        <div><small>歷史最大折扣 / Best discount</small><strong>${historicalBestDiscount==null?'—':`-${historicalBestDiscount}%`}</strong></div>
        <div><small>價格快照 / Snapshots</small><strong>${hist.length.toLocaleString()}</strong></div>
      </div>

      <div class="price-preview-comparison">
        <small>與之前優惠相比 / vs Previous deals</small>
        <strong class="${compareClass}">${esc(comparison)}</strong>
      </div>

      ${chartHtml}

      ${Array.isArray(g.gameplay_tags)&&g.gameplay_tags.length?`<div class="game-preview-gameplay"><small>玩法分類 / Gameplay</small><div class="gameplay-row">${renderGameplayTags(g,8)}</div></div>`:''}

      <div class="game-preview-actions">
        <a class="btn" href="#prices">← 返回價格 / Back to Prices</a>
        <a class="btn" href="#game/${esc(g.slug)}">遊戲情報 / Game details</a>
        ${p.store_url?`<button class="btn primary" id="price-detail-store">前往商店 / Store ↗</button>`:''}
      </div>
    </section>`;

  document.querySelector('#price-detail-store')?.addEventListener('click',()=>window.open(p.store_url,'_blank','noopener,noreferrer'));
  bindCoverImages(pageEl());
  bindCards();
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
          <a class="price-cover native-cover price-preview-link" href="#price/${esc(x.id)}" aria-label="價格預覽 ${esc(game.name_zh_hant||game.name_en)}">${gameCoverInner(game)}</a>
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
            <a class="btn primary price-preview-link" href="#price/${esc(x.id)}">價格預覽 / Price Preview</a>
            ${x.store_url?`<button class="btn" data-url="${esc(x.store_url)}">前往商店 ↗</button>`:''}
          </div>
        </article>`;
      }).join('')||'<div class="empty">尚無價格資料</div>'}
    </div>`;
  bindCards();
  document.querySelectorAll('[data-url]').forEach(b=>b.onclick=()=>window.open(b.dataset.url,'_blank','noopener,noreferrer'));
}

async function loadIssueTrend(gameId){
  try{
    const {data,error}=await supabase.functions.invoke('sync-game-issue-trend',{body:{game_id:Number(gameId)}});
    if(!error&&data?.ok&&Array.isArray(data.hours))return {data,message:'',live:true};
    const message=data?.error||error?.message||'即時趨勢暫時無法更新';
    const fallback=await loadStoredIssueTrend(gameId);
    return fallback.data?{data:fallback.data,message:`${message}；顯示最近已保存資料`,live:false}:{data:null,message,live:false};
  }catch(err){
    const fallback=await loadStoredIssueTrend(gameId);
    return fallback.data?{data:fallback.data,message:'即時更新失敗；顯示最近已保存資料',live:false}:{data:null,message:err?.message||'趨勢讀取失敗',live:false};
  }
}
async function loadStoredIssueTrend(gameId){
  const hourMs=3600000;
  const currentHour=Math.floor(Date.now()/hourMs)*hourMs;
  const startHour=currentHour-23*hourMs;
  const {data,error}=await supabase.from('issue_hourly_mentions')
    .select('bucket_start,mention_count,issue_category,sample_size,captured_at')
    .eq('game_id',Number(gameId))
    .gte('bucket_start',new Date(startHour).toISOString())
    .order('bucket_start',{ascending:true});
  if(error||!(data||[]).length)return {data:null,error};
  const byHour=new Map();
  let sampleReviews=0;
  for(const row of data||[]){
    const key=new Date(row.bucket_start).toISOString();
    byHour.set(key,(byHour.get(key)||0)+Number(row.mention_count||0));
    sampleReviews=Math.max(sampleReviews,Number(row.sample_size||0));
  }
  const hours=Array.from({length:24},(_,i)=>{
    const bucket_start=new Date(startHour+i*hourMs).toISOString();
    return {bucket_start,total:byHour.get(bucket_start)||0,categories:{}};
  });
  const peak=hours.reduce((best,row)=>row.total>best.total?row:best,hours[0]);
  return {data:{ok:true,source:'Stored hourly issue data',sample_reviews:sampleReviews,hours,peak}};
}
function issueTrendTimeLabel(value){
  if(!value)return '—';
  return new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}
function issueTrendHourLabel(value){
  return new Intl.DateTimeFormat('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}
function renderIssueTrendChart(trend,message=''){
  const hours=Array.isArray(trend?.hours)?trend.hours:[];
  if(!hours.length)return `<section class="issue-trend-panel"><div class="empty">${esc(message||'目前沒有 24 小時趨勢資料。')}</div></section>`;
  const totals=hours.map(x=>Number(x.total||0));
  const rawMax=Math.max(...totals,0);
  const max=Math.max(1,rawMax);
  const width=760,height=230,left=42,right=18,top=24,bottom=38;
  const innerW=width-left-right,innerH=height-top-bottom;
  const x=i=>left+(hours.length<=1?0:(i/(hours.length-1))*innerW);
  const y=v=>top+innerH-(Number(v||0)/max)*innerH;
  const points=hours.map((h,i)=>`${x(i).toFixed(1)},${y(h.total).toFixed(1)}`).join(' ');
  const peakIndex=totals.indexOf(rawMax);
  const peak=hours[Math.max(0,peakIndex)]||hours[0];
  const peakX=x(Math.max(0,peakIndex)),peakY=y(peak.total);
  const grid=[0,.25,.5,.75,1].map(r=>{
    const gy=top+innerH-innerH*r;
    const val=Math.round(max*r);
    return `<line x1="${left}" y1="${gy}" x2="${width-right}" y2="${gy}" class="issue-chart-grid"/><text x="${left-8}" y="${gy+3}" text-anchor="end" class="issue-chart-axis">${val}</text>`;
  }).join('');
  const labels=hours.map((h,i)=>i%4===0||i===hours.length-1?`<text x="${x(i)}" y="${height-12}" text-anchor="middle" class="issue-chart-axis">${esc(issueTrendHourLabel(h.bucket_start))}</text>`:'').join('');
  const area=`${left},${top+innerH} ${points} ${width-right},${top+innerH}`;
  const peakText=rawMax>0?`${esc(issueTrendHourLabel(peak.bucket_start))} · ${Number(peak.total).toLocaleString()}`:'尚無提及';
  return `<section class="issue-trend-panel">
    <div class="section-head issue-trend-head">
      <div><h2>24 小時問題提及趨勢 / 24H Mentions</h2><p>依最近 Steam 負評樣本逐小時統計；同一則評論若符合多個問題類型，會計入多個提及。</p></div>
      <div class="issue-peak-card"><small>高峰時間 / Peak</small><strong>${rawMax>0?esc(issueTrendTimeLabel(peak.bucket_start)):'—'}</strong><span>${rawMax.toLocaleString()} 次提及</span></div>
    </div>
    ${message?`<div class="issue-trend-note">${esc(message)}</div>`:''}
    <div class="issue-trend-meta"><span>樣本負評 / Sample reviews <b>${Number(trend.sample_reviews||0).toLocaleString()}</b></span><span>資料來源 / Source <b>${esc(trend.source||'Steam')}</b></span></div>
    <div class="issue-chart-wrap">
      <svg class="issue-trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="最近 24 小時問題提及量趨勢，高峰 ${peakText}">
        <polygon points="${area}" class="issue-chart-area"/>
        ${grid}
        <polyline points="${points}" class="issue-chart-line"/>
        ${rawMax>0?`<line x1="${peakX}" y1="${top}" x2="${peakX}" y2="${top+innerH}" class="issue-chart-peak-line"/><circle cx="${peakX}" cy="${peakY}" r="5" class="issue-chart-peak"/><text x="${Math.min(width-right-70,Math.max(left+70,peakX))}" y="${Math.max(15,peakY-10)}" text-anchor="middle" class="issue-chart-peak-label">${peakText}</text>`:''}
        ${labels}
      </svg>
    </div>
  </section>`;
}
async function pageIssues(){
  const selectFields='*,games!inner(id,slug,name_en,name_zh_hant,cover_url)';
  const optionPromise=supabase.from('game_issues')
    .select('game_id,mention_count_24h,games!inner(id,slug,name_en,name_zh_hant,cover_url)')
    .eq('resolved',false)
    .order('mention_count_24h',{ascending:false})
    .limit(1200);

  let rows=[];
  let issueError=null;
  const search=state.issueSearch.trim();

  if(state.issueGame!=='all'){
    const r=await supabase.from('game_issues')
      .select(selectFields)
      .eq('resolved',false)
      .eq('game_id',state.issueGame)
      .order('mention_count_24h',{ascending:false})
      .limit(200);
    rows=r.data||[];
    issueError=r.error;
  }else if(search){
    const safe=search.replace(/[%,()]/g,'').trim();
    const gameMatch=await supabase.from('games')
      .select('id')
      .or(`name_en.ilike.%${safe}%,name_zh_hant.ilike.%${safe}%,original_name.ilike.%${safe}%`)
      .limit(100);
    if(gameMatch.error)throw gameMatch.error;
    const ids=(gameMatch.data||[]).map(g=>g.id);
    if(ids.length){
      const r=await supabase.from('game_issues')
        .select(selectFields)
        .eq('resolved',false)
        .in('game_id',ids)
        .order('mention_count_24h',{ascending:false})
        .limit(1000);
      rows=r.data||[];
      issueError=r.error;
    }
  }else{
    const r=await supabase.from('game_issues')
      .select(selectFields)
      .eq('resolved',false)
      .order('mention_count_24h',{ascending:false})
      .limit(300);
    rows=r.data||[];
    issueError=r.error;
  }
  if(issueError)throw issueError;

  const optionResult=await optionPromise;
  if(optionResult.error)throw optionResult.error;

  const optionMap=new Map();
  for(const x of [...(optionResult.data||[]),...rows]){
    const g=x.games;
    if(!g||optionMap.has(String(x.game_id)))continue;
    optionMap.set(String(x.game_id),{
      id:String(x.game_id),
      slug:g.slug||'',
      cover_url:g.cover_url||'',
      zh:g.name_zh_hant||'',
      en:g.name_en||'',
      label:g.name_zh_hant&&g.name_en&&g.name_zh_hant!==g.name_en
        ? `${g.name_zh_hant} / ${g.name_en}`
        : (g.name_zh_hant||g.name_en||'Unknown')
    });
  }
  const gameOptions=[...optionMap.values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-Hant'));
  const shownGames=new Set(rows.map(x=>String(x.game_id))).size;
  const currentGame=state.issueGame==='all'?null:optionMap.get(String(state.issueGame));
  const selectedProblemCount=currentGame?rows.length:0;
  const selectedMentions24h=currentGame?rows.reduce((sum,x)=>sum+Number(x.mention_count_24h||0),0):0;
  const selectedTopIssue=currentGame&&rows.length
    ? [...rows].sort((a,b)=>Number(b.mention_count_24h||0)-Number(a.mention_count_24h||0))[0]
    : null;
  const selectedLatest=currentGame
    ? rows.reduce((latest,x)=>{
        const value=x.last_seen||x.first_seen||null;
        if(!value)return latest;
        if(!latest||new Date(value)>new Date(latest))return value;
        return latest;
      },null)
    : null;
  let selectedTrend=null;
  let selectedTrendMessage='';
  if(currentGame){
    const trendResult=await loadIssueTrend(state.issueGame);
    selectedTrend=trendResult.data;
    selectedTrendMessage=trendResult.message||'';
  }

  pageEl().innerHTML=`${header('玩家問題 / Issues','可用中文或英文遊戲名稱搜尋，也能直接篩選某款遊戲查看它的所有未解決問題。')}
    <section class="issue-filter-panel">
      <div class="issue-filter-controls">
        <label class="issue-search-box">
          <span>遊戲名稱搜尋 / Search game</span>
          <input class="control" id="issue-search" value="${esc(state.issueSearch)}" placeholder="輸入中文或 English 遊戲名稱…">
        </label>
        <label class="issue-select-box">
          <span>遊戲篩選 / Filter game</span>
          <select class="control" id="issue-game-filter">
            <option value="all">全部遊戲 / All games</option>
            ${gameOptions.map(g=>`<option value="${esc(g.id)}" ${String(state.issueGame)===g.id?'selected':''}>${esc(g.label)}</option>`).join('')}
          </select>
        </label>
        <button class="btn primary" id="issue-search-btn">搜尋 / Search</button>
        <button class="btn ghost" id="issue-clear-btn">清除 / Clear</button>
      </div>
      <div class="issue-filter-summary">
        <div><small>目前條件 / Filter</small><strong>${currentGame?esc(currentGame.label):(search?`名稱包含「${esc(search)}」`:'全部問題 / All issues')}</strong></div>
        <div><small>遊戲 / Games</small><strong>${shownGames.toLocaleString()}</strong></div>
        <div><small>問題 / Issues</small><strong>${rows.length.toLocaleString()}</strong></div>
      </div>
    </section>
    ${currentGame?`<section class="selected-game-issue-summary">
      <button class="selected-game-identity open-game" data-slug="${esc(currentGame.slug)}">
        <span class="selected-game-cover native-cover">${gameCoverInner(currentGame)}</span>
        <span>
          <small>已選遊戲 / Selected game</small>
          <strong>${esc(currentGame.zh||currentGame.en)}</strong>
          <em>${esc(currentGame.en||'')}</em>
        </span>
      </button>
      <div class="selected-issue-metric">
        <small>問題總數 / Total issues</small>
        <strong>${selectedProblemCount.toLocaleString()}</strong>
        <span>目前未解決問題類型</span>
      </div>
      <div class="selected-issue-metric selected-issue-top">
        <small>最常見問題 / Top issue</small>
        <strong>${selectedTopIssue?esc(selectedTopIssue.title_zh||selectedTopIssue.issue_category):'—'}</strong>
        <span>${selectedTopIssue?esc(selectedTopIssue.title_en||selectedTopIssue.issue_category):'No issue data'}${selectedTopIssue?` · 24H ${Number(selectedTopIssue.mention_count_24h||0).toLocaleString()}`:''}</span>
      </div>
      <div class="selected-issue-metric">
        <small>24H 提及總量 / Mentions</small>
        <strong>${selectedMentions24h.toLocaleString()}</strong>
        <span>所有問題合計</span>
      </div>
      <div class="selected-issue-metric">
        <small>最近更新 / Last update</small>
        <strong class="selected-update-time">${selectedLatest?fmtDate(selectedLatest,true):'—'}</strong>
        <span>${selectedLatest?'最後問題活動時間':'尚無更新時間'}</span>
      </div>
    </section>`:''}
    ${currentGame?renderIssueTrendChart(selectedTrend,selectedTrendMessage):''}
    <div class="issue-list">
      ${rows.map(x=>`<article class="issue-game-card">
        <button class="issue-game-preview open-game" data-slug="${esc(x.games?.slug)}" aria-label="預覽 ${esc(x.games?.name_zh_hant||x.games?.name_en)}">
          <span class="issue-game-cover native-cover">${gameCoverInner(x.games||{})}</span>
          <span class="issue-game-info">
            <small class="issue-game-label">遊戲 / Game</small>
            <strong class="issue-game-name">${esc(x.games?.name_zh_hant||x.games?.name_en)}</strong>
            <span class="issue-game-en">${esc(x.games?.name_en||'')}</span>
          </span>
        </button>
        <div class="issue-problem">
          <small>問題 / Issue</small>
          <strong>${esc(x.title_zh||x.issue_category)}</strong>
          <span>${esc(x.title_en||x.issue_category)}</span>
          <span class="badge ${x.official_confirmed?'ok':''}">${esc(x.issue_category)}${x.official_confirmed?' · 官方確認 / Confirmed':' · 追蹤中 / Tracking'}</span>
        </div>
        <div class="issue-number">
          <small>24H 提及 / Mentions</small>
          <strong>${Number(x.mention_count_24h||0).toLocaleString()}</strong>
        </div>
        <div class="issue-number">
          <small>24H 成長 / Growth</small>
          <strong>${x.growth_24h!=null?`${Number(x.growth_24h)>0?'+':''}${Number(x.growth_24h)}%`:'—'}</strong>
        </div>
        <div class="issue-card-actions">
          <button class="btn issue-filter-game" data-game-id="${esc(x.game_id)}">只看此遊戲 / Filter</button>
          <button class="btn primary open-game" data-slug="${esc(x.games?.slug)}">預覽 / Preview</button>
        </div>
      </article>`).join('')||'<div class="empty">沒有符合目前搜尋或篩選條件的玩家問題。</div>'}
    </div>`;

  bindCards();

  const searchInput=document.querySelector('#issue-search');
  document.querySelector('#issue-search-btn').onclick=()=>{
    state.issueSearch=searchInput.value.trim();
    state.issueGame='all';
    pageIssues();
  };
  searchInput.onkeydown=e=>{if(e.key==='Enter')document.querySelector('#issue-search-btn').click();};

  document.querySelector('#issue-game-filter').onchange=e=>{
    state.issueGame=e.target.value;
    if(state.issueGame!=='all')state.issueSearch='';
    pageIssues();
  };

  document.querySelector('#issue-clear-btn').onclick=()=>{
    state.issueSearch='';
    state.issueGame='all';
    pageIssues();
  };

  document.querySelectorAll('.issue-filter-game').forEach(b=>b.onclick=()=>{
    state.issueGame=b.dataset.gameId;
    state.issueSearch='';
    pageIssues();
  });
}
async function pageLive(){const {data,error}=await supabase.from('streaming_snapshots').select('*,games!inner(slug,name_en,name_zh_hant)').order('captured_at',{ascending:false}).limit(1000);if(error)throw error;const latest=new Map();for(const x of data||[]){const k=`${x.game_id}:${x.source}`;if(!latest.has(k))latest.set(k,x)}const combined=new Map();for(const x of latest.values()){const k=String(x.game_id),cur=combined.get(k)||{game:x.games,viewers:0,channels:0,sources:[]};cur.viewers+=Number(x.viewer_count);cur.channels+=Number(x.channel_count);cur.sources.push(x.source);combined.set(k,cur)}const rows=[...combined.values()].sort((a,b)=>b.viewers-a.viewers);pageEl().innerHTML=`${header('直播熱度 / Live Trends','Twitch + YouTube 分開採集，排行榜顯示合計觀看與頻道數。')}<div class="panel">${rows.map((x,i)=>`<div class="rank-row"><span class="rank">${String(i+1).padStart(2,'0')}</span><div><b>${esc(x.game?.name_zh_hant||x.game?.name_en)}</b><div class="sub">${esc(x.sources.join(' + '))}</div></div><b>${x.viewers.toLocaleString()}</b><span>${x.channels.toLocaleString()} 頻道</span></div>`).join('')||'<div class="empty">尚未取得直播快照；接通 Twitch / YouTube 同步後會自動累積。</div>'}</div>`;}

async function pageChanges(){const {data,error}=await supabase.from('change_events').select('*,games(name_zh_hant,name_en,slug)').order('detected_at',{ascending:false}).limit(300);if(error)throw error;pageEl().innerHTML=`${header('重大變化 / Changes','只記錄達到門檻的上市、價格、評價、問題與直播事件。')}<div class="panel">${(data||[]).map(x=>`<div class="timeline-row" style="grid-template-columns:120px minmax(220px,1fr) 1fr"><div><span class="badge ${x.severity==='critical'?'danger':x.severity==='high'?'warn':''}">${esc(eventZh(x.event_type))}</span><div class="sub" style="margin-top:5px">${fmtDate(x.detected_at,true)}</div></div><div><b>${esc(x.games?.name_zh_hant||x.games?.name_en||'系統事件')}</b><div class="sub">${esc(x.games?.name_en||'')}</div></div><code class="sub">${esc(JSON.stringify(x.new_value||{}))}</code></div>`).join('')||'<div class="empty">目前沒有重大變化。</div>'}</div>`;}

async function pageWatchlist(){const uid=state.session.user.id;const {data,error}=await supabase.from('watchlist').select('*,games!inner(slug,name_en,name_zh_hant,release_date)').eq('user_id',uid).order('created_at',{ascending:false});if(error)throw error;pageEl().innerHTML=`${header('我的收藏 / Watchlist','收藏遊戲與個人通知條件。')}<div class="panel">${(data||[]).map(x=>`<div class="price-row" style="grid-template-columns:minmax(220px,1fr) 120px 1fr 80px"><div><b>${esc(x.games?.name_zh_hant||x.games?.name_en)}</b><div class="sub">${esc(x.games?.name_en)} · ${fmtDate(x.games?.release_date)}</div></div><span>目標 ${x.target_price!=null?money(x.target_price):'未設定'}</span><span class="sub">${[['上市',x.notify_release],['預購',x.notify_preorder],['價格',x.notify_price],['評價',x.notify_reviews],['問題',x.notify_issues],['直播',x.notify_streams]].filter(y=>y[1]).map(y=>y[0]).join(' · ')||'未開通知'}</span><button class="btn danger remove-watch" data-id="${x.id}">移除</button></div>`).join('')||'<div class="empty">尚未收藏遊戲。可在遊戲詳細頁加入收藏。</div>'}</div>`;document.querySelectorAll('.remove-watch').forEach(b=>b.onclick=async()=>{const {error}=await supabase.from('watchlist').delete().eq('id',b.dataset.id);if(error)toast(error.message,true);else{toast('已移除收藏');pageWatchlist();}});}

async function pageSettings(){const [{data:health},{data:runs},{data:allowed}]=await Promise.all([supabase.from('source_health').select('*').order('source_name'),supabase.from('sync_runs').select('*').order('started_at',{ascending:false}).limit(15),supabase.from('allowed_users').select('email')]);pageEl().innerHTML=`${header('設定 / Settings','帳號、資料來源與同步健康度。')}<section class="two-col"><div class="panel"><div class="section-head"><div><h2>帳號</h2><p>Supabase Auth</p></div></div><div class="signal-row"><span>Email</span><b>${esc(state.session.user.email)}</b></div><div class="signal-row"><span>私人白名單</span><span class="badge ok">${allowed?.length?'已授權':'未授權'}</span></div><button class="btn danger" id="settings-logout" style="margin-top:12px">登出</button></div><div class="panel"><div class="section-head"><div><h2>資料來源健康度</h2><p>只顯示後端紀錄，不暴露 API 金鑰</p></div></div>${(health||[]).map(x=>`<div class="signal-row"><div><b>${esc(x.source_name)}</b><div class="sub">${esc(x.message||'—')}</div></div><span class="badge ${x.status==='ok'?'ok':x.status==='credential_required'?'warn':'danger'}">${esc(x.status)}</span></div>`).join('')||'<div class="empty">尚無健康度紀錄</div>'}</div></section><section class="section panel"><div class="section-head"><div><h2>最近同步</h2><p>最多 15 筆</p></div></div>${(runs||[]).map(x=>`<div class="timeline-row" style="grid-template-columns:100px 90px 1fr 150px"><b>${esc(x.source_name)}</b><span class="badge ${x.status==='ok'?'ok':x.status==='running'?'':'danger'}">${esc(x.status)}</span><span>${Number(x.items_seen).toLocaleString()} seen · ${Number(x.items_changed).toLocaleString()} changed</span><span class="sub">${fmtDate(x.started_at,true)}</span></div>`).join('')||'<div class="empty">尚無同步紀錄</div>'}</section>`;document.querySelector('#settings-logout').onclick=()=>supabase.auth.signOut();}

async function pageGame(slug){if(!slug){location.hash='games';return;}const {data:g,error}=await supabase.from('games').select('*').eq('slug',slug).single();if(error)throw error;const [pl,pr,rv,is,st,li,wl]=await Promise.all([supabase.from('game_platforms').select('*').eq('game_id',g.id),supabase.from('store_products').select('*').eq('game_id',g.id).eq('region','TW').order('current_price'),supabase.from('review_snapshots').select('*').eq('game_id',g.id).order('captured_at',{ascending:false}).limit(20),supabase.from('game_issues').select('*').eq('game_id',g.id).eq('resolved',false).order('mention_count_24h',{ascending:false}),supabase.from('streaming_snapshots').select('*').eq('game_id',g.id).order('captured_at',{ascending:false}).limit(30),supabase.from('official_links').select('*').eq('game_id',g.id),supabase.from('watchlist').select('*').eq('user_id',state.session.user.id).eq('game_id',g.id).maybeSingle()]);const latestR=rv.data?.[0],latestS=st.data?.[0],watch=wl.data;
  pageEl().innerHTML=`${header('遊戲情報 / Game Detail','平台、價格、評價、問題、直播與官方連結集中顯示。')}<section class="detail-hero"><div class="detail-cover">${esc(initials(g.name_en))}</div><div><span class="badge ${statusClass(g.release_status)}">${statusZh(g.release_status)}</span><h2>${esc(g.name_zh_hant||g.name_en)}</h2><p>${esc(g.name_en)} · ${esc(g.developer||'Developer 待同步')} · ${esc(g.publisher||'Publisher 待同步')}</p>${Array.isArray(g.gameplay_tags)&&g.gameplay_tags.length?`<div class="game-detail-gameplay"><small>玩法分類 / Gameplay</small><div class="gameplay-row">${renderGameplayTags(g,12)}</div></div>`:''}<div class="tags" style="margin-top:10px">${(g.genres||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}<span class="tag">Release ${fmtDate(g.release_date)}</span></div></div>${g.official_website_url?`<button class="btn primary" id="official-site">官方網站 ↗</button>`:''}</section><section class="metrics"><article class="metric"><span>玩家評價</span><strong>${latestR?.positive_percentage!=null?`${Number(latestR.positive_percentage)}%`:'—'}</strong><small>${esc(latestR?.source||'待同步')}</small></article><article class="metric"><span>直播觀看</span><strong>${latestS?Number(latestS.viewer_count).toLocaleString():'—'}</strong><small>${latestS?`${esc(latestS.source)} · ${Number(latestS.channel_count)} 頻道`:'待同步'}</small></article><article class="metric"><span>未解決問題</span><strong>${is.data?.length||0}</strong><small>Issues</small></article><article class="metric"><span>官方連結</span><strong>${li.data?.length||0}</strong><small>Verified</small></article></section><div class="detail-grid"><div class="panel"><div class="section-head"><div><h2>平台與價格</h2><p>TW / NTD</p></div></div>${(pr.data||[]).map(x=>`<div class="price-row" style="grid-template-columns:1fr 110px 45px"><div><b>${esc(x.store)}</b><div class="sub">${esc(x.platform)} · ${esc(x.edition)}</div></div><b>${money(x.current_price,x.currency)} ${Number(x.discount_percent)>0?`<span class="badge ok">-${Number(x.discount_percent)}%</span>`:''}</b><button class="btn" data-url="${esc(x.store_url)}">↗</button></div>`).join('')||'<div class="empty">價格待同步</div>'}</div><div class="panel"><div class="section-head"><div><h2>平台支援</h2><p>語言與上市狀態</p></div></div>${(pl.data||[]).map(x=>`<div class="signal-row"><div><b>${esc(x.platform)}</b><div class="sub">${fmtDate(x.release_date)}</div></div><span>${x.supports_zh_hant?'繁中 · ':''}${esc(x.availability)}</span></div>`).join('')||'<div class="empty">平台待同步</div>'}</div><div class="panel"><div class="section-head"><div><h2>玩家主要問題</h2><p>目前未解決</p></div></div>${(is.data||[]).map(x=>`<div class="issue-row" style="grid-template-columns:1fr 80px"><div><b>${esc(x.title_zh)}</b><div class="sub">${esc(x.title_en)} · 24H ${Number(x.mention_count_24h)}</div></div><b>${x.growth_24h!=null?`${Number(x.growth_24h)>0?'+':''}${Number(x.growth_24h)}%`:'—'}</b></div>`).join('')||'<div class="empty">目前沒有達門檻的玩家問題</div>'}</div><div class="panel"><div class="section-head"><div><h2>官方連結</h2><p>Official / Verified</p></div></div>${(li.data||[]).map(x=>`<div class="signal-row"><div><b>${esc(x.label)}</b><div class="sub">${esc(x.region||'GLOBAL')} · ${esc(x.tier)}</div></div><button class="btn" data-url="${esc(x.url)}">開啟 ↗</button></div>`).join('')||'<div class="empty">尚無官方連結</div>'}</div></div><section class="section panel"><div class="section-head"><div><h2>我的收藏通知</h2><p>只有你的帳號可存取</p></div><button class="btn ${watch?'danger':'primary'}" id="watch-btn">${watch?'移除收藏':'加入收藏'}</button></div>${watch?`<div class="toolbar"><label class="sub">目標價 <input class="control" id="target-price" type="number" min="0" step="1" value="${watch.target_price??''}" placeholder="例如 1200"></label></div><div class="toolbar">${[['notify_release','上市'],['notify_preorder','預購'],['notify_price','價格'],['notify_reviews','評價'],['notify_issues','問題'],['notify_streams','直播']].map(([k,l])=>`<button class="btn notify-toggle ${watch[k]?'primary':''}" data-key="${k}">${l}</button>`).join('')}<button class="btn primary" id="save-watch">儲存設定</button></div>`:''}</section>`;
  if(g.official_website_url)document.querySelector('#official-site').onclick=()=>window.open(g.official_website_url,'_blank','noopener,noreferrer');document.querySelectorAll('[data-url]').forEach(b=>b.onclick=()=>window.open(b.dataset.url,'_blank','noopener,noreferrer'));
  document.querySelector('#watch-btn').onclick=async()=>{if(watch){const {error}=await supabase.from('watchlist').delete().eq('id',watch.id);if(error)toast(error.message,true);else{toast('已移除收藏');pageGame(slug)}}else{const {error}=await supabase.from('watchlist').insert({user_id:state.session.user.id,game_id:g.id});if(error)toast(error.message,true);else{toast('已加入收藏');pageGame(slug)}}};
  if(watch){document.querySelectorAll('.notify-toggle').forEach(b=>b.onclick=()=>b.classList.toggle('primary'));document.querySelector('#save-watch').onclick=async()=>{const payload={target_price:document.querySelector('#target-price').value?Number(document.querySelector('#target-price').value):null};document.querySelectorAll('.notify-toggle').forEach(b=>payload[b.dataset.key]=b.classList.contains('primary'));const {error}=await supabase.from('watchlist').update(payload).eq('id',watch.id);if(error)toast(error.message,true);else toast('收藏通知設定已更新');};}
}

init();
