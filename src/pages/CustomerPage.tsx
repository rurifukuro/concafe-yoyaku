import { useEffect, useRef, useState } from 'react';
import { Calendar } from '../components/customer/Calendar';
import { CustomerTimeline } from '../components/customer/CustomerTimeline';
import { ReservationModal } from '../components/customer/ReservationModal';
import { useReservations } from '../hooks/useReservations';
import {
  useUnlockWindows,
  useNextOpenDate,
} from '../hooks/useUnlockWindows';
import { useSettings } from '../hooks/useSettings';
import { useMenu } from '../hooks/useMenu';
import { formatDate } from '../lib/timeUtils';

export function CustomerPage() {
  const today = formatDate(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
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

  const noWindowToday = windows.length === 0;
  const hasOtherOpenDate = nextDate !== null && nextDate !== selectedDate;

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
              カレンダーに●が付いて予約できるようになります。
            </span>
          )}
        </div>
      )}

      <CustomerTimeline
        reservations={reservations}
        unlockWindows={windows}
        seatCount={seatCount}
        onPickSlot={setSelectedSlot}
      />

      {selectedSlot !== null && (
        <ReservationModal
          date={selectedDate}
          slotStart={selectedSlot}
          seatCount={seatCount}
          reservations={reservations}
          unlockWindows={windows}
          menuItems={menuItems}
          onClose={() => setSelectedSlot(null)}
          onReserved={handleReserved}
        />
      )}
    </div>
  );
}
