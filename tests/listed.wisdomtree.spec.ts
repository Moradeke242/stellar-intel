import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { LISTED_ANCHORS } from '@/constants/listed-anchors';
import { ANCHORS } from '@/constants/anchors';
import { getListedAnchorByDomain, fixtureMismatches } from '@/lib/stellar/listed-anchors';

describe('WisdomTree listed anchor', () => {
  const entry = LISTED_ANCHORS.find((a) => a.id === 'wisdomtree');

  it('is resolvable by domain as an issuer entry', () => {
    const byDomain = getListedAnchorByDomain('stellar.wisdomtree.com');
    expect(byDomain).toBeDefined();
    expect(byDomain?.id).toBe('wisdomtree');
    expect(byDomain?.kind).toBe('issuer');
    expect(entry).toBeDefined();
    expect(getListedAnchorByDomain('stellar.wisdomtree.com')).toEqual(entry);
    for (const d of entry!.domains) {
      expect(getListedAnchorByDomain(d)).toEqual(entry);
    }
  });

  it('lists 18 assets including USD issued by the expected account', () => {
    expect(entry!.assets.length).toBe(18);
    expect(entry!.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'USD',
          issuer: 'GC2ATEL4K2O5BJO7Z76MYSV6TKHCROKV5GXEOU7NO2TUEOOMFDDIPWID',
        }),
      ])
    );
  });

  it('matches its fixture', () => {
    const toml = readFileSync('tests/fixtures/listed/wisdomtree.toml', 'utf8');
    expect(fixtureMismatches(entry!, toml)).toEqual([]);
  });

  it('is not present in the routable ANCHORS registry', () => {
    for (const a of ANCHORS) {
      expect(a.homeDomain).not.toBe('stellar.wisdomtree.com');
      expect(a.serviceDomain).not.toBe('stellar.wisdomtree.com');
    }
  });
});
