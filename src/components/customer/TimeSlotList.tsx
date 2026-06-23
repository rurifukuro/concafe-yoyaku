import type { Reservation, UnlockWindow } from '../../lib/types';
import {
  getSlotStarts,
  minutesToDisplay,
  isSlotUnlocked,
  countAvailableSeats,
} from '../../lib/timeUtils';
import { SET_DURATION } from '../../lib/constants';

interface TimeSlotListProps {
  reservations: Reservation[];
  unlockWindows: UnlockWindow[];
  seatCount: number;
  onSelectSlot: (slotStart: number) => void;
}

export function TimeSlotList({
  reservations,
  unlockWindows,
  seatCount,
  onSelectSlot,
}: TimeSlotListProps) {
  const slots = getSlotStarts();

  return (
    <div className="time-slot-list">
      {slots.map((start) => {
        const end = start + SET_DURATION;
        const unlocked = isSlotUnlocked(start, end, unlockWindows);
        const available = countAvailableSeats(
          start,
          end,
          reservations,
          seatCount,
        );
        const filled = seatCount - available;

        return (
          <div
            key={start}
            className={`time-slot${!unlocked ? ' locked' : ''}`}
          >
            <div className="time-slot-time">
              {minutesToDisplay(start)}〜{minutesToDisplay(end)}
            </div>
            <div className="seat-bars">
              {Array.from({ length: seatCount }, (_, i) => (
                <div
                  key={i}
                  className={`seat-bar${i < filled ? ' filled' : ''}`}
                />
              ))}
            </div>
            <div className="time-slot-action">
              {!unlocked ? (
                <span className="status-label before">受付前</span>
              ) : available === 0 ? (
                <span className="status-label full">満席</span>
              ) : (
                <button
                  className="btn-reserve"
                  onClick={() => onSelectSlot(start)}
                >
                  予約（空{available}）
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
