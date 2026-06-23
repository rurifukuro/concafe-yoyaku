import { useState } from 'react';
import { useAuth, AuthProvider } from '../hooks/useAuth';
import { AdminLogin } from '../components/admin/AdminLogin';
import { ReservationLedger } from '../components/admin/ReservationLedger';
import { UnlockManager } from '../components/admin/UnlockManager';
import { SeatCountSetting } from '../components/admin/SeatCountSetting';
import { useReservations } from '../hooks/useReservations';
import { useUnlockWindows } from '../hooks/useUnlockWindows';
import { useSettings } from '../hooks/useSettings';
import { formatDate } from '../lib/timeUtils';
import { supabase } from '../lib/supabase';

function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [date, setDate] = useState(formatDate(new Date()));

  const { reservations, refresh: refreshReservations } = useReservations(date);
  const { windows, addWindow, removeWindow } = useUnlockWindows(date);
  const { seatCount, updateSeatCount } = useSettings();

  function changeDate(delta: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(formatDate(d));
  }

  async function handleDeleteReservation(id: string) {
    await supabase.from('reservations').delete().eq('id', id);
    await refreshReservations();
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <h1>管理画面</h1>
        <div className="admin-user">
          <span>{user?.email}</span>
          <button onClick={() => void signOut()}>ログアウト</button>
        </div>
      </header>

      <div className="admin-controls">
        <div className="date-navigator">
          <button onClick={() => changeDate(-1)}>◀ 前日</button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button onClick={() => changeDate(1)}>翌日 ▶</button>
        </div>

        <SeatCountSetting current={seatCount} onUpdate={updateSeatCount} />
        <UnlockManager
          windows={windows}
          onAdd={addWindow}
          onRemove={removeWindow}
        />
      </div>

      <ReservationLedger
        reservations={reservations}
        unlockWindows={windows}
        seatCount={seatCount}
        onDeleteReservation={handleDeleteReservation}
      />
    </div>
  );
}

function AdminPageContent() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">読み込み中…</div>;
  if (!user) return <AdminLogin />;
  return <AdminDashboard />;
}

export function AdminPage() {
  return (
    <AuthProvider>
      <AdminPageContent />
    </AuthProvider>
  );
}
