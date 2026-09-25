import type { AccountEntity, AccountKind } from '@actual-app/core/types/models';

export type AccountKindBucket = AccountKind | 'unclassified';

/**
 * Display order for the buckets. Unclassified sits last so it drains away as
 * the user classifies their accounts.
 */
export const ACCOUNT_KIND_BUCKETS = [
  'current',
  'savings',
  'credit',
  'unclassified',
] as const satisfies readonly AccountKindBucket[];

export const ACCOUNT_KINDS = [
  'current',
  'savings',
  'credit',
] as const satisfies readonly AccountKind[];

export function toBucket(
  kind: AccountEntity['account_kind'],
): AccountKindBucket {
  return kind ?? 'unclassified';
}

/**
 * Credit accounts hold debt; everything else — including accounts the user has
 * not classified yet — counts towards spendable cash. Keeping unclassified
 * accounts in the cash total means the figure does not jump the first time this
 * ships, only once the user says otherwise.
 */
export function isCashBucket(bucket: AccountKindBucket): boolean {
  return bucket !== 'credit';
}

export function groupAccountsByKind(
  accounts: AccountEntity[],
): Array<{ bucket: AccountKindBucket; accounts: AccountEntity[] }> {
  return ACCOUNT_KIND_BUCKETS.map(bucket => ({
    bucket,
    accounts: accounts.filter(
      account => toBucket(account.account_kind) === bucket,
    ),
  })).filter(group => group.accounts.length > 0);
}
