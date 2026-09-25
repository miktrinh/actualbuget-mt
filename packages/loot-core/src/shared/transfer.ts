import type { TransactionEntity } from '#types/models';

type TransferLegFields = {
  account: TransactionEntity['account'];
  amount: TransactionEntity['amount'];
  // Rows read straight from the database use `null` for "not a transfer",
  // while TransactionEntity leaves the field off entirely.
  transfer_id?: TransactionEntity['transfer_id'] | null;
};

export function validForTransfer(
  fromTransaction: TransferLegFields,
  toTransaction: TransferLegFields,
) {
  if (
    // not already a transfer
    [fromTransaction, toTransaction].every(tran => tran.transfer_id == null) &&
    fromTransaction.account !== toTransaction.account && // belong to different accounts
    fromTransaction.amount + toTransaction.amount === 0 // amount must zero each other out
  ) {
    return true;
  }
  return false;
}
