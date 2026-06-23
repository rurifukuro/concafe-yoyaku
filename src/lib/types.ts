export interface Settings {
  id: number;
  seat_count: number;
  created_at: string;
  updated_at: string;
}

export interface UnlockWindow {
  id: string;
  date: string;
  start_time: number;
  end_time: number;
  created_at: string;
}

export interface Reservation {
  id: string;
  date: string;
  start_time: number;
  sets: number;
  seat_no: number;
  customer_name: string;
  created_at: string;
}

export interface TimeSlot {
  startMinute: number;
  endMinute: number;
  availableSeats: number;
  totalSeats: number;
  isUnlocked: boolean;
}

export interface MakeReservationResult {
  id?: string;
  seat_no?: number;
  error?: 'no_available_seat' | 'not_unlocked' | 'invalid_time_range';
}
