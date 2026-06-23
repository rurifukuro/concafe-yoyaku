-- ===========================================
-- concafe-yoyaku: menu & billing (会計目安)
-- ===========================================
-- 追加内容:
--   1. menu_items テーブル(管理画面から編集可能なメニュー)
--   2. müül 初期メニュー投入(席種・キャスト・フード・ショット・シャンパン・オプション)
--   3. reservations に席種/オーダー内容/小計を追加
--   4. make_reservation RPC を席種・オーダー対応へ拡張(サーバ側でDB価格から再計算)
-- ===========================================

-- --------------- menu_items ---------------
-- category:
--   'seat'      = 席種(1セットあたりの単価。セット数を掛ける)
--   'cast'      = キャストメニュー(ドリンク/ショット/チェキ等)
--   'food'      = フード
--   'shot'      = ショット
--   'champagne' = シャンパン
--   'option'    = オプション(持ち込み料/推し等)
-- counts_as_order: 「1セット1オーダー必須」を満たすオーダーか
--   ※フードはおえかきオムライス・おえかきパンケーキのみ true(店舗ルール)
CREATE TABLE menu_items (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category        text NOT NULL,
  name            text NOT NULL,
  price           int  NOT NULL DEFAULT 0,
  counts_as_order boolean NOT NULL DEFAULT false,
  note            text,
  display_order   int  NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CHECK (category IN ('seat', 'cast', 'food', 'shot', 'champagne', 'option')),
  CHECK (price >= 0)
);
CREATE INDEX idx_menu_items_category ON menu_items(category, display_order);

-- --------------- 初期メニュー(müül) ---------------
-- 席種(1セット40分・飲み放題)
INSERT INTO menu_items (category, name, price, counts_as_order, note, display_order) VALUES
  ('seat', 'カウンター席',          2500, false, 'ビール・缶ものは+600円', 10),
  ('seat', 'カウンター席（女性限定）', 1500, false, '女性のお客様限定', 20),
  ('seat', 'VIP席',                4000, false, NULL, 30);

-- キャストメニュー
INSERT INTO menu_items (category, name, price, counts_as_order, note, display_order) VALUES
  ('cast', 'キャストドリンク',          1200, true, NULL, 10),
  ('cast', 'キャストドリンク（缶もの）', 2400, true, NULL, 20),
  ('cast', 'キャストショット',          1500, true, NULL, 30),
  ('cast', 'チェキ',                   1200, true, NULL, 40),
  ('cast', 'らくがきチェキ',            1500, true, NULL, 50);

-- フード(オムライス・パンケーキのみ1オーダー必須を満たす)
INSERT INTO menu_items (category, name, price, counts_as_order, note, display_order) VALUES
  ('food', 'おえかきオムライス',  1500, true,  '1オーダー必須対象', 10),
  ('food', 'おえかきパンケーキ',  1500, true,  '1オーダー必須対象', 20),
  ('food', 'フライドポテト',      1000, false, NULL, 30),
  ('food', 'ポテナゲ',           1200, false, NULL, 40),
  ('food', 'ラーメン（豚骨醤油）', 500, false, NULL, 50),
  ('food', 'ラーメン（味噌）',     500, false, NULL, 60),
  ('food', 'しじみの味噌汁',       500, false, NULL, 70),
  ('food', 'ミックスナッツ',       500, false, NULL, 80);

-- ショット(税込)
INSERT INTO menu_items (category, name, price, counts_as_order, note, display_order) VALUES
  ('shot', 'ハブ酒',                  550, true, NULL, 10),
  ('shot', 'クライナー',              550, true, NULL, 20),
  ('shot', 'コカレロ',                550, true, NULL, 30),
  ('shot', 'コカボム',                880, true, NULL, 40),
  ('shot', 'クエルボゴールド',         550, true, NULL, 50),
  ('shot', 'イエーガー',              550, true, NULL, 60),
  ('shot', 'コカボムタワー（4段10杯）', 19800, true, NULL, 70),
  ('shot', 'テキーラ観覧車（12杯）',   24000, true, NULL, 80),
  ('shot', 'テキーラ観覧車（24杯）',   48000, true, NULL, 90);

