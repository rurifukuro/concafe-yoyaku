import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { MenuItem } from '../lib/types';

export type NewMenuItem = Omit<
  MenuItem,
  'id' | 'created_at' | 'updated_at'
>;
export type MenuItemPatch = Partial<NewMenuItem>;

export function useMenu() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .order('category')
      .order('display_order');
    if (error) {
      console.warn('[menu] load failed', error.message);
    }
    setMenuItems((data as MenuItem[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addItem(item: NewMenuItem): Promise<string | null> {
    const { error } = await supabase.from('menu_items').insert(item);
    if (error) {
      console.warn('[menu] add failed', error.message);
      return error.message;
    }
    await load();
    return null;
  }

  async function updateItem(
    id: string,
    patch: MenuItemPatch,
  ): Promise<string | null> {
    const { error } = await supabase
      .from('menu_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.warn('[menu] update failed', error.message);
      return error.message;
    }
    await load();
    return null;
  }

  async function deleteItem(id: string): Promise<string | null> {
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) {
      console.warn('[menu] delete failed', error.message);
      return error.message;
    }
    await load();
    return null;
  }

  return {
    menuItems,
    loading,
    refresh: load,
    addItem,
    updateItem,
    deleteItem,
  };
}
