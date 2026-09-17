import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const supabase=createClient('https://ehyivgyprxiyhldxrzpx.supabase.co','sb_publishable_tukBY1endjNBJdVFoSBHbA__pHOPGGx',{auth:{persistSession:true,autoRefreshToken:true}});

const style=document.createElement('style');
style.textContent=`.coverage-status{margin:0 0 16px;border:1px solid #29405d;background:linear-gradient(135deg,rgba(40,215,233,.08),rgba(17,26,41,.9));border-radius:12px;padding:12px 14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}.coverage-chip{border:1px solid #2e4058;border-radius:999px;padding:6px 9px;font-size:10px;color:#bcd0e5;background:#101927}.coverage-chip b{color:#eef5ff}.coverage-warn{border-color:#6c5530;color:#f6bd60}.coverage-ok{border-color:#2b5c4d;color:#4ee39b}.coverage-note{font-size:10px;color:#8fa2ba;flex-basis:100%;line-height:1.5}`;
document.head.appendChild(style);

async function exactCount(table,filter){let q=supabase.from(table).select('*',{count:'exact',head:true});if(filter)q=filter(q);const {count}=await q;return count??0;}
async function latest(table,col){const {data}=await supabase.from(table).select(col).order(col,{ascending:false}).limit(1);return data?.[0]?.[col]||null;}
function fmt(v){return v?new Date(v).toLocaleString('zh-TW'):'—';}

async function renderCoverage(){
 const {data:{session}}=await supabase.auth.getSession();if(!session)return;
 const page=document.querySelector('#page');if(!page)return;
 document.querySelector('#coverage-status')?.remove();
 const route=(location.hash.replace(/^#/,'')||'dashboard').split('/')[0];
 if(!['dashboard','games','prices','issues','live','settings'].includes(route))return;
 const [games,products,reviews,issues,streams]=await Promise.all([
   exactCount('games'),exactCount('store_products'),exactCount('review_snapshots'),exactCount('game_issues',q=>q.eq('resolved',false)),exactCount('streaming_snapshots')
 ]);
 let extra='',note='';
 if(route==='prices'){const t=await latest('store_products','updated_at');extra=`<span class="coverage-chip coverage-ok">價格資料 <b>${products.toLocaleString()}</b></span><span class="coverage-chip">最後更新 <b>${fmt(t)}</b></span>`;note='Steam 台灣價格正在分批同步；資料會持續增加。';}
 else if(route==='issues'){const t=await latest('game_issues','last_seen');extra=`<span class="coverage-chip coverage-ok">問題分類 <b>${issues.toLocaleString()}</b></span><span class="coverage-chip">最後偵測 <b>${fmt(t)}</b></span>`;note='問題來自最近 Steam 負評關鍵字分類，並非把零星留言冒充全網共識。';}
 else if(route==='live'){
   const {data:health}=await supabase.from('source_health').select('source_name,status,message').in('source_name',['twitch','youtube']);
   const tw=health?.find(x=>x.source_name==='twitch'),yt=health?.find(x=>x.source_name==='youtube');
   extra=`<span class="coverage-chip ${streams?'coverage-ok':'coverage-warn'}">直播快照 <b>${streams.toLocaleString()}</b></span><span class="coverage-chip coverage-warn">Twitch <b>${tw?.status||'待連接'}</b></span><span class="coverage-chip coverage-warn">YouTube <b>${yt?.status||'待連接'}</b></span>`;
   note=streams?'直播資料已開始累積。':'Twitch / YouTube 官方即時資料仍需 API 憑證；目前刻意不顯示假觀看數。';
 } else {
   extra=`<span class="coverage-chip coverage-ok">遊戲 <b>${games.toLocaleString()}</b></span><span class="coverage-chip">價格 <b>${products.toLocaleString()}</b></span><span class="coverage-chip">評價 <b>${reviews.toLocaleString()}</b></span><span class="coverage-chip">問題 <b>${issues.toLocaleString()}</b></span><span class="coverage-chip ${streams?'coverage-ok':'coverage-warn'}">直播 <b>${streams.toLocaleString()}</b></span>`;
   note='Steam 目錄與價格/評價為兩條獨立同步流程，所以遊戲總數會比價格與評價覆蓋率先增加。';
 }
 const el=document.createElement('div');el.id='coverage-status';el.className='coverage-status';el.innerHTML=`${extra}<div class="coverage-note">${note}</div>`;
 const hero=page.querySelector('.hero');if(hero)hero.insertAdjacentElement('afterend',el);else page.prepend(el);
}

window.addEventListener('hashchange',()=>setTimeout(renderCoverage,450));
supabase.auth.onAuthStateChange(()=>setTimeout(renderCoverage,700));
setInterval(renderCoverage,30000);
setTimeout(renderCoverage,1300);
