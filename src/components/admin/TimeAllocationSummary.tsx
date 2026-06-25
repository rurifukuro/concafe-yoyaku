import type { Reservation } from '../../lib/types';
import { minutesToDisplay } from '../../lib/timeUtils';
import { SET_DURATION, BUSINESS_DURATION_MINUTES } from '../../lib/constants';

interface TimeAllocationSummaryProps {
  reservations: Reservation[];
  seatCount: number;
}

/** 1時間帯（分） */
const BAND_MINUTES = 60;

interface BandRow {
  start: number;
  end: number;
  /** 席番号 -> その帯に按分された「席料を除く注文額」 */
  perSeat: Map<number, number>;
  /** その帯に在席している席番号 */
  presentSeats: Set<number>;
  /** 帯内の按分注文額の合計 */
  total: number;
}

/**
 * 各1時間帯ごとに、各席のお客さんへ割く接客時間の配分目安を算出する。
 * - 配分のもと = 席料を除いた小計（= subtotal − 席単価 × セット数 = 追加オーダー額）
 * - 1セット(40分)が時間帯をまたぐ場合は「被り分数」で按分する
 * - 注文0の時間帯（全員が席料だけ）は在席者で均等割にする
 */
export function TimeAllocationSummary({
  reservations,
  seatCount,
}: TimeAllocationSummaryProps) {
  const seats = Array.from({ length: seatCount }, (_, i) => i + 1);

  const bands: { start: number; end: number }[] = [];
  for (let t = 0; t < BUSINESS_DURATION_MINUTES; t += BAND_MINUTES) {
    bands.push({ start: t, end: Math.min(t + BAND_MINUTES, BUSINESS_DURATION_MINUTES) });
  }

  const rows: BandRow[] = bands.map((b) => {
    const perSeat = new Map<number, number>();
    const presentSeats = new Set<number>();
    for (const r of reservations) {
      const rStart = r.start_time;
      const durMin = r.sets * SET_DURATION;
      const rEnd = rStart + durMin;
      const overlap = Math.min(rEnd, b.end) - Math.max(rStart, b.start);
      if (overlap <= 0) continue;
      presentSeats.add(r.seat_no);
      // 席料を除いた小計（マイナスにならないようガード）
      const orderExcl = Math.max(0, r.subtotal - r.seat_unit_price * r.sets);
      // 被り分数で按分
      const allocated = durMin > 0 ? orderExcl * (overlap / durMin) : 0;
      perSeat.set(r.seat_no, (perSeat.get(r.seat_no) ?? 0) + allocated);
    }
    let total = 0;
    for (const v of perSeat.values()) total += v;
    return { start: b.start, end: b.end, perSeat, presentSeats, total };
  });

  const activeRows = rows.filter((r) => r.presentSeats.size > 0);

  /** 帯×席へ割く接客時間（分・在席なしは null）。注文0帯は在席者で均等割。各帯は60分。 */
  function allocCell(
    row: BandRow,
    seat: number,
  ): { text: string; equal: boolean } | null {
    if (!row.presentSeats.has(seat)) return null;
    if (row.total <= 0) {
      const m = Math.round(BAND_MINUTES / row.presentSeats.size);
      return { text: `${String(m)}分`, equal: true };
    }
    const v = row.perSeat.get(seat) ?? 0;
    return {
      text: `${String(Math.round((v / row.total) * BAND_MINUTES))}分`,
      equal: false,
    };
  }

  return (
    <div className="time-alloc">
      <h3>時間帯別 接客時間配分の目安</h3>
      <p className="time-alloc-note">
        注文額（席料を除いた小計）を在席の被り時間で按分し、1時間（60分）あたりに各席へ割く接客時間の目安（分）にしたものです。注文が無い時間帯は在席者で均等割。
      </p>
      {activeRows.length === 0 ? (
        <p className="sales-empty">この日の予約はまだありません。</p>
      ) : (
        <table className="sales-table time-alloc-table">
          <thead>
            <tr>
              <th>時間帯</th>
              {seats.map((s) => (
                <th key={s} className="sales-num">
                  席{s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeRows.map((row) => (
              <tr key={row.start}>
                <td>
                  {minutesToDisplay(row.start)}〜{minutesToDisplay(row.end)}
                </td>
                {seats.map((s) => {
                  const c = allocCell(row, s);
                  return (
                    <td key={s} className="sales-num">
                      {c ? (
                        <span className={c.equal ? 'alloc-equal' : 'alloc-pct'}>
                          {c.text}
                          {c.equal && (
                            <span className="alloc-equal-tag">均等</span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
