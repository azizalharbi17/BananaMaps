import { cfg } from '../config';
import { FileStore } from './file';
import { SupabaseStore } from './supabase';
import type { Store } from './types';

export async function createStore(): Promise<Store> {
  let store: Store;
  if (cfg.store === 'file') {
    store = new FileStore(cfg.dataDir);
  } else {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('STORE=supabase needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    store = new SupabaseStore(url, key);
  }
  await store.init();
  return store;
}

export type { Store, TokenRow, TokenPatch, GraphKey } from './types';
export { tokenKey } from './types';
