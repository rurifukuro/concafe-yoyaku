import { useState } from 'react';
import {
  formatDate,
  getDaysInMonth,
  getFirstDayOfWeek,
} from '../../lib/timeUtils';
import { useMonthAvailability } from '../../hooks/useUnlockWindows';
import type { DayStatus } from '../../lib/types';

interface CalendarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 空き状況ごとの追加クラスと記号 */
const STATUS_META: Record<DayStatus, { cls: string; mark: string }> = {
  available: { cls: 'avail', mark: '〇' },
  low: { cls: 'low', mark: '▲' },
  full: { cls: 'full', mark: '×' },
};

export function Calendar({ selectedDate, onSelectDate }: CalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const { unlockedDates, statusByDate } = useMonthAvailability(
    viewYear,
    viewMonth,
  );

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button onClick={prevMonth}>◀</button>
        <span>
          {viewYear}年{viewMonth + 1}月
        </span>
        <button onClick={nextMonth}>▶</button>
      </div>
      <div className="calendar-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((day, i) => {
          if (day === null)
            return <div key={`e-${String(i)}`} className="calendar-cell" />;

          const dateStr = formatDate(new Date(viewYear, viewMonth, day));
          const isUnlocked = unlockedDates.has(dateStr);
          const isSelected = dateStr === selectedDate;
          const isPast = new Date(viewYear, viewMonth, day) < todayStart;
          const status = statusByDate.get(dateStr);
          const meta =
            isUnlocked && !isPast && status ? STATUS_META[status] : null;
          // 満席（full）は受付帯があっても予約できないのでタップ不可
          const isClickable = !isPast && isUnlocked && status !== 'full';

          const cls = [
            'calendar-cell',
            isSelected && 'selected',
            isPast && 'past',
            !isUnlocked && !isPast && 'no-unlock',
            meta && `status-${meta.cls}`,
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={dateStr}
              className={cls}
              onClick={() => {
                if (isClickable) onSelectDate(dateStr);
              }}
            >
              <span className="calendar-day">{day}</span>
              {meta && meta.mark && (
                <span className="calendar-mark">{meta.mark}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span className="legend-item">
          <span className="legend-swatch status-avail" />空きあり 〇
        </span>
        <span className="legend-item">
          <span className="legend-swatch status-low" />空き少 ▲
        </span>
        <span className="legend-item">
          <span className="legend-swatch status-full" />満席 ×
        </span>
      </div>
    </div>
  );
}
