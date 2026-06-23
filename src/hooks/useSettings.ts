import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Settings } from '../lib/types';
import { DEFAULT_SEAT_COUNT } from '../lib/constants';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('settings').select('*').single();
    setSettings((data as Settings | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const seatCount = settings?.seat_count ?? DEFAULT_SEAT_COUNT;

  async function updateSeatCount(count: number) {
    await supabase
      .from('settings')
      .update({ seat_count: count, updated_at: new Date().toISOString() })
      .eq('id', 1);
    await load();
  }

  return { settings, seatCount, loading, updateSeatCount, refresh: load };
}
