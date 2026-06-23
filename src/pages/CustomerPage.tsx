import { useState } from 'react';
import { Calendar } from '../components/customer/Calendar';
import { TimeSlotList } from '../components/customer/TimeSlotList';
import { ReservationModal } from '../components/customer/ReservationModal';
import { useReservations } from '../hooks/useReservations';
import { useUnlockWindows } from '../hooks/useUnlockWindows';
import { useSettings } from '../hooks/useSettings';
import { formatDate } from '../lib/timeUtils';

export function CustomerPage() {
  const today = formatDate(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const { reservations, refresh: refreshReservations } =
    useReservations(selectedDate);
  const { windows } = useUnlockWindows(selectedDate);
  const { seatCount } = useSettings();

  function handleReserved() {
    setSelectedSlot(null);
    void refreshReservations();
  }

  return (
    <div className="customer-page">
      <h1 className="app-title">予約</h1>

      <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <h2 className="section-title">
        {selectedDate.replace(/-/g, '/')} の予約状況
      </h2>
      <TimeSlotList
        reservations={reservations}
        unlockWindows={windows}
        seatCount={seatCount}
        onSelectSlot={setSelectedSlot}
      />

      {selectedSlot !== null && (
        <ReservationModal
          date={selectedDate}
          slotStart={selectedSlot}
          seatCount={seatCount}
          reservations={reservations}
          unlockWindows={windows}
          onClose={() => setSelectedSlot(null)}
          onReserved={handleReserved}
        />
      )}
    </div>
  );
}
