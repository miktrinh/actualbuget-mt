import { generateAccount } from '@actual-app/core/mocks';
import type { AccountEntity, AccountKind } from '@actual-app/core/types/models';
import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_KIND_BUCKETS,
  groupAccountsByKind,
  isCashBucket,
  toBucket,
} from './accountKind';

function makeAccount(
  name: string,
  account_kind: AccountKind | null,
): AccountEntity {
  return { ...generateAccount(name), account_kind };
}

describe('toBucket', () => {
  it('maps an unset kind to the unclassified bucket', () => {
    expect(toBucket(null)).toBe('unclassified');
  });

  it('passes a set kind through unchanged', () => {
    expect(toBucket('savings')).toBe('savings');
  });
});

describe('isCashBucket', () => {
  it('counts unclassified accounts as cash so totals do not shift', () => {
    expect(isCashBucket('unclassified')).toBe(true);
  });

  it('excludes credit accounts, which hold debt', () => {
    expect(isCashBucket('credit')).toBe(false);
  });

  it.each(['current', 'savings'] as const)('includes %s', bucket => {
    expect(isCashBucket(bucket)).toBe(true);
  });
});

describe('groupAccountsByKind', () => {
  it('orders buckets consistently and puts unclassified last', () => {
    const groups = groupAccountsByKind([
      makeAccount('AMEX', 'credit'),
      makeAccount('Mystery', null),
      makeAccount('Rainy day', 'savings'),
      makeAccount('Everyday', 'current'),
    ]);

    expect(groups.map(group => group.bucket)).toEqual([
      'current',
      'savings',
      'credit',
      'unclassified',
    ]);
  });

  it('omits buckets with no accounts', () => {
    const groups = groupAccountsByKind([makeAccount('Everyday', 'current')]);

    expect(groups.map(group => group.bucket)).toEqual(['current']);
  });

  it('keeps every account in exactly one bucket', () => {
    const accounts = [
      makeAccount('Everyday', 'current'),
      makeAccount('Joint', 'current'),
      makeAccount('Mystery', null),
    ];

    const groups = groupAccountsByKind(accounts);

    expect(groups.flatMap(group => group.accounts)).toHaveLength(
      accounts.length,
    );
    const current = groups.find(group => group.bucket === 'current');
    expect(current?.accounts).toHaveLength(2);
  });

  it('returns nothing for an empty account list', () => {
    expect(groupAccountsByKind([])).toEqual([]);
  });

  it('covers every declared bucket', () => {
    const accounts = ACCOUNT_KIND_BUCKETS.map(bucket =>
      makeAccount(bucket, bucket === 'unclassified' ? null : bucket),
    );

    expect(groupAccountsByKind(accounts)).toHaveLength(
      ACCOUNT_KIND_BUCKETS.length,
    );
  });
});
