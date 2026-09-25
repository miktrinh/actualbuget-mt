import { useTranslation } from 'react-i18next';

import type { AccountKindBucket } from '#accounts/accountKind';

export function useAccountKindLabels(): Record<AccountKindBucket, string> {
  const { t } = useTranslation();

  return {
    current: t('Current'),
    savings: t('Savings'),
    credit: t('Credit card'),
    unclassified: t('Unclassified'),
  };
}

export function useAccountKindDescriptions(): Record<
  AccountKindBucket,
  string
> {
  const { t } = useTranslation();

  return {
    current: t('Everyday spending account you can access right away'),
    savings: t('Money you are setting aside'),
    credit: t('Credit card — its balance is debt you owe'),
    unclassified: t('Not classified yet'),
  };
}
