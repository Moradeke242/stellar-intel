'use client';

import useSWR from 'swr';
import type { DepositRateComparison } from '@/types';

/**
 * Lean deposit-estimates hook for /onramp (interim ONR017): fetches the
 * server-side `fetchDepositRates` comparison through /api/deposit-rates.
 * Deliberately minimal next to `useAnchorRates` — no refresh countdown or
 * stale-while-refresh plumbing until the full on-ramp table (ONR018) lands.
 */

export interface UseDepositRatesResult {
  comparison: DepositRateComparison | undefined;
  isLoading: boolean;
  error: string | undefined;
  mutate: () => Promise<unknown>;
}

interface DepositRatesWire extends Omit<DepositRateComparison, 'rates'> {
  rates: Array<Omit<DepositRateComparison['rates'][number], 'updatedAt'> & { updatedAt: string }>;
}

async function fetchDepositRatesApi(url: string): Promise<DepositRateComparison> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Deposit rates request failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as DepositRatesWire;
  return {
    ...data,
    rates: data.rates.map((rate) => ({ ...rate, updatedAt: new Date(rate.updatedAt) })),
  };
}

export function useDepositRates(
  corridorId: string | null,
  amount: string,
  asset?: string
): UseDepositRatesResult {
  const amountOk = Number(amount) > 0;
  const key =
    corridorId && amountOk
      ? `/api/deposit-rates/${corridorId}?amount=${encodeURIComponent(amount)}${
          asset ? `&asset=${encodeURIComponent(asset)}` : ''
        }`
      : null;

  const { data, error, isLoading, mutate } = useSWR<DepositRateComparison, Error>(
    key,
    fetchDepositRatesApi,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  return {
    comparison: data,
    isLoading,
    error: error?.message,
    mutate,
  };
}
