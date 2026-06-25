-- ===========================================
-- concafe-yoyaku 004: 予約のPIN照合・編集・キャンセル用 RPC
-- ===========================================
-- すべて非破壊（新規 RPC 追加のみ。既存テーブル/列/関数の変更・削除なし）。
-- 003 で作成済みの reservation_pins（anon 直接アクセス不可）を、
-- SECURITY DEFINER 関数経由でのみ照合・操作する。
--   1. verify_reservation_pin … PIN 照合（編集画面に入る前のゲート）
--   2. update_reservation      … PIN 照合＋再価格計算＋席再割当でフル編集
--   3. cancel_reservation      … PIN 照合＋予約削除（PIN は CASCADE で消える）
-- ===========================================

-- --------------- 1. PIN 照合 ---------------
CREATE OR REPLACE FUNCTION verify_reservation_pin(
  p_reservation_id uuid,
  p_pin            text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pin text;
BEGIN
  SELECT pin INTO v_pin FROM reservation_pins WHERE reservation_id = p_reservation_id;
  IF v_pin IS NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'no_pin');
  END IF;
  IF v_pin = p_pin THEN
    RETURN json_build_object('ok', true);
  END IF;
  RETURN json_build_object('ok', false, 'reason', 'mismatch');
END;
$$;

GRANT EXECUTE ON FUNCTION verify_reservation_pin(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION verify_reservation_pin(uuid, text) TO authenticated;

-- --------------- 2. 予約のフル編集（PIN 照合込み） ---------------
CREATE OR REPLACE FUNCTION update_reservation(
  p_reservation_id uuid,
  p_pin            text,
  p_start_time     int,
  p_sets           int,
  p_seat_type_id   uuid    DEFAULT NULL,
  p_orders         jsonb   DEFAULT '[]'::jsonb,
  p_menu_undecided boolean DEFAULT false
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pin            text;
  v_date           date;
  v_seat_count     int;
  v_window_seats   int;
  v_window_found   boolean;
  v_seat_no        int;
  v_end_time       int;
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
  -- PIN 照合
  SELECT pin INTO v_pin FROM reservation_pins WHERE reservation_id = p_reservation_id;
  IF v_pin IS NULL OR v_pin <> p_pin THEN
    RETURN json_build_object('error', 'pin_mismatch');
  END IF;

  -- 対象予約の日付を取得
  SELECT date INTO v_date FROM reservations WHERE id = p_reservation_id;
  IF v_date IS NULL THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  v_end_time := p_start_time + p_sets * 40;
  IF p_start_time < 0 OR v_end_time > 480 THEN
    RETURN json_build_object('error', 'invalid_time_range');
  END IF;

  -- 同一日付の同時操作を直列化
  PERFORM pg_advisory_xact_lock(hashtext(v_date::text));

  -- 解禁帯の席数（複数該当時は多い帯を優先）
  SELECT uw.seat_count INTO v_window_seats
  FROM unlock_windows uw
  WHERE uw.date       = v_date
    AND uw.start_time <= p_start_time
    AND uw.end_time   >= v_end_time
  ORDER BY uw.seat_count DESC NULLS LAST
  LIMIT 1;
  v_window_found := FOUND;

  IF NOT v_window_found THEN
    RETURN json_build_object('error', 'not_unlocked');
  END IF;

  v_seat_count := COALESCE(v_window_seats, (SELECT seat_count FROM settings LIMIT 1), 3);

  -- 重複しない最小席番号（自分自身は除外して再割当）
  SELECT s.seat_no INTO v_seat_no
  FROM generate_series(1, v_seat_count) AS s(seat_no)
  WHERE NOT EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.date    = v_date
      AND r.seat_no = s.seat_no
      AND r.id     <> p_reservation_id
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

  -- 追加オーダー（メニュー未定のときは無視＝注文ゼロ）
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

  UPDATE reservations SET
    start_time      = p_start_time,
    sets            = p_sets,
    seat_no         = v_seat_no,
    seat_type_name  = v_seat_name,
    seat_unit_price = v_seat_price,
    order_items     = v_order_snapshot,
    subtotal        = v_subtotal,
    menu_undecided  = COALESCE(p_menu_undecided, false)
  WHERE id = p_reservation_id;

  RETURN json_build_object(
    'id', p_reservation_id,
    'seat_no', v_seat_no,
    'subtotal', v_subtotal
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_reservation(uuid, text, int, int, uuid, jsonb, boolean) TO anon;
GRANT EXECUTE ON FUNCTION update_reservation(uuid, text, int, int, uuid, jsonb, boolean) TO authenticated;

-- --------------- 3. 予約キャンセル（PIN 照合込み） ---------------
CREATE OR REPLACE FUNCTION cancel_reservation(
  p_reservation_id uuid,
  p_pin            text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pin text;
BEGIN
  SELECT pin INTO v_pin FROM reservation_pins WHERE reservation_id = p_reservation_id;
  IF v_pin IS NULL OR v_pin <> p_pin THEN
    RETURN json_build_object('error', 'pin_mismatch');
  END IF;
  -- 予約削除（reservation_pins は ON DELETE CASCADE で同時に消える）
  DELETE FROM reservations WHERE id = p_reservation_id;
  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION cancel_reservation(uuid, text) TO authenticated;
