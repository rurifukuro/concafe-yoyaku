import type { Reservation, UnlockWindow } from '../../lib/types';
import { minutesToDisplay } from '../../lib/timeUtils';
import { BUSINESS_DURATION_MINUTES, SET_DURATION } from '../../lib/constants';

interface ReservationLedgerProps {
  reservations: Reservation[];
  unlockWindows: UnlockWindow[];
  seatCount: number;
  onDeleteReservation: (id: string) => Promise<void>;
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
}: ReservationLedgerProps) {
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
                return (
                  <div
                    key={r.id}
                    className="ledger-block"
                    style={{ top, height }}
                    title={`${r.customer_name}\n${minutesToDisplay(r.start_time)}〜${minutesToDisplay(rEnd)} (${r.sets}セット)`}
                  >
                    <div className="ledger-block-name">{r.customer_name}</div>
                    <div className="ledger-block-time">
                      {minutesToDisplay(r.start_time)}〜{minutesToDisplay(rEnd)}
                    </div>
                    <button
                      className="ledger-block-delete"
                      onClick={() => onDeleteReservation(r.id)}
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
    </div>
  );
}
