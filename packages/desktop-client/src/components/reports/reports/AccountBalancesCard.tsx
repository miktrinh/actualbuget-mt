import { useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  AccountBalancesWidget,
  AccountEntity,
} from '@actual-app/core/types/models';

import type { AccountKindBucket } from '#accounts/accountKind';
import {
  ACCOUNT_KIND_BUCKETS,
  groupAccountsByKind,
  isCashBucket,
} from '#accounts/accountKind';
import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { ReportCard } from '#components/reports/ReportCard';
import { ReportCardName } from '#components/reports/ReportCardName';
import { useAccountKindLabels } from '#hooks/useAccountKindLabels';
import { useAccounts } from '#hooks/useAccounts';
import { useFormat } from '#hooks/useFormat';
import { useSheetValue } from '#hooks/useSheetValue';
import * as bindings from '#spreadsheet/bindings';

type AccountBalancesCardProps = {
  widgetId: string;
  isEditing?: boolean;
  meta?: AccountBalancesWidget['meta'];
  onMetaChange: (newMeta: AccountBalancesWidget['meta']) => void;
};

export function AccountBalancesCard({
  widgetId,
  isEditing,
  meta = {},
  onMetaChange,
}: AccountBalancesCardProps) {
  const { t } = useTranslation();
  const [nameMenuOpen, setNameMenuOpen] = useState(false);
  const { data: accounts = [] } = useAccounts();
  const labels = useAccountKindLabels();

  // One binding per bucket, read unconditionally so the hook count is fixed.
  const bucketTotals: Record<AccountKindBucket, number | null> = {
    current: useKindTotal('current'),
    savings: useKindTotal('savings'),
    credit: useKindTotal('credit'),
    unclassified: useKindTotal('unclassified'),
  };

  const openAccounts = accounts.filter(account => !account.closed);
  const groups = groupAccountsByKind(openAccounts);

  const totalCash = ACCOUNT_KIND_BUCKETS.filter(isCashBucket).reduce(
    (sum, bucket) => sum + (bucketTotals[bucket] ?? 0),
    0,
  );
  const netWorth = totalCash + (bucketTotals.credit ?? 0);

  return (
    <ReportCard
      widgetId={widgetId}
      isEditing={isEditing}
      disableClick={nameMenuOpen}
      onRename={() => setNameMenuOpen(true)}
    >
      <View style={{ flex: 1, padding: 20, overflow: 'auto' }}>
        <ReportCardName
          name={meta?.name || t('Account balances')}
          isEditing={nameMenuOpen}
          onChange={newName => {
            onMetaChange({ ...meta, name: newName });
            setNameMenuOpen(false);
          }}
          onClose={() => setNameMenuOpen(false)}
        />

        {groups.length === 0 ? (
          <Text style={{ color: theme.pageTextSubdued, marginTop: 10 }}>
            <Trans>No open accounts.</Trans>
          </Text>
        ) : (
          <View style={{ marginTop: 10, gap: 10 }}>
            {groups.map(({ bucket, accounts: bucketAccounts }) => (
              <View key={bucket}>
                <Row
                  label={labels[bucket]}
                  isHeading
                  amount={
                    <Amount
                      value={bucketTotals[bucket] ?? 0}
                      isHeading
                      testId={`account-kind-balance-${bucket}`}
                    />
                  }
                />
                {bucketAccounts.map(account => (
                  <AccountRow key={account.id} account={account} />
                ))}
              </View>
            ))}

            <View
              style={{
                borderTop: `1px solid ${theme.tableBorder}`,
                paddingTop: 8,
              }}
            >
              <Row
                label={t('Total cash')}
                isHeading
                amount={
                  <Amount
                    value={totalCash}
                    isHeading
                    testId="account-balances-total-cash"
                  />
                }
              />
              <Row
                label={t('Net, including debt')}
                amount={
                  <Amount
                    value={netWorth}
                    testId="account-balances-net-worth"
                  />
                }
              />
            </View>
          </View>
        )}
      </View>
    </ReportCard>
  );
}

function useKindTotal(bucket: AccountKindBucket) {
  return useSheetValue<'account', `account-kind-balance-${string}`>(
    bindings.accountKindBalance(bucket),
  );
}

function AccountRow({ account }: { account: AccountEntity }) {
  const balance = useSheetValue<'account', 'balance'>(
    bindings.accountBalance(account.id),
  );

  return (
    <Row
      label={account.name}
      isIndented
      amount={
        <Amount value={balance ?? 0} testId={`account-balance-${account.id}`} />
      }
    />
  );
}

type RowProps = {
  label: string;
  amount: ReactNode;
  isHeading?: boolean;
  isIndented?: boolean;
};

function Row({ label, amount, isHeading, isIndented }: RowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        padding: '3px 0',
        paddingLeft: isIndented ? 12 : 0,
      }}
    >
      <Text
        style={{
          fontSize: isHeading ? 14 : 13,
          fontWeight: isHeading ? 600 : 'normal',
          color: isHeading ? theme.pageText : theme.pageTextSubdued,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Text>
      {amount}
    </View>
  );
}

function Amount({
  value,
  isHeading,
  testId,
}: {
  value: number;
  isHeading?: boolean;
  testId: string;
}) {
  const format = useFormat();

  return (
    <FinancialText
      data-testid={testId}
      style={{
        fontSize: isHeading ? 14 : 13,
        fontWeight: isHeading ? 600 : 'normal',
        whiteSpace: 'nowrap',
      }}
    >
      <PrivacyFilter>{format(value, 'financial')}</PrivacyFilter>
    </FinancialText>
  );
}
