import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Reservation } from '../../lib/types';
import { minutesToDisplay } from '../../lib/timeUtils';
import { SET_DURATION } from '../../lib/constants';
import { formatYen } from '../../lib/pricing';

interface ServedCheckModalProps {
  reservation: Reservation;
  onClose: () => void;
  onUpdated: () => void;
}

/**
 * 管理者用：予約をタップして「その客に何を提供済みか」をチェックするモーダル。
 * served_items（order_items と同じ並び順の boolean 配列）を直接 UPDATE する。
 * reservations への UPDATE は authenticated ロールに許可済み（RLS）。
 */
export function ServedCheckModal({
  reservation,
  onClose,
  onUpdated,
}: ServedCheckModalProps) {
  const lines = reservation.order_items ?? [];
  // 既存の served_items を order_items の件数に合わせて正規化
  const [served, setServed] = useState<boolean[]>(() =>
    lines.map((_, i) =>
      Array.isArray(reservation.served_items)
        ? reservation.served_items[i] === true
        : false,
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rEnd = reservation.start_time + reservation.sets * SET_DURATION;
  const allServed = lines.length > 0 && served.every((s) => s);
  const servedCount = served.filter((s) => s).length;

  function toggle(i: number) {
    setServed((prev) => prev.map((s, idx) => (idx === i ? !s : s)));
  }

  function setAll(value: boolean) {
    setServed(lines.map(() => value));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { error: updErr } = await supabase
      .from('reservations')
      .update({ served_items: served })
      .eq('id', reservation.id);
    if (updErr) {
      setError('保存に失敗しました。もう一度お試しください。');
      setSaving(false);
      return;
    }
    onUpdated();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>提供チェック</h3>
        <div className="served-head">
          <div className="served-head-name">{reservation.customer_name} 様</div>
          <div className="served-head-meta">
            席{reservation.seat_no}／{minutesToDisplay(reservation.start_time)}〜
            {minutesToDisplay(rEnd)}（{reservation.sets}セット）
          </div>
          {reservation.seat_type_name && (
            <div className="served-head-meta">
              席種：{reservation.seat_type_name}
            </div>
          )}
        </div>

        {reservation.note && (
          <div className="served-note">
            <span className="served-note-label">備考</span>
            <span className="served-note-text">{reservation.note}</span>
          </div>
        )}

        {lines.length === 0 ? (
          <p className="served-empty">
            {reservation.menu_undecided
              ? '当日メニューを決める予約です（注文予定なし）。'
              : '注文予定はありません。'}
          </p>
        ) : (
          <>
            <div className="served-actions-top">
              <span className="served-progress">
                提供済み {servedCount}／{lines.length}
              </span>
              <span className="served-bulk">
                <button type="button" onClick={() => setAll(true)}>
                  すべて提供済み
                </button>
                <button type="button" onClick={() => setAll(false)}>
                  すべて未提供
                </button>
              </span>
            </div>
            <ul className="served-list">
              {lines.map((line, i) => (
                <li key={i} className={served[i] ? 'served-done' : ''}>
                  <label className="served-row">
                    <input
                      type="checkbox"
                      checked={served[i] ?? false}
                      onChange={() => toggle(i)}
                    />
                    <span className="served-item-name">
                      {line.name}
                      {line.qty > 1 && (
                        <span className="served-item-qty"> ×{line.qty}</span>
                      )}
                    </span>
                    <span className="served-item-price">
                      {formatYen(line.price * line.qty)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {allServed && (
              <p className="served-all-note">✓ すべて提供済みです。</p>
            )}
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>
            閉じる
          </button>
          <button
            className="btn-confirm"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
