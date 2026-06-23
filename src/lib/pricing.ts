import type { OrderLineSnapshot } from './types';

/**
 * サービス料(消費税とは別途)
 * - カード等(現金以外): 20%
 * - 現金精算: 10%(現金10%割引適用後)
 */
export const SERVICE_CHARGE_CARD = 0.2;
export const SERVICE_CHARGE_CASH = 0.1;

export interface BillingEstimate {
  /** セット料金(席種単価 × セット数) */
  setTotal: number;
  /** 追加オーダー合計 */
  ordersTotal: number;
  /** 小計(サービス料前) */
  subtotal: number;
  /** サービス料(現金 10%) */
  serviceCash: number;
  /** サービス料(現金以外 20%) */
  serviceCard: number;
  /** 合計(現金) */
  totalCash: number;
  /** 合計(現金以外) */
  totalCard: number;
}

/**
 * 会計目安を算出する。
 * サービス料は小計に対して現金10% / 現金以外20%を加算。
 */
export function computeBilling(
  seatUnitPrice: number,
  sets: number,
  orderLines: OrderLineSnapshot[],
): BillingEstimate {
  const setTotal = seatUnitPrice * sets;
  const ordersTotal = orderLines.reduce(
    (sum, line) => sum + line.price * line.qty,
    0,
  );
  const subtotal = setTotal + ordersTotal;
  const serviceCash = Math.round(subtotal * SERVICE_CHARGE_CASH);
  const serviceCard = Math.round(subtotal * SERVICE_CHARGE_CARD);
  return {
    setTotal,
    ordersTotal,
    subtotal,
    serviceCash,
    serviceCard,
    totalCash: subtotal + serviceCash,
    totalCard: subtotal + serviceCard,
  };
}

/**
 * 「1セット1オーダー必須」に対し、現在の注文で満たしているオーダー数。
 * counts_as_order=true の品の数量合計。
 */
export function countQualifyingOrders(orderLines: OrderLineSnapshot[]): number {
  return orderLines.reduce(
    (sum, line) => (line.counts_as_order ? sum + line.qty : sum),
    0,
  );
}

/** 小計からサービス料(現金10% / 現金以外20%)を算出 */
export function serviceCharge(subtotal: number): {
  cash: number;
  card: number;
} {
  return {
    cash: Math.round(subtotal * SERVICE_CHARGE_CASH),
    card: Math.round(subtotal * SERVICE_CHARGE_CARD),
  };
}

/** ¥1,234 形式 */
export function formatYen(n: number): string {
  return '¥' + n.toLocaleString('ja-JP');
}
