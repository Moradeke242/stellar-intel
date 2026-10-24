import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ANCHORS } from '@/constants/anchors';
import { fixtureMismatches, getListedAnchorByDomain } from '@/lib/stellar/listed-anchors';

describe('listed operator: fchain (Muyu Network)', () => {
  const entry = getListedAnchorByDomain('fchain.io');

  it('is a crypto-rails entry, found by every domain', () => {
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('fchain');
    expect(entry?.kind).toBe('crypto-rails');
    for (const domain of entry?.domains ?? []) {
      expect(getListedAnchorByDomain(domain)).toBe(entry);
    }
  });

  it('lists the expected asset set', () => {
    expect(entry?.assets).toHaveLength(8);
    expect(entry?.assets).toContainEqual(
      expect.objectContaining({
        code: 'XRP',
        issuer: 'GBXRPL45NPHCVMFFAYZVUVFFVKSIZ362ZXFP7I2ETNQ3QKZMFLPRDTD5',
      })
    );
  });

  it('matches its stellar.toml fixture', () => {
    const toml = readFileSync('tests/fixtures/listed/fchain.toml', 'utf8');
    expect(entry && fixtureMismatches(entry, toml)).toEqual([]);
  });

  it('is not a routable anchor', () => {
    const domains = entry?.domains ?? [];
    for (const a of ANCHORS) {
      expect(domains).not.toContain(a.homeDomain);
      if (a.serviceDomain) expect(domains).not.toContain(a.serviceDomain);
    }
  });

  it('has rails matching its SEP-6 /info fixture', () => {
    expect(entry?.cryptoRails).toBeDefined();
    expect(entry?.cryptoRails?.length).toBeGreaterThan(0);

    for (const rail of entry?.cryptoRails ?? []) {
      const raw = readFileSync(`tests/fixtures/listed/fchain.${rail.sep}-info.json`, 'utf8');
      const info = JSON.parse(raw) as Record<string, Record<string, { enabled?: boolean }>>;

      const depositCodes = Object.entries(info.deposit ?? {})
        .filter(([, value]) => value.enabled === true)
        .map(([code]) => code);
      const withdrawCodes = Object.entries(info.withdraw ?? {})
        .filter(([, value]) => value.enabled === true)
        .map(([code]) => code);

      expect(rail.depositAssets).toEqual(depositCodes);
      expect(rail.withdrawAssets).toEqual(withdrawCodes);
    }
  });
});
