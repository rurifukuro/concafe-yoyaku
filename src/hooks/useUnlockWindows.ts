import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { UnlockWindow } from '../lib/types';
import { getDaysInMonth } from '../lib/timeUtils';

export function useUnlockWindows(date: string) {
  const [windows, setWindows] = useState<UnlockWindow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('unlock_windows')
      .select('*')
      .eq('date', date)
      .order('start_time');
    setWindows((data as UnlockWindow[] | null) ?? []);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addWindow(startTime: number, endTime: number) {
    await supabase
      .from('unlock_windows')
      .insert({ date, start_time: startTime, end_time: endTime });
    await load();
  }

  async function removeWindow(id: string) {
    await supabase.from('unlock_windows').delete().eq('id', id);
    await load();
  }

  return { windows, loading, refresh: load, addWindow, removeWindow };
}

export function useUnlockedDates(year: number, month: number) {
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mm = (month + 1).toString().padStart(2, '0');
    const startDate = `${year}-${mm}-01`;
    const lastDay = getDaysInMonth(year, month);
    const endDate = `${year}-${mm}-${lastDay.toString().padStart(2, '0')}`;

    supabase
      .from('unlock_windows')
      .select('date')
      .gte('date', startDate)
      .lte('date', endDate)
      .then(({ data }) => {
        const s = new Set<string>();
        data?.forEach((row) => s.add((row as { date: string }).date));
        setDates(s);
        setLoading(false);
      });
  }, [year, month]);

  return { unlockedDates: dates, loading };
}
