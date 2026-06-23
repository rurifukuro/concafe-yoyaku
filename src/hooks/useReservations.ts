import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Reservation } from '../lib/types';

export function useReservations(date: string) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .eq('date', date)
      .order('start_time');
    setReservations((data as Reservation[] | null) ?? []);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  return { reservations, loading, refresh: load };
}
