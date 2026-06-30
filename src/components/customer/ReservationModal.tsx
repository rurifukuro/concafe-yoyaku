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
  getStartTimeOptionsInWindow,
  getMaxSetsInWindow,
  minutesToDisplay,
  countAvailableSeats,
} from '../../lib/timeUtils';
import { SET_DURATION, BUSINESS_DURATION_MINUTES } from '../../lib/constants';
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

/** 追加オーダーのカテゴリ表示順・ラベル・色クラス（♥付き） */
const ORDER_CATEGORIES: { key: MenuCategory; label: string; cls: string }[] = [
  { key: 'cast', label: 'キャストメニュー', cls: 'cat-cast' },
  { key: 'food', label: 'フード', cls: 'cat-food' },
  { key: 'shot', label: 'ショット', cls: 'cat-shot' },
  { key: 'champagne', label: 'シャンパン', cls: 'cat-champagne' },
  { key: 'option', label: 'オプション', cls: 'cat-option' },
];

export function ReservationModal({
  date,
  slotStart,
  seatCount,
  reservations,
  unlockWindows,
  menuItems,
  onClose,
  onReserved,
}: ReservationModalProps) {
  // タップ位置を含む受付解禁帯（1セットが収まる帯を優先）
  const activeWindow = useMemo(() => {
    const fit = unlockWindows.find(
      (w) => w.start_time <= slotStart && slotStart + SET_DURATION <= w.end_time,
    );
    if (fit) return fit;
    const contains = unlockWindows.find(
      (w) => w.start_time <= slotStart && slotStart < w.end_time,
    );
    return contains ?? unlockWindows[0] ?? null;
  }, [unlockWindows, slotStart]);

  const winStart = activeWindow?.start_time ?? slotStart;
  const winEnd =
    activeWindow?.end_time ??
    Math.min(slotStart + SET_DURATION, BUSINESS_DURATION_MINUTES);

  // 帯全体から開始時刻を列挙＝タップ位置より前の時間も選べる（#3）
  const startOptions = useMemo(() => {
    const opts = getStartTimeOptionsInWindow(winStart, winEnd);
    return opts.length > 0 ? opts : [slotStart];
  }, [winStart, winEnd, slotStart]);

  const [startTime, setStartTime] = useState(slotStart);
  // 帯が確定して slotStart が候補に無い場合は近い時刻へ寄せる
  useEffect(() => {
    if (!startOptions.includes(startTime)) {
      const below = startOptions.filter((t) => t <= slotStart);
      const fallback = below.length > 0 ? below[below.length - 1] : undefined;
      setStartTime(fallback ?? startOptions[0] ?? slotStart);
    }
    // startOptions 変化時のみクランプ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOptions]);

  const maxSets = Math.max(1, getMaxSetsInWindow(startTime, winEnd));
  const [sets, setSets] = useState(1);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [note, setNote] = useState('');
  const [menuUndecided, setMenuUndecided] = useState(false);
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
      menuUndecided
        ? []
        : menuItems
            .filter((m) => m.category !== 'seat' && (orderQty[m.id] ?? 0) > 0)
            .map((m) => ({
              name: m.name,
              price: m.price,
              qty: orderQty[m.id] ?? 0,
              counts_as_order: m.counts_as_order,
            })),
    [menuItems, orderQty, menuUndecided],
  );

  const billing = computeBilling(seatUnitPrice, effectiveSets, orderLines);
  const qualifying = countQualifyingOrders(orderLines);
  const shortfall = menuUndecided ? 0 : effectiveSets - qualifying;

  const pinValid = pin === '' || /^[0-9]{4}$/.test(pin);

  function setQty(id: string, q: number) {
    setOrderQty((prev) => ({ ...prev, [id]: Math.max(0, q) }));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('お名前を入力してください');
      return;
    }
    if (!pinValid) {
      setError('暗証番号は4桁の数字で入力してください');
      return;
    }
    setSubmitting(true);
    setError(null);

    const ordersPayload = menuUndecided
      ? []
      : Object.entries(orderQty)
          .filter(([, q]) => q > 0)
          .map(([item_id, qty]) => ({ item_id, qty }));

    const { data, error: rpcError } = await supabase.rpc('make_reservation', {
      p_date: date,
      p_start_time: startTime,
      p_sets: effectiveSets,
      p_customer_name: name.trim(),
      p_seat_type_id: seatTypeId || null,
      p_orders: ordersPayload,
      p_menu_undecided: menuUndecided,
      p_edit_pin: pin === '' ? null : pin,
      p_note: note.trim() === '' ? null : note.trim(),
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

        <label>
          暗証番号（4桁・任意）
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) =>
              setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))
            }
            placeholder="例）1234"
          />
          <span className="field-note">
            ※あとで予約のキャンセル・メニュー変更をする際に使います。
          </span>
        </label>

        <label>
          備考（任意）
          <textarea
            className="note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="アレルギー・記念日・お席のご希望など、ご自由にどうぞ"
          />
        </label>

        {/* 当日にメニューを決める（#4）— メニュー欄の上 */}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={menuUndecided}
            onChange={(e) => setMenuUndecided(e.target.checked)}
          />
          <span>当日にメニューを決める（注文予定を選ばずに予約）</span>
        </label>

        {/* 追加オーダー */}
        <div className="order-section">
          <div className="order-section-title">ご注文予定（任意）</div>
          <p className="order-section-note">
            予約時に注文の予定を選んでおくと、会計の目安がわかります。これは確定注文
            ではなく「予定」なので、予約後に変更でき、当日この通りに注文しなくても大丈
            夫です。選択しなくても予約できます。
          </p>
          {menuUndecided ? (
            <p className="order-undecided-note">
              当日お店でメニューを一緒に決めます（注文予定の入力はスキップします）。
            </p>
          ) : (
            ORDER_CATEGORIES.map(({ key, label, cls }) => {
              const items = menuItems.filter(
                (m) => m.category === key && m.active,
              );
              if (items.length === 0) return null;
              return (
                <div key={key} className={`order-category ${cls}`}>
                  <div className="order-category-label">
                    <span className="cat-heart">♥</span> {label}
                  </div>
                  {items.map((m) => {
                    const q = orderQty[m.id] ?? 0;
                    return (
                      <div key={m.id} className="order-item">
                        <span className="order-item-name">
                          {m.name}
                          {m.is_original && (
                            <span className="original-badge">オリシャン</span>
                          )}
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
            })
          )}
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
            {menuUndecided && '当日メニューを決めると金額が変わります。'}
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
            disabled={submitting || !name.trim() || !pinValid || available <= 0}
          >
            {submitting ? '予約中…' : '予約する'}
          </button>
        </div>
      </div>
    </div>
  );
}
