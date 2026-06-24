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
  /** 解禁帯（=解禁日）毎の席数。null のとき settings.seat_count（既定）を使う */
  seat_count: number | null;
  created_at: string;
}

/** カレンダーの空き状況（青=空きあり / 黄=空き少 / 赤=満席） */
export type DayStatus = 'available' | 'low' | 'full';

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
  /** オリシャン（オリジナルシャンパン）印 */
  is_original: boolean;
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
  /** 「当日にメニューを決める」で予約された場合 true */
  menu_undecided: boolean;
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
