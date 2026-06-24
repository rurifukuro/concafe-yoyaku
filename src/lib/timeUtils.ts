import {
  BUSINESS_START_HOUR,
  BUSINESS_DURATION_MINUTES,
  SET_DURATION,
  TIME_STEP,
  LOW_AVAILABILITY_RATIO,
} from './constants';
import type { DayStatus } from './types';

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

/**
 * 受付解禁帯の全体から選べる開始時刻（10分刻み）。
 * タップ位置より「前の時間」も選べるよう、帯の先頭〜(末尾-1セット)を列挙する。
 */
export function getStartTimeOptionsInWindow(
  windowStart: number,
  windowEnd: number,
): number[] {
  const options: number[] = [];
  const last = windowEnd - SET_DURATION; // 1セットが帯内に収まる最後の開始時刻
  for (let t = windowStart; t <= last; t += TIME_STEP) {
    if (t >= 0 && t + SET_DURATION <= BUSINESS_DURATION_MINUTES) {
      options.push(t);
    }
  }
  return options;
}

export function getMaxSets(startTime: number): number {
  return Math.floor((BUSINESS_DURATION_MINUTES - startTime) / SET_DURATION);
}

/** 解禁帯の終端までに収まる最大セット数（営業終了も上限） */
export function getMaxSetsInWindow(
  startTime: number,
  windowEnd: number,
): number {
  const limit = Math.min(windowEnd, BUSINESS_DURATION_MINUTES);
  return Math.max(0, Math.floor((limit - startTime) / SET_DURATION));
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

/**
 * その日の空き状況（青=空きあり / 黄=空き少 / 赤=満席）を判定する。
 * - 満席: どの解禁帯のどの開始時刻でも 1セットが取れない（空席ゼロ）
 * - 空き少: 空席率が LOW_AVAILABILITY_RATIO 以下
 * - 空きあり: それ以外
 * 席数は解禁帯毎の seat_count（null のとき globalSeat）を使う。
 */
export function computeDayStatus(
  windows: { start_time: number; end_time: number; seat_count: number | null }[],
  reservations: { start_time: number; sets: number; seat_no: number }[],
  globalSeat: number,
): DayStatus {
  if (windows.length === 0) return 'full';

  let totalSlots = 0;
  let freeSlots = 0;
  let anyBookable = false;

  for (const w of windows) {
    const seats = w.seat_count ?? globalSeat;

    // 容量の概算: 帯を1セット単位の非重複グリッドに区切り、各区画の空席を集計
    for (let t = w.start_time; t + SET_DURATION <= w.end_time; t += SET_DURATION) {
      const avail = countAvailableSeats(t, t + SET_DURATION, reservations, seats);
      totalSlots += seats;
      freeSlots += Math.max(0, avail);
    }

    // 予約可能性: 10分刻みでどこか1セット取れるか
    for (let t = w.start_time; t + SET_DURATION <= w.end_time; t += TIME_STEP) {
      if (countAvailableSeats(t, t + SET_DURATION, reservations, seats) > 0) {
        anyBookable = true;
      }
    }
  }

  if (!anyBookable || freeSlots <= 0) return 'full';
  const freeRatio = totalSlots > 0 ? freeSlots / totalSlots : 1;
  if (freeRatio <= LOW_AVAILABILITY_RATIO) return 'low';
  return 'available';
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
