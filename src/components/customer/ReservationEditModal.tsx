import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type {
  EditReservationResult,
  MenuCategory,
  MenuItem,
  OrderLineSnapshot,
  Reservation,
  UnlockWindow,
  VerifyPinResult,
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

interface ReservationEditModalProps {
  reservation: Reservation;
  seatCount: number;
  reservations: Reservation[];
  unlockWindows: UnlockWindow[];
  menuItems: MenuItem[];
  onClose: () => void;
  onUpdated: () => void;
}

const EDIT_ERROR_MESSAGES: Record<string, string> = {
  pin_mismatch: '暗証番号が一致しません。',
  not_found: '予約が見つかりませんでした。',
  no_available_seat: '申し訳ありません。この時間帯は満席です。',
  not_unlocked: 'この時間帯はまだ受付対象外です。',
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

type Phase = 'pin' | 'edit' | 'no_pin';

export function ReservationEditModal({
  reservation,
  seatCount,
  reservations,
  unlockWindows,
  menuItems,
  onClose,
  onUpdated,
}: ReservationEditModalProps) {
  const [phase, setPhase] = useState<Phase>('pin');
  const [pinInput, setPinInput] = useState('');
  const [verifiedPin, setVerifiedPin] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // 自分自身を除いた同日予約（空席・満席判定で自分を二重計上しない）
  const others = useMemo(
    () => reservations.filter((r) => r.id !== reservation.id),
    [reservations, reservation.id],
  );

  // タップ位置（予約開始）を含む受付解禁帯
  const activeWindow = useMemo(() => {
    const start = reservation.start_time;
    const fit = unlockWindows.find(
      (w) => w.start_time <= start && start + SET_DURATION <= w.end_time,
    );
    if (fit) return fit;
    const contains = unlockWindows.find(
      (w) => w.start_time <= start && start < w.end_time,
    );
    return contains ?? unlockWindows[0] ?? null;
  }, [unlockWindows, reservation.start_time]);

  const winStart = activeWindow?.start_time ?? reservation.start_time;
  const winEnd =
    activeWindow?.end_time ??
    Math.min(reservation.start_time + SET_DURATION, BUSINESS_DURATION_MINUTES);

  const startOptions = useMemo(() => {
    const opts = getStartTimeOptionsInWindow(winStart, winEnd);
    return opts.length > 0 ? opts : [reservation.start_time];
  }, [winStart, winEnd, reservation.start_time]);

  const [startTime, setStartTime] = useState(reservation.start_time);
  const [sets, setSets] = useState(reservation.sets);
  const [menuUndecided, setMenuUndecided] = useState(reservation.menu_undecided);
  const [seatTypeId, setSeatTypeId] = useState('');
  const [orderQty, setOrderQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seatItems = useMemo(
    () => menuItems.filter((m) => m.category === 'seat' && m.active),
    [menuItems],
  );

  // メニュー到着後、既存の予約内容（席種・注文）を名前一致でプリフィル
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || menuItems.length === 0) return;
    const seat = menuItems.find(
      (m) => m.category === 'seat' && m.name === reservation.seat_type_name,
    );
    setSeatTypeId(seat?.id ?? '');
    const q: Record<string, number> = {};
    for (const line of reservation.order_items) {
      const m = menuItems.find(
        (mi) => mi.category !== 'seat' && mi.name === line.name,
      );
      if (m) q[m.id] = (q[m.id] ?? 0) + line.qty;
    }
    setOrderQty(q);
    prefilled.current = true;
  }, [menuItems, reservation]);

  // startOptions が確定して現在値が候補に無ければ近い時刻へ寄せる
  useEffect(() => {
    if (!startOptions.includes(startTime)) {
      const below = startOptions.filter((t) => t <= startTime);
      const fallback = below.length > 0 ? below[below.length - 1] : undefined;
      setStartTime(fallback ?? startOptions[0] ?? reservation.start_time);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOptions]);

  const maxSets = Math.max(1, getMaxSetsInWindow(startTime, winEnd));
  const effectiveSets = Math.min(sets, maxSets);
  const endTime = startTime + effectiveSets * SET_DURATION;
  const available = countAvailableSeats(startTime, endTime, others, seatCount);

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

  function setQty(id: string, q: number) {
    setOrderQty((prev) => ({ ...prev, [id]: Math.max(0, q) }));
  }

  async function handleVerify() {
    if (!/^[0-9]{4}$/.test(pinInput)) {
      setPinError('暗証番号は4桁の数字で入力してください');
      return;
    }
    setVerifying(true);
    setPinError(null);
    const { data, error: rpcError } = await supabase.rpc(
      'verify_reservation_pin',
      { p_reservation_id: reservation.id, p_pin: pinInput },
    );
    setVerifying(false);
    if (rpcError) {
      setPinError('確認に失敗しました。もう一度お試しください。');
      return;
    }
    const res = data as VerifyPinResult;
    if (res.ok) {
      setVerifiedPin(pinInput);
      setPhase('edit');
    } else if (res.reason === 'no_pin') {
      setPhase('no_pin');
    } else {
      setPinError('暗証番号が一致しません。');
    }
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    const ordersPayload = menuUndecided
      ? []
      : Object.entries(orderQty)
          .filter(([, q]) => q > 0)
          .map(([item_id, qty]) => ({ item_id, qty }));

    const { data, error: rpcError } = await supabase.rpc('update_reservation', {
      p_reservation_id: reservation.id,
      p_pin: verifiedPin,
      p_start_time: startTime,
      p_sets: effectiveSets,
      p_seat_type_id: seatTypeId || null,
      p_orders: ordersPayload,
      p_menu_undecided: menuUndecided,
    });

    if (rpcError) {
      setError('変更に失敗しました。もう一度お試しください。');
      setSubmitting(false);
      return;
    }
    const result = data as EditReservationResult;
    if (result.error) {
      setError(EDIT_ERROR_MESSAGES[result.error] ?? '変更に失敗しました。');
      setSubmitting(false);
      return;
    }
    onUpdated();
  }

  async function handleCancelReservation() {
    if (!window.confirm('この予約を取り消します。よろしいですか？')) return;
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('cancel_reservation', {
      p_reservation_id: reservation.id,
      p_pin: verifiedPin,
    });
    if (rpcError) {
      setError('キャンセルに失敗しました。もう一度お試しください。');
      setSubmitting(false);
      return;
    }
    const result = data as EditReservationResult;
    if (result.error) {
      setError(EDIT_ERROR_MESSAGES[result.error] ?? 'キャンセルに失敗しました。');
      setSubmitting(false);
      return;
    }
    onUpdated();
  }

  // ---- フェーズ1: 暗証番号の確認 ----
  if (phase === 'pin') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h3>予約の確認・変更</h3>
          <p className="edit-pin-lead">
            {minutesToDisplay(reservation.start_time)}〜
            {minutesToDisplay(
              reservation.start_time + reservation.sets * SET_DURATION,
            )}
            の予約です。変更・キャンセルには予約時に設定した暗証番号（4桁）が必要です。
          </p>
          <label>
            暗証番号
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pinInput}
              autoFocus
              onChange={(e) =>
                setPinInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))
              }
              placeholder="例）1234"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleVerify();
              }}
            />
          </label>
          {pinError && <p className="error">{pinError}</p>}
          <div className="modal-actions">
            <button className="btn-cancel" onClick={onClose} disabled={verifying}>
              閉じる
            </button>
            <button
              className="btn-confirm"
              onClick={() => void handleVerify()}
              disabled={pinInput.length !== 4 || verifying}
            >
              {verifying ? '確認中…' : '確認'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- 暗証番号が未設定の予約 ----
  if (phase === 'no_pin') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h3>予約の変更</h3>
          <p className="edit-pin-lead">
            この予約には暗証番号が設定されていないため、ここからは変更・キャンセルが
            できません。お手数ですが、店舗までお問い合わせください。
          </p>
          <div className="modal-actions">
            <button className="btn-confirm" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- フェーズ2: フル編集 ----
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-content--wide"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>予約の変更</h3>
        <p className="edit-pin-lead">
          {reservation.customer_name} 様の予約内容を変更できます。
        </p>

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

        {/* 当日にメニューを決める */}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={menuUndecided}
            onChange={(e) => setMenuUndecided(e.target.checked)}
          />
          <span>当日にメニューを決める（注文予定を選ばずに変更）</span>
        </label>

        {/* ご注文予定 */}
        <div className="order-section">
          <div className="order-section-title">ご注文予定（任意）</div>
          <p className="order-section-note">
            予定の変更です。確定注文ではないので、当日この通りに注文しなくても大丈夫
            です。
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

        <div className="modal-actions modal-actions--edit">
          <button
            className="btn-danger"
            onClick={() => void handleCancelReservation()}
            disabled={submitting}
          >
            予約を取り消す
          </button>
          <div className="modal-actions-right">
            <button
              className="btn-cancel"
              onClick={onClose}
              disabled={submitting}
            >
              閉じる
            </button>
            <button
              className="btn-confirm"
              onClick={() => void handleSave()}
              disabled={submitting || available <= 0}
            >
              {submitting ? '保存中…' : '変更を保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
