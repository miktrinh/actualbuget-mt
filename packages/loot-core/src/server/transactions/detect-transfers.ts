import * as db from '#server/db';
import * as monthUtils from '#shared/months';
import { validForTransfer } from '#shared/transfer';
import type { TransactionEntity } from '#types/models';

import { batchUpdateTransactions } from './index';

/**
 * Half-width of the date window used to pair an imported transaction with its
 * counterpart in another account. Deliberately tighter than the ±7 days used
 * for same-account dedup: that window is guarding against a bank restating a
 * date, this one is guarding against two banks settling a transfer on different
 * days, and a wider window makes false pairs far more likely.
 */
export const TRANSFER_MATCH_WINDOW_DAYS = 3;

export type TransferCandidate = Pick<
  TransactionEntity,
  'id' | 'account' | 'amount' | 'date'
>;

type DetectedTransfer<T> = {
  transaction: T;
  candidate: TransferCandidate;
};

type CandidateRow = {
  id: string;
  account: string;
  amount: number;
  date: number;
};

/**
 * Pairs each incoming transaction with the single unambiguous counterpart in
 * another account, if one exists. Ambiguity is resolved by refusing to guess:
 * when more than one live transaction could be the other leg we suggest
 * nothing, so the user is never shown a coin-flip. Each counterpart is claimed
 * at most once per batch.
 */
export async function findTransferCandidates<
  T extends Pick<TransactionEntity, 'amount' | 'date' | 'account'>,
>(
  acctId: string,
  transactions: T[],
  { windowDays = TRANSFER_MATCH_WINDOW_DAYS }: { windowDays?: number } = {},
): Promise<Array<DetectedTransfer<T>>> {
  const claimed = new Set<string>();
  const detected: Array<DetectedTransfer<T>> = [];

  for (const transaction of transactions) {
    if (!transaction.date || !transaction.amount) {
      continue;
    }

    const rows = await db.all<CandidateRow>(
      `SELECT id, account, amount, date
       FROM v_transactions_internal_alive
       WHERE account != ?
         AND amount = ?
         AND date >= ? AND date <= ?
         AND transfer_id IS NULL
         AND is_parent = 0`,
      [
        acctId,
        -transaction.amount,
        db.toDateRepr(monthUtils.subDays(transaction.date, windowDays)),
        db.toDateRepr(monthUtils.addDays(transaction.date, windowDays)),
      ],
    );

    const candidates = rows
      .filter(row => !claimed.has(row.id))
      .map(row => ({
        id: row.id,
        account: row.account,
        amount: row.amount,
        date: db.fromDateRepr(row.date),
      }))
      .filter(candidate =>
        validForTransfer(
          { ...transaction, transfer_id: null },
          { ...candidate, transfer_id: null },
        ),
      );

    if (candidates.length !== 1) {
      continue;
    }

    claimed.add(candidates[0].id);
    detected.push({ transaction, candidate: candidates[0] });
  }

  return detected;
}

export type TransferLink = {
  transactionId: string;
  counterpartId: string;
};

/**
 * Links already-inserted transaction pairs into transfers.
 *
 * This deliberately runs as its own `batchUpdateTransactions` call with
 * `runTransfers: false`. Writing a transfer payee while transfer handling is on
 * makes `transfer.onInsert` mirror the transaction into the other account,
 * producing a third row; and because `runTransfers` is batch-wide, switching it
 * off for the whole import would break the documented behaviour where a rule
 * that sets a transfer payee auto-creates its counterpart.
 */
export async function linkImportedTransfers(links: TransferLink[]) {
  if (links.length === 0) {
    return;
  }

  const updated: Array<Partial<TransactionEntity>> = [];
  const categoriesToClear: string[] = [];

  for (const { transactionId, counterpartId } of links) {
    const [transaction, counterpart] = await Promise.all([
      db.first<Pick<db.DbViewTransaction, 'id' | 'account'>>(
        'SELECT id, account FROM v_transactions_internal_alive WHERE id = ?',
        [transactionId],
      ),
      db.first<Pick<db.DbViewTransaction, 'id' | 'account'>>(
        'SELECT id, account FROM v_transactions_internal_alive WHERE id = ?',
        [counterpartId],
      ),
    ]);

    if (!transaction || !counterpart) {
      continue;
    }

    const [transferPayee, counterpartTransferPayee] = await Promise.all([
      getTransferPayee(transaction.account),
      getTransferPayee(counterpart.account),
    ]);

    if (!transferPayee || !counterpartTransferPayee) {
      continue;
    }

    updated.push(
      {
        id: transaction.id,
        payee: counterpartTransferPayee,
        transfer_id: counterpart.id,
      },
      {
        id: counterpart.id,
        payee: transferPayee,
        transfer_id: transaction.id,
      },
    );

    // Matches `transfer.clearCategory`: a transfer that crosses the on/off
    // budget boundary is real income or spending on the budgeted side, so its
    // category has to survive. Cleared through `db` rather than the batch
    // above because TransactionEntity models `category` as `string |
    // undefined`, and widening it to allow null ripples across the client.
    if (await isSameBudgetSide(transaction.account, counterpart.account)) {
      categoriesToClear.push(transaction.id, counterpart.id);
    }
  }

  if (updated.length > 0) {
    await batchUpdateTransactions({ updated, runTransfers: false });
  }

  for (const id of categoriesToClear) {
    await db.updateTransaction({ id, category: null });
  }
}

async function getTransferPayee(accountId: string) {
  const payee = await db.first<Pick<db.DbPayee, 'id'>>(
    'SELECT id FROM payees WHERE transfer_acct = ?',
    [accountId],
  );
  return payee?.id ?? null;
}

async function isSameBudgetSide(accountId: string, otherAccountId: string) {
  const [account, other] = await Promise.all([
    db.first<Pick<db.DbAccount, 'offbudget'>>(
      'SELECT offbudget FROM accounts WHERE id = ?',
      [accountId],
    ),
    db.first<Pick<db.DbAccount, 'offbudget'>>(
      'SELECT offbudget FROM accounts WHERE id = ?',
      [otherAccountId],
    ),
  ]);

  return account?.offbudget === other?.offbudget;
}
