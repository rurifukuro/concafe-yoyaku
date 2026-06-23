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

export type MenuCategory =
  | 'seat'
  | 'cast'
  | 'food'
  | 'shot'
  | 'champagne'
  | 'option';

export interface MenuItem {
  id: string;
  category: MenuCategory;
  name: string;
  price: number;
  counts_as_order: boolean;
  note: string | null;
  display_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** 予約に保存される注文行のスナップショット(予約時点の価格で固定) */
export interface OrderLineSnapshot {
  name: string;
  price: number;
  qty: number;
  counts_as_order: boolean;
}

export interface Reservation {
  id: string;
  date: string;
  start_time: number;
  sets: number;
  seat_no: number;
  customer_name: string;
  seat_type_name: string | null;
  seat_unit_price: number;
  order_items: OrderLineSnapshot[];
  subtotal: number;
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
  subtotal?: number;
  error?: 'no_available_seat' | 'not_unlocked' | 'invalid_time_range';
}