-- シャンパン(税込)
INSERT INTO menu_items (category, name, price, counts_as_order, note, display_order) VALUES
  ('champagne', 'Twinkle',                  30800,  true, NULL, 10),
  ('champagne', 'Starlight',                49500,  true, NULL, 20),
  ('champagne', 'Moonlight',                66000,  true, NULL, 30),
  ('champagne', 'Etoile',                   88000,  true, NULL, 40),
  ('champagne', 'リステル',                 11000,  true, NULL, 50),
  ('champagne', 'ルージュ',                 16500,  true, NULL, 60),
  ('champagne', '天使のアスティ',            12100,  true, NULL, 70),
  ('champagne', 'マムバム',                 22000,  true, NULL, 80),
  ('champagne', 'シンデレラシュー',          33000,  true, NULL, 90),
  ('champagne', 'デキャンタ（ラビットセット）', 275000, true, NULL, 100),
  ('champagne', 'ティーカッププードル',       132000, true, NULL, 110);

-- オプション
INSERT INTO menu_items (category, name, price, counts_as_order, note, display_order) VALUES
  ('option', 'フード持ち込み（1回）', 1000, false, '持ち込み料', 10),
  ('option', '推し（1セット）',         0, false, NULL, 20);

-- --------------- reservations: 会計列を追加 ---------------
ALTER TABLE reservations
  ADD COLUMN seat_type_name  text,
  ADD COLUMN seat_unit_price int  NOT NULL DEFAULT 0,
  ADD COLUMN order_items     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN subtotal        int  NOT NULL DEFAULT 0;

-- --------------- RPC: atomic reservation (席種・オーダー対応) ---------------
-- 旧シグネチャを破棄して新シグネチャで再作成
DROP FUNCTION IF EXISTS make_reservation(date, int, int, text);

CREATE OR REPLACE FUNCTION make_reservation(
  p_date          date,
  p_start_time    int,
  p_sets          int,
  p_customer_name text,
  p_seat_type_id  uuid    DEFAULT NULL,
  p_orders        jsonb   DEFAULT '[]'::jsonb
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seat_count     int;
  v_seat_no        int;
  v_end_time       int;
  v_reservation_id uuid;
  v_is_unlocked    boolean;
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

  -- Lock on date to serialise concurrent bookings
  PERFORM pg_advisory_xact_lock(hashtext(p_date::text));

  -- Entire reservation must fit within an unlock window
  SELECT EXISTS(
    SELECT 1 FROM unlock_windows uw
    WHERE uw.date       = p_date
      AND uw.start_time <= p_start_time
      AND uw.end_time   >= v_end_time
  ) INTO v_is_unlocked;

  IF NOT v_is_unlocked THEN
    RETURN json_build_object('error', 'not_unlocked');
  END IF;

  SELECT seat_count INTO v_seat_count FROM settings LIMIT 1;
  IF v_seat_count IS NULL THEN v_seat_count := 3; END IF;

  -- Lowest-numbered seat with no overlap
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

  -- 席種(セット料金)をDB価格で確定
  IF p_seat_type_id IS NOT NULL THEN
    SELECT name, price INTO v_seat_name, v_seat_price
    FROM menu_items
    WHERE id = p_seat_type_id AND category = 'seat' AND active = true;
    IF v_seat_price IS NULL THEN
      v_seat_price := 0;
      v_seat_name  := NULL;
    END IF;
  END IF;

  -- 追加オーダーをDB価格で再計算しスナップショット化
  IF p_orders IS NOT NULL AND jsonb_typeof(p_orders) = 'array' THEN
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
    seat_type_name, seat_unit_price, order_items, subtotal
  )
  VALUES (
    p_date, p_start_time, p_sets, v_seat_no, p_customer_name,
    v_seat_name, v_seat_price, v_order_snapshot, v_subtotal
  )
  RETURNING id INTO v_reservation_id;

  RETURN json_build_object(
    'id', v_reservation_id,
    'seat_no', v_seat_no,
    'subtotal', v_subtotal
  );
END;
$$;

GRANT EXECUTE ON FUNCTION make_reservation(date, int, int, text, uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION make_reservation(date, int, int, text, uuid, jsonb) TO authenticated;

-- --------------- RLS: menu_items ---------------
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read menu_items"
  ON menu_items FOR SELECT USING (true);
CREATE POLICY "Admin insert menu_items"
  ON menu_items FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admin update menu_items"
  ON menu_items FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Admin delete menu_items"
  ON menu_items FOR DELETE USING (auth.role() = 'authenticated');
