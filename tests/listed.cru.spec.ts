import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ANCHORS } from '@/constants/anchors';
import { LISTED_ANCHORS } from '@/constants/listed-anchors';
import { fixtureMismatches, getListedAnchorByDomain } from '@/lib/stellar/listed-anchors';

const FIXTURE_PATH = join(__dirname, 'fixtures', 'listed', 'cru.toml');

describe('listed operator: Resource Mobilization (CRU)', () => {
  const entry = getListedAnchorByDomain('centralcru.com');

  it('is an issuer-only entry, found by every domain', () => {
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('cru');
    expect(entry?.kind).toBe('issuer');
    for (const domain of entry?.domains ?? []) {
      expect(getListedAnchorByDomain(domain)).toBe(entry);
    }
  });

  it('lists the CRU asset', () => {
    expect(entry).toBeDefined();
    expect(entry?.assets).toHaveLength(1);
    expect(entry?.assets).toContainEqual(
      expect.objectContaining({
        code: 'CRU',
        issuer: 'GBOH4PRP2JZIH4JRFZTC426HAI5UY55OP4SWTI53XUBOSRUY6XLNLFZC',
      })
    );
  });

  it('matches its stellar.toml fixture', () => {
    expect(entry).toBeDefined();
    const toml = readFileSync(FIXTURE_PATH, 'utf8');
    expect(entry && fixtureMismatches(entry, toml)).toEqual([]);
  });

  it('is not a routable anchor', () => {
    expect(entry).toBeDefined();
    const domains = new Set<string | undefined>(entry?.domains ?? []);
    for (const a of ANCHORS) {
      expect(domains.has(a.homeDomain)).toBe(false);
      if (a.serviceDomain) expect(domains.has(a.serviceDomain)).toBe(false);
    }
  });

  it('is registered in LISTED_ANCHORS', () => {
    expect(LISTED_ANCHORS.some((a) => a.id === 'cru')).toBe(true);
  });
});
