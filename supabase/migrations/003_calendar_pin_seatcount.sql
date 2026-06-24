-- ===========================================
-- concafe-yoyaku: カレンダー色分け / メニュー未定 / 解禁日毎の席数 / 予約PIN / オリシャン印
-- ===========================================
-- すべて非破壊（列追加・テーブル追加・RPC差し替えのみ。既存データは保持）。
-- 追加内容:
--   1. reservations.menu_undecided  … 「当日にメニューを決める」フラグ
--   2. unlock_windows.seat_count     … 解禁帯（=解禁日）毎の席数。NULL のとき settings の既定値を使う
--   3. menu_items.is_original        … オリシャン（オリジナルシャンパン）印
--   4. reservation_pins テーブル     … 予約編集/キャンセル用の4桁PIN。anon からは読めない（RPC のみが触れる）
--   5. make_reservation RPC を上記対応へ拡張
-- ===========================================

-- --------------- 1. reservations: メニュー未定フラグ ---------------
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS menu_undecided boolean NOT NULL DEFAULT false;

-- --------------- 2. unlock_windows: 解禁帯毎の席数 ---------------
ALTER TABLE unlock_windows
  ADD COLUMN IF NOT EXISTS seat_count int;  -- NULL = settings.seat_count（既定）を使う

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unlock_windows_seat_count_chk'
  ) THEN
    ALTER TABLE unlock_windows
      ADD CONSTRAINT unlock_windows_seat_count_chk
      CHECK (seat_count IS NULL OR seat_count >= 1);
  END IF;
END $$;

-- --------------- 3. menu_items: オリシャン印 ---------------
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS is_original boolean NOT NULL DEFAULT false;

-- --------------- 4. reservation_pins: 予約編集用の4桁PIN ---------------
-- anon / authenticated に SELECT/INSERT ポリシーを与えない＝直接アクセス不可。
-- make_reservation（SECURITY DEFINER）だけが書き込み、将来のキャンセル/編集RPCだけが読む。
CREATE TABLE IF NOT EXISTS reservation_pins (
  reservation_id uuid PRIMARY KEY REFERENCES reservations(id) ON DELETE CASCADE,
  pin            text NOT NULL,
  created_at     timestamptz DEFAULT now(),
  CHECK (pin ~ '^[0-9]{4}$')
);

ALTER TABLE reservation_pins ENABLE ROW LEVEL SECURITY;

-- 管理者（authenticated）が予約を消したときに PIN も掃除できるよう DELETE のみ許可。
DROP POLICY IF EXISTS "Admin delete reservation_pins" ON reservation_pins;
CREATE POLICY "Admin delete reservation_pins"
  ON reservation_pins FOR DELETE USING (auth.role() = 'authenticated');

