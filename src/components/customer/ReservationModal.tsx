import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type {
  MakeReservationResult,
  MenuCategory,
  MenuItem,
  OrderLineSnapshot,
  Reservation,
  UnlockWindow,
} from '../../lib/types';
import {
  getStartTimeOptions,
  getMaxSets,
  minutesToDisplay,
  countAvailableSeats,
} from '../../lib/timeUtils';
import { SET_DURATION } from '../../lib/constants';
import {
  computeBilling,
  countQualifyingOrders,
  formatYen,
} from '../../lib/pricing';

interface ReservationModalProps {
  date: string;
  slotStart: number;
  seatCount: number;
  reservations: Reservation[];
  unlockWindows: UnlockWindow[];
  menuItems: MenuItem[];
  onClose: () => void;
  onReserved: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  no_available_seat: '申し訳ありません。この時間帯は満席です。',
  not_unlocked: 'この時間帯はまだ受付開始前です。',
  invalid_time_range: '無効な時間指定です。',
};

/** 追加オーダーのカテゴリ表示順とラベル */
const ORDER_CATEGORIES: { key: MenuCategory; label: string }[] = [
  { key: 'cast', label: 'キャストメニュー' },
  { key: 'food', label: 'フード' },
  { key: 'shot', label: 'ショット' },
  { key: 'champagne', label: 'シャンパン' },
  { key: 'option', label: 'オプション' },
];

