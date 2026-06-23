-- ===========================================
-- concafe-yoyaku: initial schema
-- ===========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------- settings ---------------
CREATE TABLE settings (
  id   int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  seat_count int NOT NULL DEFAULT 3,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
INSERT INTO settings (seat_count) VALUES (3);

-- --------------- unlock_windows ---------------
CREATE TABLE unlock_windows (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  date       date NOT NULL,
  start_time int  NOT NULL,
  end_time   int  NOT NULL,
  created_at timestamptz DEFAULT now(),
  CHECK (start_time >= 0 AND start_time < 480),
  CHECK (end_time   > 0 AND end_time  <= 480),
  CHECK (start_time < end_time)
);
CREATE INDEX idx_unlock_windows_date ON unlock_windows(date);

-- --------------- reservations ---------------
CREATE TABLE reservations (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  date          date NOT NULL,
  start_time    int  NOT NULL,
  sets          int  NOT NULL DEFAULT 1,
  seat_no       int  NOT NULL,
  customer_name text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  CHECK (start_time >= 0 AND start_time < 480),
  CHECK (sets >= 1),
  CHECK (seat_no >= 1),
  CHECK (start_time + sets * 40 <= 480)
);
CREATE INDEX idx_reservations_date ON reservations(date);

-- --------------- RPC: atomic reservation ---------------
CREATE OR REPLACE FUNCTION make_reservation(
  p_date          date,
  p_start_time    int,
  p_sets          int,
  p_customer_name text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seat_count    int;
  v_seat_no       int;
  v_end_time      int;
  v_reservation_id uuid;
  v_is_unlocked   boolean;
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

  INSERT INTO reservations (date, start_time, sets, seat_no, customer_name)
  VALUES (p_date, p_start_time, p_sets, v_seat_no, p_customer_name)
  RETURNING id INTO v_reservation_id;

  RETURN json_build_object('id', v_reservation_id, 'seat_no', v_seat_no);
END;
$$;

GRANT EXECUTE ON FUNCTION make_reservation(date, int, int, text) TO anon;
GRANT EXECUTE ON FUNCTION make_reservation(date, int, int, text) TO authenticated;

-- --------------- RLS ---------------
ALTER TABLE settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE unlock_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations   ENABLE ROW LEVEL SECURITY;

-- settings
CREATE POLICY "Public read settings"
  ON settings FOR SELECT USING (true);
CREATE POLICY "Admin update settings"
  ON settings FOR UPDATE USING (auth.role() = 'authenticated');

-- unlock_windows
CREATE POLICY "Public read unlock_windows"
  ON unlock_windows FOR SELECT USING (true);
CREATE POLICY "Admin insert unlock_windows"
  ON unlock_windows FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admin update unlock_windows"
  ON unlock_windows FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Admin delete unlock_windows"
  ON unlock_windows FOR DELETE USING (auth.role() = 'authenticated');

-- reservations (insert via RPC which is SECURITY DEFINER)
CREATE POLICY "Public read reservations"
  ON reservations FOR SELECT USING (true);
CREATE POLICY "Admin delete reservations"
  ON reservations FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Admin update reservations"
  ON reservations FOR UPDATE USING (auth.role() = 'authenticated');
