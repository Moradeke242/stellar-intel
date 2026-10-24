import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DepositDrawer } from '@/components/onramp/DepositDrawer';
import type { AnchorRate, Sep38Quote } from '@/types';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/stellar/sep10', async () => {
  const actual = await vi.importActual<any>('@/lib/stellar/sep10');
  return {
    ...actual,
    authenticate: vi.fn(),
  };
});

vi.mock('@/lib/stellar/sep24', () => ({
  initiateDeposit: vi.fn(),
  getSep24Info: vi.fn(),
}));

vi.mock('@/lib/stellar/sep38', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stellar/sep38')>('@/lib/stellar/sep38');
  return {
    ...actual,
    assertSep38Capable: vi.fn(),
    postSep38Quote: vi.fn(),
  };
});

vi.mock('@/lib/stellar/anchors', () => ({
  getResolvedAnchorById: vi.fn(),
}));

let mockKycAction: 'complete' | 'cancel' | 'error' | 'wait' = 'complete';

vi.mock('@/components/offramp/KycIframe', async () => {
  const React = await import('react');
  return {
    KycIframe: ({
      origin,
      onComplete,
      onCancel,
      onError,
    }: {
      url: string;
      origin: string;
      onComplete: (transactionId: string) => void;
      onCancel: () => void;
      onError: (error: Error) => void;
    }) => {
      React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
          if (event.origin !== origin) return;
          const data = event.data as { type?: string; transaction_id?: string };
          if (data?.type === 'stellar_transaction_created' && data.transaction_id) {
            onComplete(data.transaction_id);
          } else if (data?.type === 'stellar_cancel') {
            onCancel();
          }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
      }, [origin, onComplete, onCancel]);

      if (mockKycAction === 'complete') {
        onComplete('txn-deposit-123');
      } else if (mockKycAction === 'cancel') {
        onCancel();
      } else if (mockKycAction === 'error') {
        onError(new Error('User cancelled the transaction'));
      }
      return <div data-testid="kyc-iframe" />;
    },
  };
});

import * as sep10 from '@/lib/stellar/sep10';
import * as sep24 from '@/lib/stellar/sep24';
import * as sep38 from '@/lib/stellar/sep38';
import * as anchors from '@/lib/stellar/anchors';

const mockAuthenticate = vi.mocked(sep10.authenticate);
const mockInitiateDeposit = vi.mocked(sep24.initiateDeposit);
const mockAssertSep38Capable = vi.mocked(sep38.assertSep38Capable);
const mockPostSep38Quote = vi.mocked(sep38.postSep38Quote);
const mockGetResolvedAnchorById = vi.mocked(anchors.getResolvedAnchorById);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RATE: AnchorRate = {
  anchorId: 'cowrie',
  anchorName: 'Cowrie',
  corridorId: 'ngn-usdc',
  fee: 2,
  feeType: 'flat',
  exchangeRate: 1580,
  totalReceived: 98,
  source: 'sep24-fee',
  updatedAt: new Date(),
};

