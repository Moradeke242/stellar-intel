import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ANCHORS } from '@/constants/anchors';
import { fixtureMismatches, getListedAnchorByDomain } from '@/lib/stellar/listed-anchors';

describe('listed operator: Digitra.com', () => {
  const entry = getListedAnchorByDomain('www.digitra.com');

  it('is an issuer entry, found by every domain', () => {
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('digitra');
    expect(entry?.kind).toBe('issuer');
    for (const domain of entry?.domains ?? []) {
      expect(getListedAnchorByDomain(domain)).toBe(entry);
    }
  });

  it('lists exactly the DGTA asset', () => {
    expect(entry?.assets).toHaveLength(1);
    expect(entry?.assets).toContainEqual(
      expect.objectContaining({
        code: 'DGTA',
        issuer: 'GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP',
      })
    );
  });

  it('matches its stellar.toml fixture', () => {
    const toml = readFileSync('tests/fixtures/listed/digitra.toml', 'utf8');
    expect(entry && fixtureMismatches(entry, toml)).toEqual([]);
  });

  it('is not a routable anchor', () => {
    const domains = entry?.domains ?? [];
    for (const a of ANCHORS) {
      expect(domains).not.toContain(a.homeDomain);
      if (a.serviceDomain) expect(domains).not.toContain(a.serviceDomain);
    }
  });
});
