import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { AccountEntity, AccountKind } from '@actual-app/core/types/models';

import { useUpdateAccountMutation } from '#accounts';
import { ACCOUNT_KINDS } from '#accounts/accountKind';
import {
  Modal,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { SelectedIndicator } from '#components/modals/AccountGroupsModal/SelectedIndicator';
import { useAccount } from '#hooks/useAccount';
import {
  useAccountKindDescriptions,
  useAccountKindLabels,
} from '#hooks/useAccountKindLabels';

type AccountKindModalProps = {
  accountId: AccountEntity['id'];
};

export function AccountKindModal({ accountId }: AccountKindModalProps) {
  const { t } = useTranslation();
  const account = useAccount(accountId);
  const labels = useAccountKindLabels();
  const descriptions = useAccountKindDescriptions();
  const updateAccount = useUpdateAccountMutation();

  const selectedKind = account?.account_kind ?? null;

  const onSelect = (kind: AccountKind | null) => {
    updateAccount.mutate({ account: { id: accountId, account_kind: kind } });
  };

  return (
    <Modal name="account-kind">
      {({ state }) => (
        <>
          <ModalHeader
            title={<ModalTitle title={t('Account type')} shrinkOnOverflow />}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ gap: 2 }}>
            <Text
              style={{
                color: theme.pageTextSubdued,
                paddingBottom: 10,
              }}
            >
              <Trans>
                This decides how the account is grouped in reports, and whether
                its balance counts as cash or as debt.
              </Trans>
            </Text>
            {ACCOUNT_KINDS.map(kind => (
              <View
                key={kind}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <SelectedIndicator selected={selectedKind === kind} />
                <Button
                  variant="bare"
                  onPress={() => onSelect(kind)}
                  style={{ flex: 1, justifyContent: 'flex-start' }}
                >
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text>{labels[kind]}</Text>
                    <Text
                      style={{ color: theme.pageTextSubdued, fontSize: 12 }}
                    >
                      {descriptions[kind]}
                    </Text>
                  </View>
                </Button>
              </View>
            ))}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <SelectedIndicator selected={selectedKind == null} />
              <Button
                variant="bare"
                onPress={() => onSelect(null)}
                style={{ flex: 1, justifyContent: 'flex-start' }}
              >
                <Text style={{ fontStyle: 'italic' }}>
                  <Trans>Not set</Trans>
                </Text>
              </Button>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
