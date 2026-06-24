import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { DayStatus, Reservation, UnlockWindow } from '../lib/types';
import {
  getDaysInMonth,
  formatDate,
  computeDayStatus,
} from '../lib/timeUtils';
import { DEFAULT_SEAT_COUNT } from '../lib/constants';

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

  async function addWindow(
    startTime: number,
    endTime: number,
    seatCount: number | null = null,
  ) {
    await supabase.from('unlock_windows').insert({
      date,
      start_time: startTime,
      end_time: endTime,
      seat_count: seatCount,
    });
    await load();
  }

  async function removeWindow(id: string) {
    await supabase.from('unlock_windows').delete().eq('id', id);
    await load();
  }

  async function updateWindowSeatCount(id: string, seatCount: number | null) {
    await supabase
      .from('unlock_windows')
      .update({ seat_count: seatCount })
      .eq('id', id);
    await load();
  }

  return {
    windows,
    loading,
    refresh: load,
    addWindow,
    removeWindow,
    updateWindowSeatCount,
  };
}

/**
 * 今日以降で最短の「予約可能日（受付解禁帯のある日）」を返す。
 * 顧客ページの初期表示日を、行き止まり（解禁帯なし）にしないために使う。
 */
export function useNextOpenDate() {
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = formatDate(new Date());
    supabase
      .from('unlock_windows')
      .select('date')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0] as { date: string } | undefined;
        setNextDate(row?.date ?? null);
        setLoading(false);
      });
  }, []);

  return { nextDate, loading };
}

/** カレンダー用: その月の解禁日と、各日の空き状況（青/黄/赤）を返す */
export function useMonthAvailability(year: number, month: number) {
  const [unlockedDates, setUnlockedDates] = useState<Set<string>>(new Set());
  const [statusByDate, setStatusByDate] = useState<Map<string, DayStatus>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const mm = (month + 1).toString().padStart(2, '0');
    const startDate = `${year}-${mm}-01`;
    const lastDay = getDaysInMonth(year, month);
    const endDate = `${year}-${mm}-${lastDay.toString().padStart(2, '0')}`;

    setLoading(true);
    void (async () => {
      const [winRes, resvRes, setRes] = await Promise.all([
        supabase
          .from('unlock_windows')
          .select('date,start_time,end_time,seat_count')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('reservations')
          .select('date,start_time,sets,seat_no')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase.from('settings').select('seat_count').single(),
      ]);
      if (cancelled) return;

      const globalSeat =
        (setRes.data as { seat_count: number } | null)?.seat_count ??
        DEFAULT_SEAT_COUNT;

      type WinRow = Pick<
        UnlockWindow,
        'date' | 'start_time' | 'end_time' | 'seat_count'
      >;
      type ResvRow = Pick<
        Reservation,
        'date' | 'start_time' | 'sets' | 'seat_no'
      >;

      const winRows = (winRes.data as WinRow[] | null) ?? [];
      const resvRows = (resvRes.data as ResvRow[] | null) ?? [];

      const winsByDate = new Map<string, WinRow[]>();
      for (const w of winRows) {
        const arr = winsByDate.get(w.date) ?? [];
        arr.push(w);
        winsByDate.set(w.date, arr);
      }
      const resvByDate = new Map<string, ResvRow[]>();
      for (const r of resvRows) {
        const arr = resvByDate.get(r.date) ?? [];
        arr.push(r);
        resvByDate.set(r.date, arr);
      }

      const dates = new Set<string>(winsByDate.keys());
      const statuses = new Map<string, DayStatus>();
      for (const [d, wins] of winsByDate) {
        statuses.set(
          d,
          computeDayStatus(wins, resvByDate.get(d) ?? [], globalSeat),
        );
      }

      setUnlockedDates(dates);
      setStatusByDate(statuses);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [year, month]);

  return { unlockedDates, statusByDate, loading };
}
