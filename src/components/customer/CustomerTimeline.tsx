import type { MouseEvent } from 'react';
import type { Reservation, UnlockWindow } from '../../lib/types';
import { minutesToDisplay } from '../../lib/timeUtils';
import {
  BUSINESS_DURATION_MINUTES,
  SET_DURATION,
  TIME_STEP,
} from '../../lib/constants';

interface CustomerTimelineProps {
  reservations: Reservation[];
  unlockWindows: UnlockWindow[];
  seatCount: number;
  onPickSlot: (slotStart: number) => void;
}

const PX_PER_MINUTE = 1.5;
const TOTAL_HEIGHT = BUSINESS_DURATION_MINUTES * PX_PER_MINUTE;

function getHourLabels(): number[] {
  const labels: number[] = [];
  for (let h = 17; h <= 25; h++) labels.push(h);
  return labels;
}

const HOUR_LABELS = getHourLabels();

export function CustomerTimeline({
  reservations,
  unlockWindows,
  seatCount,
  onPickSlot,
}: CustomerTimelineProps) {
  function handleZoneClick(
    e: MouseEvent<HTMLDivElement>,
    windowStart: number,
    windowEnd: number,
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let minute = windowStart + y / PX_PER_MINUTE;
    minute = Math.round(minute / TIME_STEP) * TIME_STEP;
    // 1セットが帯内に収まる範囲へクランプ
    const maxStart = windowEnd - SET_DURATION;
    if (minute > maxStart) minute = maxStart;
    if (minute < windowStart) minute = windowStart;
    onPickSlot(minute);
  }

  return (
    <div className="ledger">
      <div className="ledger-header">
        <div className="ledger-time-label" />
        {Array.from({ length: seatCount }, (_, i) => (
          <div key={i} className="ledger-seat-label">
            席{i + 1}
          </div>
        ))}
      </div>

      <div className="ledger-body" style={{ height: TOTAL_HEIGHT }}>
        {HOUR_LABELS.map((h) => {
          const offset = (h - 17) * 60;
          return (
            <div
              key={h}
              className="ledger-hour-line"
              style={{ top: offset * PX_PER_MINUTE }}
            >
              <span className="ledger-hour-text">{h}:00</span>
            </div>
          );
        })}

        {/* 受付解禁帯(クリックで予約) */}
        {unlockWindows.map((w) => (
          <div
            key={w.id}
            className="ledger-unlock-zone"
            style={{
              top: w.start_time * PX_PER_MINUTE,
              height: (w.end_time - w.start_time) * PX_PER_MINUTE,
            }}
            onClick={(e) => handleZoneClick(e, w.start_time, w.end_time)}
            title="タップで予約"
          >
            <span className="ledger-zone-hint">＋ タップで予約</span>
          </div>
        ))}

        {/* 席レーン + 予約済みブロック(名前は非表示) */}
        {Array.from({ length: seatCount }, (_, seatIdx) => {
          const seatNo = seatIdx + 1;
          const seatReservations = reservations.filter(
            (r) => r.seat_no === seatNo,
          );
          return (
            <div
              key={seatNo}
              className="ledger-lane ledger-lane--readonly"
              style={{
                left: `${(seatIdx / seatCount) * 100}%`,
                width: `${100 / seatCount}%`,
              }}
            >
              {seatReservations.map((r) => {
                const top = r.start_time * PX_PER_MINUTE;
                const height = r.sets * SET_DURATION * PX_PER_MINUTE;
                const rEnd = r.start_time + r.sets * SET_DURATION;
                return (
                  <div
                    key={r.id}
                    className="ledger-block ledger-block--reserved"
                    style={{ top, height }}
                    title={`予約済 ${minutesToDisplay(r.start_time)}〜${minutesToDisplay(rEnd)}`}
                  >
                    <div className="ledger-block-name">予約済</div>
                    <div className="ledger-block-time">
                      {minutesToDisplay(r.start_time)}〜{minutesToDisplay(rEnd)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="ledger-legend">
        空いている時間帯（受付中の枠）をタップすると予約できます。
        {unlockWindows.length === 0 && ' ※本日はまだ受付開始前です。'}
      </p>
    </div>
  );
}