-- --------------- 5. RPC: make_reservation（席数=解禁帯毎 / メニュー未定 / PIN 対応） ---------------
-- 旧6引数シグネチャを破棄して新8引数で再作成。
-- 新引数は末尾＋DEFAULT のため、現行フロント（6引数の名前付き呼び出し）はそのまま動く。
DROP FUNCTION IF EXISTS make_reservation(date, int, int, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION make_reservation(
  p_date           date,
  p_start_time     int,
  p_sets           int,
  p_customer_name  text,
  p_seat_type_id   uuid    DEFAULT NULL,
  p_orders         jsonb   DEFAULT '[]'::jsonb,
  p_menu_undecided boolean DEFAULT false,
  p_edit_pin       text    DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seat_count     int;
  v_window_seats   int;
  v_window_found   boolean;
  v_seat_no        int;
  v_end_time       int;
  v_reservation_id uuid;
  v_seat_name      text := NULL;
  v_seat_price     int  := 0;
  v_orders_total   int  := 0;
  v_subtotal       int  := 0;
  v_order_snapshot jsonb := '[]'::jsonb;
  v_elem           jsonb;
  v_item_id        uuid;
  v_qty            int;
  v_iname          text;
  v_iprice         int;
  v_icounts        boolean;
BEGIN
  v_end_time := p_start_time + p_sets * 40;

  IF p_start_time < 0 OR v_end_time > 480 THEN
    RETURN json_build_object('error', 'invalid_time_range');
  END IF;

  -- 同一日付の同時予約を直列化
  PERFORM pg_advisory_xact_lock(hashtext(p_date::text));

  -- 予約全体を含む解禁帯を特定し、その帯の席数を採用（複数該当時は席数が多い帯を優先）
  SELECT uw.seat_count INTO v_window_seats
  FROM unlock_windows uw
  WHERE uw.date       = p_date
    AND uw.start_time <= p_start_time
    AND uw.end_time   >= v_end_time
  ORDER BY uw.seat_count DESC NULLS LAST
  LIMIT 1;
  v_window_found := FOUND;

  IF NOT v_window_found THEN
    RETURN json_build_object('error', 'not_unlocked');
  END IF;

  -- 解禁帯の席数 > settings の既定 > 3
  v_seat_count := COALESCE(v_window_seats, (SELECT seat_count FROM settings LIMIT 1), 3);

  -- 重複しない最小席番号を割り当て
  SELECT s.seat_no INTO v_seat_no
  FROM generate_series(1, v_seat_count) AS s(seat_no)
  WHERE NOT EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.date    = p_date
      AND r.seat_no = s.seat_no
      AND r.start_time < v_end_time
      AND (r.start_time + r.sets * 40) > p_start_time
  )
  ORDER BY s.seat_no
  LIMIT 1;

  IF v_seat_no IS NULL THEN
    RETURN json_build_object('error', 'no_available_seat');
  END IF;

  -- 席種（セット料金）を DB 価格で確定
  IF p_seat_type_id IS NOT NULL THEN
    SELECT name, price INTO v_seat_name, v_seat_price
    FROM menu_items
    WHERE id = p_seat_type_id AND category = 'seat' AND active = true;
    IF v_seat_price IS NULL THEN
      v_seat_price := 0;
      v_seat_name  := NULL;
    END IF;
  END IF;

  -- 追加オーダー（メニュー未定のときは無視＝注文ゼロで保存）
  IF NOT COALESCE(p_menu_undecided, false)
     AND p_orders IS NOT NULL
     AND jsonb_typeof(p_orders) = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_orders)
    LOOP
      v_item_id := NULLIF(v_elem->>'item_id', '')::uuid;
      v_qty     := COALESCE((v_elem->>'qty')::int, 0);
      IF v_item_id IS NOT NULL AND v_qty > 0 THEN
        SELECT name, price, counts_as_order
          INTO v_iname, v_iprice, v_icounts
        FROM menu_items
        WHERE id = v_item_id AND active = true;
        IF v_iprice IS NOT NULL THEN
          v_orders_total := v_orders_total + v_iprice * v_qty;
          v_order_snapshot := v_order_snapshot || jsonb_build_object(
            'name',  v_iname,
            'price', v_iprice,
            'qty',   v_qty,
            'counts_as_order', v_icounts
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  v_subtotal := v_seat_price * p_sets + v_orders_total;

  INSERT INTO reservations (
    date, start_time, sets, seat_no, customer_name,
    seat_type_name, seat_unit_price, order_items, subtotal, menu_undecided
  )
  VALUES (
    p_date, p_start_time, p_sets, v_seat_no, p_customer_name,
    v_seat_name, v_seat_price, v_order_snapshot, v_subtotal,
    COALESCE(p_menu_undecided, false)
  )
  RETURNING id INTO v_reservation_id;

  -- 編集/キャンセル用 PIN（4桁のみ・別テーブルに保存。anon からは読めない）
  IF p_edit_pin IS NOT NULL AND p_edit_pin ~ '^[0-9]{4}$' THEN
    INSERT INTO reservation_pins (reservation_id, pin)
    VALUES (v_reservation_id, p_edit_pin);
  END IF;

  RETURN json_build_object(
    'id', v_reservation_id,
    'seat_no', v_seat_no,
    'subtotal', v_subtotal
  );
END;
$$;

GRANT EXECUTE ON FUNCTION make_reservation(date, int, int, text, uuid, jsonb, boolean, text) TO anon;
GRANT EXECUTE ON FUNCTION make_reservation(date, int, int, text, uuid, jsonb, boolean, text) TO authenticated;
