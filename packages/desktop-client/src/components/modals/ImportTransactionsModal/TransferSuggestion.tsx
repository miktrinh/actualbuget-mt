import { useTranslation } from 'react-i18next';

import { SvgDownAndRightArrow } from '@actual-app/components/icons/v2';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Checkbox } from '#components/forms';

type TransferSuggestionProps = {
  accountName: string;
  isAccepted: boolean;
  onToggle: () => void;
};

export function TransferSuggestion({
  accountName,
  isAccepted,
  onToggle,
}: TransferSuggestionProps) {
  const { t } = useTranslation();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px 6px 31px',
        backgroundColor: theme.tableBackground,
        color: isAccepted ? theme.tableText : theme.tableTextInactive,
      }}
    >
      <SvgDownAndRightArrow width={13} height={13} />
      <Checkbox checked={isAccepted} onChange={onToggle} />
      <Text style={{ fontSize: 12 }}>
        {t(
          'Looks like a transfer with {{accountName}}. Link them so this is not counted as income or spending.',
          { accountName },
        )}
      </Text>
    </View>
  );
}
