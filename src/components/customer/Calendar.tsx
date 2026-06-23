import { useState } from 'react';
import {
  formatDate,
  getDaysInMonth,
  getFirstDayOfWeek,
} from '../../lib/timeUtils';
import { useUnlockedDates } from '../../hooks/useUnlockWindows';

interface CalendarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function Calendar({ selectedDate, onSelectDate }: CalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const { unlockedDates } = useUnlockedDates(viewYear, viewMonth);

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

          const cls = [
            'calendar-cell',
            isSelected && 'selected',
            isPast && 'past',
            !isUnlocked && !isPast && 'no-unlock',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={dateStr}
              className={cls}
              onClick={() => {
                if (!isPast && isUnlocked) onSelectDate(dateStr);
              }}
            >
              <span className="calendar-day">{day}</span>
              {isUnlocked && !isPast && <span className="calendar-dot">●</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
