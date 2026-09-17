import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = 'https://ehyivgyprxiyhldxrzpx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tukBY1endjNBJdVFoSBHbA__pHOPGGx';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const SYNC_KEY = 'game-intel-open-catalog-sync';
const DAY = 24 * 60 * 60 * 1000;

async function maybeSync() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const last = Number(localStorage.getItem(SYNC_KEY) || 0);
  if (Date.now() - last < DAY) return;

  // Set an optimistic timestamp so multiple tabs do not all start a large sync.
  localStorage.setItem(SYNC_KEY, String(Date.now()));
  try {
    const { data, error } = await supabase.functions.invoke('sync-open-catalog');
    if (error) throw error;
    console.info('[Game Intel] catalog sync complete', data);

    // If new rows arrived, refresh once so the current page immediately sees them.
    if ((data?.inserted || 0) > 0) {
      sessionStorage.setItem('game-intel-just-synced', '1');
      setTimeout(() => location.reload(), 800);
    }
  } catch (error) {
    console.warn('[Game Intel] catalog sync failed', error);
    // Retry on a later visit instead of waiting a full day after failure.
    localStorage.removeItem(SYNC_KEY);
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) setTimeout(maybeSync, 1200);
});

setTimeout(maybeSync, 1600);