const ANCHOR = {
  id: 'cowrie',
  name: 'Cowrie',
  homeDomain: 'cowrie.exchange',
  corridors: ['ngn-usdc'],
  assetCode: 'USDC',
  assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  TRANSFER_SERVER_SEP0024: 'https://transfer.cowrie.exchange',
  WEB_AUTH_ENDPOINT: 'https://auth.cowrie.exchange',
  ANCHOR_QUOTE_SERVER: 'https://quotes.cowrie.exchange',
  SIGNING_KEY: 'G...',
  domain: 'cowrie.exchange',
  NETWORK_PASSPHRASE: null,
  ORG_URL: null,
  ORG_SUPPORT_EMAIL: null,
  ORG_SUPPORT_URL: null,
  CURRENCIES: [
    { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
  ],
  capabilities: { sep10: true, sep24: true, sep38: true, sep12: false },
};

const PUBLIC_KEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234567890123456789';

const AUTH = {
  jwt: 'test.jwt.token',
  anchorDomain: 'cowrie.exchange',
  publicKey: PUBLIC_KEY,
  expiresAt: new Date(Date.now() + 86400_000),
};

const FIRM_QUOTE: Sep38Quote = {
  id: 'quote-firm-123',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  total_price: '1580.00',
  price: '1580.00',
  sell_amount: '100',
  buy_amount: '98.50',
  fee: { total: '1.50' },
  context: 'sep24',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockKycAction = 'complete';
  mockGetResolvedAnchorById.mockResolvedValue(ANCHOR);
  mockAuthenticate.mockResolvedValue(AUTH);
  mockAssertSep38Capable.mockReturnValue('https://quotes.cowrie.exchange');
  mockPostSep38Quote.mockResolvedValue(FIRM_QUOTE);
  mockInitiateDeposit.mockResolvedValue({
    type: 'interactive_customer_info_needed',
    url: 'https://anchor.example/deposit-kyc',
    id: 'txn-deposit-123',
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DepositDrawer', () => {
  it('a capable anchor posts a quote and passes quoteId', async () => {
    render(
      <DepositDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        onClose={vi.fn()}
        onDepositStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Deposit'));

    await waitFor(() =>
      expect(mockPostSep38Quote).toHaveBeenCalledWith(
        'https://quotes.cowrie.exchange',
        AUTH.jwt,
        expect.objectContaining({
          sell_asset: 'iso4217:NGN',
          buy_asset: `stellar:${ANCHOR.assetCode}:${ANCHOR.assetIssuer}`,
          sell_amount: '100',
          context: 'sep24',
        })
      )
    );

    await waitFor(() =>
      expect(mockInitiateDeposit).toHaveBeenCalledWith(
        ANCHOR,
        expect.objectContaining({ quoteId: FIRM_QUOTE.id }),
        expect.anything()
      )
    );

    expect(screen.getByRole('timer')).toHaveAccessibleName(/Firm quote expires in/);
    expect(screen.getByText(/98\.50 USDC/)).toBeInTheDocument();
  });

  it('an incapable anchor makes no quote call', async () => {
    mockAssertSep38Capable.mockImplementation(() => {
      throw new Error('Anchor does not support SEP-38');
    });

    render(
      <DepositDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        onClose={vi.fn()}
        onDepositStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Deposit'));

    await waitFor(() => expect(mockInitiateDeposit).toHaveBeenCalled());

    expect(mockPostSep38Quote).not.toHaveBeenCalled();
    const [, params] = mockInitiateDeposit.mock.calls[0]!;
    expect(params).not.toHaveProperty('quoteId');
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('a quote failure falls back to indicative flow and does not block deposit', async () => {
    mockPostSep38Quote.mockRejectedValue(new Error('Quote server 500 error'));

    render(
      <DepositDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        onClose={vi.fn()}
        onDepositStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Deposit'));

    await waitFor(() => expect(mockInitiateDeposit).toHaveBeenCalled());

    const [, params] = mockInitiateDeposit.mock.calls[0]!;
    expect(params).not.toHaveProperty('quoteId');
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('expiry shows the prompt when quote expires before completion', async () => {
    mockKycAction = 'wait';
    mockPostSep38Quote.mockResolvedValue({
      ...FIRM_QUOTE,
      expires_at: new Date(Date.now() + 20).toISOString(),
    });

    render(
      <DepositDrawer
        rate={RATE}
        amount="100"
        publicKey={PUBLIC_KEY}
        onClose={vi.fn()}
        onDepositStarted={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Start Deposit'));

    await waitFor(() => expect(screen.getByTestId('kyc-iframe')).toBeInTheDocument());

    // Wait for the quote to expire
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Simulate interactive step resolution after expiration
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'stellar_transaction_created', transaction_id: 'txn-deposit-123' },
          origin: 'https://anchor.example',
        })
      );
    });

    await waitFor(() =>
      expect(screen.getByText(/Your firm quote expired before the transaction/)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
