import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ANCHORS } from '@/constants/anchors';
import { fixtureMismatches, getListedAnchorByDomain } from '@/lib/stellar/listed-anchors';

describe('listed operator: Sl8 (Cassator Corp.)', () => {
  const entry = getListedAnchorByDomain('sl8.online');

  it('is a crypto-rails entry, found by every domain', () => {
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('sl8');
    expect(entry?.kind).toBe('crypto-rails');
    for (const domain of entry?.domains ?? []) {
      expect(getListedAnchorByDomain(domain)).toBe(entry);
    }
  });

  it('lists exactly 49 assets and contains SLX', () => {
    expect(entry?.assets).toHaveLength(49);
    expect(entry?.assets).toContainEqual(
      expect.objectContaining({
        code: 'SLX',
        issuer: 'GBCI6LM7XXEM44OLMEV53WZXKEUQCACURK4NZIHRJN7PAOIYKV7VVXPV',
      })
    );
  });

  it('matches its stellar.toml fixture', () => {
    const toml = readFileSync('tests/fixtures/listed/sl8.toml', 'utf8');
    expect(entry && fixtureMismatches(entry, toml)).toEqual([]);
  });

  it('is not a routable anchor', () => {
    const domains = entry?.domains ?? [];
    for (const a of ANCHORS) {
      expect(domains).not.toContain(a.homeDomain);
      if (a.serviceDomain) expect(domains).not.toContain(a.serviceDomain);
    }
  });

  it('records each rail as its /info fixture enables it', () => {
    const rails = entry?.cryptoRails ?? [];
    expect(rails.map((r) => r.sep).sort()).toEqual(['sep24', 'sep6']);
    for (const rail of rails) {
      const raw = readFileSync(`tests/fixtures/listed/sl8.${rail.sep}-info.json`, 'utf8');
      const info = JSON.parse(raw);

      const depositCodes = Object.entries(info.deposit ?? {})
        .filter(([, v]) => (v as { enabled?: boolean }).enabled === true)
        .map(([k]) => k);
      const withdrawCodes = Object.entries(info.withdraw ?? {})
        .filter(([, v]) => (v as { enabled?: boolean }).enabled === true)
        .map(([k]) => k);

      expect(rail.depositAssets).toEqual(depositCodes);
      expect(rail.withdrawAssets).toEqual(withdrawCodes);
    }
  });
});
