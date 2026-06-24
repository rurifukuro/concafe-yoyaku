import type { Reservation } from '../../lib/types';
import { formatYen, serviceCharge } from '../../lib/pricing';
import { minutesToDisplay } from '../../lib/timeUtils';
import { SET_DURATION } from '../../lib/constants';

interface SalesSummaryProps {
  reservations: Reservation[];
}

function orderSummary(r: Reservation): string {
  if (r.menu_undecided) return 'メニュー未定（当日決定）';
  if (!r.order_items || r.order_items.length === 0) return '—';
  return r.order_items.map((o) => `${o.name}×${o.qty}`).join('、');
}

export function SalesSummary({ reservations }: SalesSummaryProps) {
  const totalSubtotal = reservations.reduce((s, r) => s + r.subtotal, 0);
  const totalCash = reservations.reduce(
    (s, r) => s + r.subtotal + serviceCharge(r.subtotal).cash,
    0,
  );
  const totalCard = reservations.reduce(
    (s, r) => s + r.subtotal + serviceCharge(r.subtotal).card,
    0,
  );

  // 開始時刻順(useReservationsで既にソート済だが念のため)
  const rows = [...reservations].sort((a, b) => a.start_time - b.start_time);

  return (
    <div className="sales-summary">
      <h3>本日の売上見込み</h3>

      <div className="sales-totals">
        <div className="sales-total-card">
          <span className="sales-total-label">予約数</span>
          <span className="sales-total-value">{reservations.length}件</span>
        </div>
        <div className="sales-total-card">
          <span className="sales-total-label">小計合計</span>
          <span className="sales-total-value">{formatYen(totalSubtotal)}</span>
        </div>
        <div className="sales-total-card sales-total-cash">
          <span className="sales-total-label">現金想定（+10%）</span>
          <span className="sales-total-value">{formatYen(totalCash)}</span>
        </div>
        <div className="sales-total-card sales-total-card-pay">
          <span className="sales-total-label">現金以外想定（+20%）</span>
          <span className="sales-total-value">{formatYen(totalCard)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="sales-empty">この日の予約はまだありません。</p>
      ) : (
        <table className="sales-table">
          <thead>
            <tr>
              <th>時間</th>
              <th>お名前</th>
              <th>席</th>
              <th>席種</th>
              <th>追加オーダー</th>
              <th className="sales-num">小計</th>
              <th className="sales-num">現金</th>
              <th className="sales-num">現金以外</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rEnd = r.start_time + r.sets * SET_DURATION;
              const svc = serviceCharge(r.subtotal);
              return (
                <tr key={r.id}>
                  <td>
                    {minutesToDisplay(r.start_time)}〜{minutesToDisplay(rEnd)}
                  </td>
                  <td>{r.customer_name}</td>
                  <td>席{r.seat_no}</td>
                  <td>{r.seat_type_name ?? '—'}</td>
                  <td className="sales-orders">
                    {r.menu_undecided ? (
                      <span className="undecided-tag">メニュー未定（当日決定）</span>
                    ) : (
                      orderSummary(r)
                    )}
                  </td>
                  <td className="sales-num">{formatYen(r.subtotal)}</td>
                  <td className="sales-num">
                    {formatYen(r.subtotal + svc.cash)}
                  </td>
                  <td className="sales-num">
                    {formatYen(r.subtotal + svc.card)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
