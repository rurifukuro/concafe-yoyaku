import { useState } from 'react';
import { Calendar } from '../components/customer/Calendar';
import { CustomerTimeline } from '../components/customer/CustomerTimeline';
import { ReservationModal } from '../components/customer/ReservationModal';
import { useReservations } from '../hooks/useReservations';
import { useUnlockWindows } from '../hooks/useUnlockWindows';
import { useSettings } from '../hooks/useSettings';
import { useMenu } from '../hooks/useMenu';
import { formatDate } from '../lib/timeUtils';

export function CustomerPage() {
  const today = formatDate(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const { reservations, refresh: refreshReservations } =
    useReservations(selectedDate);
  const { windows } = useUnlockWindows(selectedDate);
  const { seatCount } = useSettings();
  const { menuItems } = useMenu();

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
