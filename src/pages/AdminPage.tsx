import { useEffect, useRef, useState } from 'react';
import { useAuth, AuthProvider } from '../hooks/useAuth';
import { AdminLogin } from '../components/admin/AdminLogin';
import { ReservationLedger } from '../components/admin/ReservationLedger';
import { SalesSummary } from '../components/admin/SalesSummary';
import { TimeAllocationSummary } from '../components/admin/TimeAllocationSummary';
import { MenuManager } from '../components/admin/MenuManager';
import { UnlockManager } from '../components/admin/UnlockManager';
import { SeatCountSetting } from '../components/admin/SeatCountSetting';
import { useReservations } from '../hooks/useReservations';
import { useUnlockWindows, useNextOpenDate } from '../hooks/useUnlockWindows';
import { useSettings } from '../hooks/useSettings';
import { formatDate } from '../lib/timeUtils';
import { supabase } from '../lib/supabase';

function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [date, setDate] = useState(formatDate(new Date()));
  // 管理者が日付を選んだら自動誘導で上書きしない
  const userPicked = useRef(false);

  const { reservations, refresh: refreshReservations } = useReservations(date);
  const { windows, addWindow, removeWindow, updateWindowSeatCount } =
    useUnlockWindows(date);
  const { seatCount, updateSeatCount } = useSettings();
  const { nextDate } = useNextOpenDate();

  // 初期表示は最新の予約解禁日へ寄せる。解禁日が無ければ今日のまま（既存仕様）。
  useEffect(() => {
    if (!userPicked.current && nextDate && nextDate !== date) {
      setDate(nextDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextDate]);

  function changeDate(delta: number) {
    userPicked.current = true;
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(formatDate(d));
  }

  // この日の表示用席数（解禁帯毎の設定を優先、複数帯は多い方）
  const effectiveSeatCount =
    windows.length > 0
      ? Math.max(...windows.map((w) => w.seat_count ?? seatCount))
      : seatCount;

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
            onChange={(e) => {
              userPicked.current = true;
              setDate(e.target.value);
            }}
          />
          <button onClick={() => changeDate(1)}>翌日 ▶</button>
        </div>

        <SeatCountSetting current={seatCount} onUpdate={updateSeatCount} />
        <UnlockManager
          windows={windows}
          defaultSeatCount={seatCount}
          onAdd={addWindow}
          onRemove={removeWindow}
          onUpdateSeatCount={updateWindowSeatCount}
        />
      </div>

      <ReservationLedger
        reservations={reservations}
        unlockWindows={windows}
        seatCount={effectiveSeatCount}
        onDeleteReservation={handleDeleteReservation}
      />

      <TimeAllocationSummary
        reservations={reservations}
        seatCount={effectiveSeatCount}
      />

      <SalesSummary reservations={reservations} />

      <details className="menu-manager-details">
        <summary>メニュー管理（会計目安に使う品目・価格を編集）</summary>
        <MenuManager />
      </details>
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
