'use client';

import { useEffect, useRef, useState } from 'react';
import { authenticate } from '@/lib/stellar/sep10';
import { initiateDeposit } from '@/lib/stellar/sep24';
import { getResolvedAnchorById } from '@/lib/stellar/anchors';
import {
  assertSep38Capable,
  postSep38Quote,
  onQuoteExpired,
  QuoteExpiredError,
} from '@/lib/stellar/sep38';
import { classifyExecuteError, isRetryableExecuteError } from '@/lib/errors/messages';
import { QuotePill } from '@/components/ui/QuotePill';
import { KycIframe } from '@/components/offramp/KycIframe';
import type { AnchorRate, Sep38Quote } from '@/types';

// ─── Step definitions ─────────────────────────────────────────────────────────

export type DepositDrawerStep =
  'idle' | 'authenticating' | 'quoting' | 'initiating' | 'kyc' | 'done' | 'error';

const STEP_LABELS: Record<DepositDrawerStep, string> = {
  idle: 'Ready',
  authenticating: 'Proving wallet ownership to anchor…',
  quoting: 'Locking in a firm quote…',
  initiating: 'Initiating deposit…',
  kyc: 'Complete deposit in popup…',
  done: 'Deposit submitted',
  error: 'Something went wrong',
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DepositDrawerProps {
  rate: AnchorRate | null;
  amount: string;
  publicKey: string;
  onClose: () => void;
  onDepositStarted?: (transactionId: string, url: string) => void;
  onExecuteStarted?: (transactionId: string, url: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DepositDrawer({
  rate,
  amount,
  publicKey,
  onClose,
  onDepositStarted,
  onExecuteStarted,
}: DepositDrawerProps) {
  const [step, setStep] = useState<DepositDrawerStep>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorIsRetryable, setErrorIsRetryable] = useState(true);
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [kycOrigin, setKycOrigin] = useState<string | null>(null);
  const [firmQuote, setFirmQuote] = useState<Sep38Quote | null>(null);

  const quoteExpiredRef = useRef(false);
  const quoteExpiryCleanupRef = useRef<(() => void) | null>(null);
  const kycResolveRef = useRef<((transactionId: string) => void) | null>(null);
  const kycRejectRef = useRef<((error: Error) => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      quoteExpiryCleanupRef.current?.();
    };
  }, []);

  const isOpen = rate !== null;

  async function handleDeposit() {
    if (!rate) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setStep('authenticating');
    setErrorMsg(null);
    setFirmQuote(null);
    quoteExpiredRef.current = false;
    quoteExpiryCleanupRef.current?.();
    quoteExpiryCleanupRef.current = null;

    try {
      // Step 0 — Resolve anchor capabilities
      const anchor = await getResolvedAnchorById(rate.anchorId);

      // Step 1 — SEP-10 auth
      const auth = await authenticate(anchor, publicKey);

      // Step 1.5 — Lock in a firm SEP-38 quote, when the anchor advertises one
      let quoteId: string | undefined;
      let quoteServer: string | null = null;
      try {
        quoteServer = assertSep38Capable(anchor);
      } catch {
        quoteServer = null;
      }

      if (quoteServer) {
        setStep('quoting');
        try {
          const parts = rate.corridorId.split('-');
          const fiatCode =
            (rate as unknown as { fiatCode?: string }).fiatCode ||
            (parts[0]?.toLowerCase() === anchor.assetCode.toLowerCase()
              ? parts[1]
              : parts[0]
            )?.toUpperCase() ||
            'USD';

          const quote = await postSep38Quote(quoteServer, auth.jwt, {
            sell_asset: `iso4217:${fiatCode}`,
            buy_asset: `stellar:${anchor.assetCode}:${anchor.assetIssuer}`,
            sell_amount: amount,
            context: 'sep24',
          });
          setFirmQuote(quote);
          quoteId = quote.id;
          quoteExpiryCleanupRef.current = onQuoteExpired(quote, () => {
            quoteExpiredRef.current = true;
          });
        } catch (quoteErr) {
          // If quoting throws, fall back to the indicative flow and log it. Never block the deposit.
          // eslint-disable-next-line no-console
          console.warn(
            '[DepositDrawer] SEP-38 firm quote failed, falling back to indicative rate:',
            quoteErr
          );
          setFirmQuote(null);
          quoteId = undefined;
        }
      }

      // Step 2 — Initiate SEP-24 deposit
      setStep('initiating');
      if (quoteExpiredRef.current) throw new QuoteExpiredError();

      const depositResp = await initiateDeposit(
        anchor,
        {
          assetCode: anchor.assetCode,
          assetIssuer: anchor.assetIssuer,
          amount,
          account: publicKey,
          jwt: auth.jwt,
          ...(quoteId ? { quoteId } : {}),
        },
        signal
      );

      // Step 3 — KYC interactive window
      setStep('kyc');
      const url = new URL(depositResp.url);
      setKycUrl(depositResp.url);
      setKycOrigin(url.origin);

      const transactionId = await new Promise<string>((resolve, reject) => {
        kycResolveRef.current = resolve;
        kycRejectRef.current = reject;
      });

      kycResolveRef.current = null;
      kycRejectRef.current = null;

      if (quoteExpiredRef.current) throw new QuoteExpiredError();

      setStep('done');
      onDepositStarted?.(transactionId, depositResp.url);
      onExecuteStarted?.(transactionId, depositResp.url);
      onClose();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;

      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('User rejected') || message.includes('User cancelled')) {
        setStep('idle');
        return;
      }

      setErrorMsg(classifyExecuteError(err));
      setErrorIsRetryable(isRetryableExecuteError(err));
      setStep('error');
    } finally {
      kycResolveRef.current = null;
      kycRejectRef.current = null;
    }
  }

  const isRunning = !['idle', 'done', 'error'].includes(step);

  const handleKycComplete = (transactionId: string) => {
    kycResolveRef.current?.(transactionId);
  };

  const handleKycCancel = () => {
    kycRejectRef.current?.(new Error('User cancelled the transaction'));
  };

  const handleKycError = (error: Error) => {
    kycRejectRef.current?.(error);
  };

  const fiat = rate?.corridorId.split('-')[0]?.toUpperCase() ?? 'USD';
  const crypto = rate?.corridorId.split('-')[1]?.toUpperCase() ?? 'USDC';

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={isRunning ? undefined : onClose}
          aria-hidden="true"
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Deposit"
        className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-gray-900 sm:bottom-auto sm:left-auto sm:right-8 sm:top-1/2 sm:w-96 sm:-translate-y-1/2 sm:rounded-2xl ${
          isOpen ? 'translate-y-0' : 'translate-y-full sm:translate-y-full'
        }`}
      >
        <div className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Deposit via {rate?.anchorName ?? ''}
            </h2>
            <button
              onClick={onClose}
              disabled={isRunning}
              aria-label="Close"
              className="rounded-lg p-1 text-secondary-text hover:text-primary-text disabled:opacity-40"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {rate && (
            <div className="mb-5 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">You send</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {amount} {fiat}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-2 dark:border-gray-700">
                  <dt className="font-medium text-gray-700 dark:text-gray-300">You receive</dt>
                  <dd className="font-semibold text-green-600 dark:text-green-400">
                    {firmQuote
                      ? `${firmQuote.buy_amount} ${crypto}`
                      : `${(rate.totalReceived ?? 0).toLocaleString()} ${crypto}`}
                  </dd>
                </div>
                {firmQuote && (
                  <div className="flex items-center justify-between border-t border-gray-100 pt-2 dark:border-gray-700">
                    <dt className="text-gray-500">Price</dt>
                    <dd>
                      <QuotePill
                        source="sep38"
                        expiresAt={new Date(firmQuote.expires_at)}
                        onExpire={() => {
                          quoteExpiredRef.current = true;
                        }}
                      />
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {step === 'kyc' && kycUrl && kycOrigin && (
            <div className="mb-5">
              <KycIframe
                url={kycUrl}
                origin={kycOrigin}
                onComplete={handleKycComplete}
                onCancel={handleKycCancel}
                onError={handleKycError}
              />
            </div>
          )}

          {step !== 'kyc' && <StepIndicator step={step} />}

          {step === 'error' && errorMsg && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {errorMsg}
            </p>
          )}

          {step !== 'kyc' && (
            <div className="mt-5">
              {step === 'idle' && (
                <button
                  onClick={handleDeposit}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Start Deposit
                </button>
              )}
              {isRunning && (
                <button
                  disabled
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white opacity-75"
                >
                  <Spinner />
                  {STEP_LABELS[step]}
                </button>
              )}
              {step === 'error' && (
                <button
                  onClick={handleDeposit}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  {errorIsRetryable ? 'Retry' : 'Close'}
                </button>
              )}
              {step === 'done' && (
                <button
                  onClick={onClose}
                  className="w-full rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                >
                  Close
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ORDERED_STEPS: DepositDrawerStep[] = [
  'authenticating',
  'quoting',
  'initiating',
  'kyc',
  'done',
];

function StepIndicator({ step }: { step: DepositDrawerStep }) {
  if (step === 'idle') return null;

  return (
    <ol className="space-y-1">
      {ORDERED_STEPS.map((s) => {
        const currentIdx = ORDERED_STEPS.indexOf(step === 'error' ? 'authenticating' : step);
        const thisIdx = ORDERED_STEPS.indexOf(s);
        const isComplete = step !== 'error' && thisIdx < ORDERED_STEPS.indexOf(step);
        const isActive = s === step && step !== 'error' && step !== 'done';
        const isPending = thisIdx > currentIdx && step !== 'done';

        return (
          <li key={s} className="flex items-center gap-2 text-xs">
            <span
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold
                ${isComplete ? 'bg-green-500 text-white' : ''}
                ${isActive ? 'bg-blue-600 text-white animate-pulse' : ''}
                ${isPending ? 'bg-bg-sunken text-secondary-text' : ''}
                ${step === 'done' ? 'bg-green-500 text-white' : ''}
              `}
            >
              {isComplete || step === 'done' ? '✓' : thisIdx + 1}
            </span>
            <span
              className={
                isActive
                  ? 'font-medium text-blue-600 dark:text-blue-400'
                  : isComplete || step === 'done'
                    ? 'text-gray-500 line-through dark:text-gray-400'
                    : 'text-secondary-text'
              }
            >
              {STEP_LABELS[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
