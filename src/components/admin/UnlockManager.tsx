import { useState } from 'react';
import type { UnlockWindow } from '../../lib/types';
import { minutesToDisplay } from '../../lib/timeUtils';
import { BUSINESS_DURATION_MINUTES, TIME_STEP } from '../../lib/constants';

interface UnlockManagerProps {
  windows: UnlockWindow[];
  /** 解禁帯に席数指定が無いときの既定席数（settings） */
  defaultSeatCount: number;
  onAdd: (
    start: number,
    end: number,
    seatCount: number | null,
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onUpdateSeatCount: (id: string, seatCount: number | null) => Promise<void>;
}

function buildTimeOptions(max: number): number[] {
  const opts: number[] = [];
  for (let t = 0; t <= max; t += TIME_STEP) {
    opts.push(t);
  }
  return opts;
}

const TIME_OPTIONS = buildTimeOptions(BUSINESS_DURATION_MINUTES);

export function UnlockManager({
  windows,
  defaultSeatCount,
  onAdd,
  onRemove,
  onUpdateSeatCount,
}: UnlockManagerProps) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(BUSINESS_DURATION_MINUTES);
  const [seatCount, setSeatCount] = useState(defaultSeatCount);
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (startTime >= endTime) return;
    setAdding(true);
    await onAdd(startTime, endTime, seatCount);
    setAdding(false);
  }

  return (
    <div className="unlock-manager">
      <h3>受付解禁</h3>
      <div className="unlock-form">
        <select
          value={startTime}
          onChange={(e) => setStartTime(Number(e.target.value))}
        >
          {TIME_OPTIONS.filter((t) => t < BUSINESS_DURATION_MINUTES).map(
            (t) => (
              <option key={t} value={t}>
                {minutesToDisplay(t)}
              </option>
            ),
          )}
        </select>
        <span>〜</span>
        <select
          value={endTime}
          onChange={(e) => setEndTime(Number(e.target.value))}
        >
          {TIME_OPTIONS.filter((t) => t > 0).map((t) => (
            <option key={t} value={t}>
              {minutesToDisplay(t)}
            </option>
          ))}
        </select>
        <label className="unlock-seat-input">
          席数
          <input
            type="number"
            min={1}
            value={seatCount}
            onChange={(e) =>
              setSeatCount(Math.max(1, Number(e.target.value) || 1))
            }
          />
        </label>
        <button onClick={handleAdd} disabled={adding || startTime >= endTime}>
          {adding ? '追加中…' : '解禁'}
        </button>
      </div>

      {windows.length > 0 && (
        <ul className="unlock-list">
          {windows.map((w) => (
            <li key={w.id}>
              <span className="unlock-list-time">
                {minutesToDisplay(w.start_time)}〜
                {minutesToDisplay(w.end_time)}
              </span>
              <label className="unlock-list-seat">
                席数
                <input
                  type="number"
                  min={1}
                  value={w.seat_count ?? defaultSeatCount}
                  onChange={(e) =>
                    void onUpdateSeatCount(
                      w.id,
                      Math.max(1, Number(e.target.value) || 1),
                    )
                  }
                />
              </label>
              <button className="btn-delete" onClick={() => onRemove(w.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
