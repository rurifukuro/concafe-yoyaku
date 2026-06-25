-- ===========================================
-- concafe-yoyaku 005: シャンパン上位4種をオリシャン（オリジナルシャンパン）に設定
-- ===========================================
-- 非破壊（既存行の is_original フラグ更新のみ。構造変更・削除なし）。
-- display_order 昇順で先頭4種の champagne を is_original = true にする。
-- 冪等：再実行しても同じ4種が true になるだけ。
-- ===========================================
UPDATE menu_items
SET is_original = true, updated_at = now()
WHERE id IN (
  SELECT id FROM menu_items
  WHERE category = 'champagne' AND active = true
  ORDER BY display_order ASC
  LIMIT 4
);
