import { useState } from 'react';
import type { Reservation, UnlockWindow } from '../../lib/types';
import { minutesToDisplay } from '../../lib/timeUtils';
import { BUSINESS_DURATION_MINUTES, SET_DURATION } from '../../lib/constants';
import { formatYen } from '../../lib/pricing';
import { ServedCheckModal } from './ServedCheckModal';

interface ReservationLedgerProps {
  reservations: Reservation[];
  unlockWindows: UnlockWindow[];
  seatCount: number;
  onDeleteReservation: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

/** order_items に対する提供状況を判定（全提供 / 一部提供 / なし） */
function servedState(r: Reservation): 'all' | 'partial' | 'none' {
  const lines = r.order_items ?? [];
  if (lines.length === 0) return 'none';
  const served = Array.isArray(r.served_items) ? r.served_items : [];
  const count = lines.filter((_, i) => served[i] === true).length;
  if (count === 0) return 'none';
  if (count === lines.length) return 'all';
  return 'partial';
}

const PX_PER_MINUTE = 1.5;
const TOTAL_HEIGHT = BUSINESS_DURATION_MINUTES * PX_PER_MINUTE;

function getHourLabels(): number[] {
  const labels: number[] = [];
  for (let h = 17; h <= 25; h++) labels.push(h);
  return labels;
}

const HOUR_LABELS = getHourLabels();

export function ReservationLedger({
  reservations,
  unlockWindows,
  seatCount,
  onDeleteReservation,
  onRefresh,
}: ReservationLedgerProps) {
  const [servedTarget, setServedTarget] = useState<Reservation | null>(null);

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

        {unlockWindows.map((w) => (
          <div
            key={w.id}
            className="ledger-unlock-bg"
            style={{
              top: w.start_time * PX_PER_MINUTE,
              height: (w.end_time - w.start_time) * PX_PER_MINUTE,
            }}
          />
        ))}

        {Array.from({ length: seatCount }, (_, seatIdx) => {
          const seatNo = seatIdx + 1;
          const seatReservations = reservations.filter(
            (r) => r.seat_no === seatNo,
          );
          return (
            <div
              key={seatNo}
              className="ledger-lane"
              style={{
                left: `${(seatIdx / seatCount) * 100}%`,
                width: `${100 / seatCount}%`,
              }}
            >
              {seatReservations.map((r) => {
                const top = r.start_time * PX_PER_MINUTE;
                const height = r.sets * SET_DURATION * PX_PER_MINUTE;
                const rEnd = r.start_time + r.sets * SET_DURATION;
                const served = servedState(r);
                return (
                  <div
                    key={r.id}
                    className={`ledger-block ledger-block--clickable served-${served}`}
                    style={{ top, height }}
                    role="button"
                    tabIndex={0}
                    onClick={() => setServedTarget(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setServedTarget(r);
                      }
                    }}
                    title={`${r.customer_name}\n${minutesToDisplay(r.start_time)}〜${minutesToDisplay(rEnd)} (${r.sets}セット)\nタップで提供チェック`}
                  >
                    <div className="ledger-block-name">
                      {r.customer_name}
                      {r.menu_undecided && (
                        <span className="ledger-undecided">未定</span>
                      )}
                      {served === 'all' && (
                        <span className="ledger-served ledger-served--all">
                          ✓提供済
                        </span>
                      )}
                      {served === 'partial' && (
                        <span className="ledger-served ledger-served--partial">
                          一部
                        </span>
                      )}
                    </div>
                    <div className="ledger-block-time">
                      {minutesToDisplay(r.start_time)}〜{minutesToDisplay(rEnd)}
                    </div>
                    {r.subtotal > 0 && (
                      <div className="ledger-block-amount">
                        {formatYen(r.subtotal)}
                      </div>
                    )}
                    {r.note && (
                      <span
                        className="ledger-note-mark"
                        title={`備考：${r.note}`}
                      >
                        📝
                      </span>
                    )}
                    <button
                      className="ledger-block-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onDeleteReservation(r.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {servedTarget && (
        <ServedCheckModal
          reservation={servedTarget}
          onClose={() => setServedTarget(null)}
          onUpdated={async () => {
            await onRefresh();
            setServedTarget(null);
          }}
        />
      )}
    </div>
  );
}
