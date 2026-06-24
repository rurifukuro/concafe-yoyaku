export const BUSINESS_START_HOUR = 17;
export const BUSINESS_END_HOUR = 25;
export const BUSINESS_DURATION_MINUTES =
  (BUSINESS_END_HOUR - BUSINESS_START_HOUR) * 60; // 480
export const SET_DURATION = 40;
export const TIME_STEP = 10;
export const DEFAULT_SEAT_COUNT = 3;
export const SLOT_COUNT = BUSINESS_DURATION_MINUTES / SET_DURATION; // 12
// カレンダーの空き状況色分け: 空席率がこの値以下になったら「空き少（黄色▲）」
export const LOW_AVAILABILITY_RATIO = 0.34;
