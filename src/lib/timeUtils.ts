import {
  BUSINESS_START_HOUR,
  BUSINESS_DURATION_MINUTES,
  SET_DURATION,
  TIME_STEP,
} from './constants';

export function minutesToDisplay(minutes: number): string {
  const hour = BUSINESS_START_HOUR + Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${hour}:${min.toString().padStart(2, '0')}`;
}

export function getSlotStarts(): number[] {
  const slots: number[] = [];
  for (let m = 0; m < BUSINESS_DURATION_MINUTES; m += SET_DURATION) {
    slots.push(m);
  }
  return slots;
}

export function getStartTimeOptions(slotStart: number): number[] {
  const options: number[] = [];
  for (let t = slotStart; t < slotStart + SET_DURATION; t += TIME_STEP) {
    if (t < BUSINESS_DURATION_MINUTES) options.push(t);
  }
  return options;
}

export function getMaxSets(startTime: number): number {
  return Math.floor((BUSINESS_DURATION_MINUTES - startTime) / SET_DURATION);
}

export function rangesOverlap(
  s1: number,
  e1: number,
  s2: number,
  e2: number,
): boolean {
  return s1 < e2 && s2 < e1;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function isSlotUnlocked(
  slotStart: number,
  slotEnd: number,
  unlockWindows: { start_time: number; end_time: number }[],
): boolean {
  return unlockWindows.some((w) =>
    rangesOverlap(slotStart, slotEnd, w.start_time, w.end_time),
  );
}

export function countAvailableSeats(
  startTime: number,
  endTime: number,
  reservations: { start_time: number; sets: number; seat_no: number }[],
  totalSeats: number,
): number {
  const occupied = new Set<number>();
  for (const r of reservations) {
    const rEnd = r.start_time + r.sets * SET_DURATION;
    if (rangesOverlap(startTime, endTime, r.start_time, rEnd)) {
      occupied.add(r.seat_no);
    }
  }
  return totalSeats - occupied.size;
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}
