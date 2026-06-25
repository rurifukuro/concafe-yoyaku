import { useEffect, useRef, useState } from 'react';
import { Calendar } from '../components/customer/Calendar';
import { CustomerTimeline } from '../components/customer/CustomerTimeline';
import { ReservationModal } from '../components/customer/ReservationModal';
import { ReservationEditModal } from '../components/customer/ReservationEditModal';
import { useReservations } from '../hooks/useReservations';
import {
  useUnlockWindows,
  useNextOpenDate,
} from '../hooks/useUnlockWindows';
import { useSettings } from '../hooks/useSettings';
import { useMenu } from '../hooks/useMenu';
import { formatDate } from '../lib/timeUtils';
import type { Reservation } from '../lib/types';

export function CustomerPage() {
  const today = formatDate(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<Reservation | null>(null);
  // ユーザーが自分で日付を選んだら、自動誘導で上書きしない
  const userPicked = useRef(false);

  const { reservations, refresh: refreshReservations } =
    useReservations(selectedDate);
  const { windows } = useUnlockWindows(selectedDate);
  const { nextDate, loading: nextLoading } = useNextOpenDate();
  const { seatCount } = useSettings();
  const { menuItems } = useMenu();

  // 初期表示が「受付していない今日」で行き止まりにならないよう、
  // 最短の予約可能日へ一度だけ自動で寄せる。
  useEffect(() => {
    if (!userPicked.current && nextDate && nextDate !== selectedDate) {
      setSelectedDate(nextDate);
    }
    // nextDate 確定時のみ評価（ユーザー操作後は userPicked で抑止）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextDate]);

  function handlePickDate(date: string) {
    userPicked.current = true;
    setSelectedDate(date);
  }

  function handleReserved() {
    setSelectedSlot(null);
    void refreshReservations();
  }

  function handleEdited() {
    setEditTarget(null);
    void refreshReservations();
  }

  const noWindowToday = windows.length === 0;
  const hasOtherOpenDate = nextDate !== null && nextDate !== selectedDate;

  // この日の席数は解禁帯毎の設定を優先（未設定の帯は既定値）。
  // 複数帯あるときは多い方を表示上限に使う。
  const effectiveSeatCount =
    windows.length > 0
      ? Math.max(...windows.map((w) => w.seat_count ?? seatCount))
      : seatCount;

  return (
    <div className="customer-page">
      <h1 className="app-title">予約</h1>

      <Calendar selectedDate={selectedDate} onSelectDate={handlePickDate} />

      <h2 className="section-title">
        {selectedDate.replace(/-/g, '/')} の予約状況
      </h2>

      {noWindowToday && !nextLoading && (
        <div className="notice-banner" role="status">
          {hasOtherOpenDate ? (
            <>
              <span>この日は受付していません。最短の予約可能日：</span>
              <button
                type="button"
                className="notice-link"
                onClick={() => handlePickDate(nextDate)}
              >
                {nextDate.replace(/-/g, '/')} を見る
              </button>
            </>
          ) : (
            <span>
              現在、予約を受け付けている日程がありません。店舗が受付を開始すると、
              カレンダーの日付が青く表示され予約できるようになります。
            </span>
          )}
        </div>
      )}

      <CustomerTimeline
        reservations={reservations}
        unlockWindows={windows}
        seatCount={effectiveSeatCount}
        onPickSlot={setSelectedSlot}
        onPickReservation={setEditTarget}
      />

      {selectedSlot !== null && (
        <ReservationModal
          date={selectedDate}
          slotStart={selectedSlot}
          seatCount={effectiveSeatCount}
          reservations={reservations}
          unlockWindows={windows}
          menuItems={menuItems}
          onClose={() => setSelectedSlot(null)}
          onReserved={handleReserved}
        />
      )}

      {editTarget !== null && (
        <ReservationEditModal
          reservation={editTarget}
          seatCount={effectiveSeatCount}
          reservations={reservations}
          unlockWindows={windows}
          menuItems={menuItems}
          onClose={() => setEditTarget(null)}
          onUpdated={handleEdited}
        />
      )}
    </div>
  );
}
