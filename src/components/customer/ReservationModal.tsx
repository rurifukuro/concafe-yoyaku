import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type {
  MakeReservationResult,
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

interface ReservationModalProps {
  date: string;
  slotStart: number;
  seatCount: number;
  reservations: Reservation[];
  unlockWindows: UnlockWindow[];
  onClose: () => void;
  onReserved: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  no_available_seat: '申し訳ありません。この時間帯は満席です。',
  not_unlocked: 'この時間帯はまだ受付開始前です。',
  invalid_time_range: '無効な時間指定です。',
};

export function ReservationModal({
  date,
  slotStart,
  seatCount,
  reservations,
  unlockWindows: _unlockWindows,
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

  const effectiveSets = Math.min(sets, maxSets);
  const endTime = startTime + effectiveSets * SET_DURATION;
  const available = countAvailableSeats(
    startTime,
    endTime,
    reservations,
    seatCount,
  );

  async function handleSubmit() {
    if (!name.trim()) {
      setError('お名前を入力してください');
      return;
    }
    setSubmitting(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('make_reservation', {
      p_date: date,
      p_start_time: startTime,
      p_sets: effectiveSets,
      p_customer_name: name.trim(),
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
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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

        <label>
          お名前
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="お名前"
            autoFocus
          />
        </label>

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