export function ReservationModal({
  date,
  slotStart,
  seatCount,
  reservations,
  unlockWindows: _unlockWindows,
  menuItems,
  onClose,
  onReserved,
}: ReservationModalProps) {
  const startOptions = getStartTimeOptions(slotStart);
  const [startTime, setStartTime] = useState(startOptions[0] ?? slotStart);
  const maxSets = getMaxSets(startTime);
  const [sets, setSets] = useState(1);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seatItems = useMemo(
    () => menuItems.filter((m) => m.category === 'seat' && m.active),
    [menuItems],
  );
  const [seatTypeId, setSeatTypeId] = useState('');
  const [orderQty, setOrderQty] = useState<Record<string, number>>({});

  // メニュー読込後、未選択なら先頭の席種を既定に
  useEffect(() => {
    if (!seatTypeId && seatItems.length > 0) {
      setSeatTypeId(seatItems[0]?.id ?? '');
    }
  }, [seatItems, seatTypeId]);

  const effectiveSets = Math.min(sets, maxSets);
  const endTime = startTime + effectiveSets * SET_DURATION;
  const available = countAvailableSeats(
    startTime,
    endTime,
    reservations,
    seatCount,
  );

  const selectedSeat = seatItems.find((m) => m.id === seatTypeId);
  const seatUnitPrice = selectedSeat?.price ?? 0;

  const orderLines: OrderLineSnapshot[] = useMemo(
    () =>
      menuItems
        .filter((m) => m.category !== 'seat' && (orderQty[m.id] ?? 0) > 0)
        .map((m) => ({
          name: m.name,
          price: m.price,
          qty: orderQty[m.id] ?? 0,
          counts_as_order: m.counts_as_order,
        })),
    [menuItems, orderQty],
  );

  const billing = computeBilling(seatUnitPrice, effectiveSets, orderLines);
  const qualifying = countQualifyingOrders(orderLines);
  const shortfall = effectiveSets - qualifying;

  function setQty(id: string, q: number) {
    setOrderQty((prev) => ({ ...prev, [id]: Math.max(0, q) }));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('お名前を入力してください');
      return;
    }
    setSubmitting(true);
    setError(null);

    const ordersPayload = Object.entries(orderQty)
      .filter(([, q]) => q > 0)
      .map(([item_id, qty]) => ({ item_id, qty }));

    const { data, error: rpcError } = await supabase.rpc('make_reservation', {
      p_date: date,
      p_start_time: startTime,
      p_sets: effectiveSets,
      p_customer_name: name.trim(),
      p_seat_type_id: seatTypeId || null,
      p_orders: ordersPayload,
    });

    if (rpcError) {
      setError('予約に失敗しました。もう一度お試しください。');
      setSubmitting(false);
      return;
    }

    const result = data as MakeReservationResult;
    if (result.error) {
      setError(ERROR_MESSAGES[result.error] ?? '予約に失敗しました。');
      setSubmitting(false);
      return;
    }

    onReserved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-content--wide"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>予約</h3>

        <label>
          開始時刻
          <select
            value={startTime}
            onChange={(e) => {
              setStartTime(Number(e.target.value));
              setSets(1);
            }}
          >
            {startOptions.map((t) => (
              <option key={t} value={t}>
                {minutesToDisplay(t)}
              </option>
            ))}
          </select>
        </label>

        <label>
          セット数（1セット = 40分）
          <select
            value={effectiveSets}
            onChange={(e) => setSets(Number(e.target.value))}
          >
            {Array.from({ length: maxSets }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}セット（{minutesToDisplay(startTime)}〜
                {minutesToDisplay(startTime + n * SET_DURATION)}）
              </option>
            ))}
          </select>
        </label>

        {seatItems.length > 0 && (
          <label>
            席種
            <select
              value={seatTypeId}
              onChange={(e) => setSeatTypeId(e.target.value)}
            >
              {seatItems.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{formatYen(m.price)}／セット）
                </option>
              ))}
            </select>
            {selectedSeat?.note && (
              <span className="field-note">※{selectedSeat.note}</span>
            )}
          </label>
        )}

        <label>
          お名前
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="お名前"
          />
        </label>

        {/* 追加オーダー */}
        <div className="order-section">
          <div className="order-section-title">追加オーダー（任意）</div>
          {ORDER_CATEGORIES.map(({ key, label }) => {
            const items = menuItems.filter(
              (m) => m.category === key && m.active,
            );
            if (items.length === 0) return null;
            return (
              <div key={key} className="order-category">
                <div className="order-category-label">{label}</div>
                {items.map((m) => {
                  const q = orderQty[m.id] ?? 0;
                  return (
                    <div key={m.id} className="order-item">
                      <span className="order-item-name">
                        {m.name}
                        {m.counts_as_order && (
                          <span className="order-badge">1オーダー</span>
                        )}
                      </span>
                      <span className="order-item-price">
                        {formatYen(m.price)}
                      </span>
                      <span className="qty-stepper">
                        <button
                          type="button"
                          onClick={() => setQty(m.id, q - 1)}
                          disabled={q <= 0}
                          aria-label="減らす"
                        >
                          −
                        </button>
                        <span className="qty-value">{q}</span>
                        <button
                          type="button"
                          onClick={() => setQty(m.id, q + 1)}
                          aria-label="増やす"
                        >
                          ＋
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* 会計目安 */}
        <div className="billing-card">
          <div className="billing-title">会計目安</div>
          <div className="billing-row">
            <span>
              セット料金（{formatYen(seatUnitPrice)} × {effectiveSets}）
            </span>
            <span>{formatYen(billing.setTotal)}</span>
          </div>
          <div className="billing-row">
            <span>追加オーダー</span>
            <span>{formatYen(billing.ordersTotal)}</span>
          </div>
          <div className="billing-row billing-subtotal">
            <span>小計</span>
            <span>{formatYen(billing.subtotal)}</span>
          </div>
          <div className="billing-row billing-cash">
            <span>合計（現金 ＝ サービス料10%）</span>
            <span>{formatYen(billing.totalCash)}</span>
          </div>
          <div className="billing-row billing-card-row">
            <span>合計（現金以外 ＝ サービス料20%）</span>
            <span>{formatYen(billing.totalCard)}</span>
          </div>
          <p className="billing-note">
            ※サービス料は消費税とは別途。金額は目安です。
          </p>
        </div>

        {shortfall > 0 && (
          <p className="warning">
            ※1セットにつき1オーダー必須です（あと{shortfall}点）
          </p>
        )}
        {available <= 0 && (
          <p className="warning">この時間帯は空席がありません。</p>
        )}
        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button
            className="btn-cancel"
            onClick={onClose}
            disabled={submitting}
          >
            キャンセル
          </button>
          <button
            className="btn-confirm"
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || available <= 0}
          >
            {submitting ? '予約中…' : '予約する'}
          </button>
        </div>
      </div>
    </div>
  );
}
