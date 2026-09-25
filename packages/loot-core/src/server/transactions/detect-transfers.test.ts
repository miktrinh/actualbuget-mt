import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';

import {
  findTransferCandidates,
  linkImportedTransfers,
} from './detect-transfers';

beforeEach(async () => {
  await global.emptyDatabase()();
  await loadMappings();
});

async function prepareDatabase() {
  await db.insertCategoryGroup({ id: 'group1', name: 'group1', is_income: 0 });
  await db.insertCategory({
    id: 'cat1',
    name: 'cat1',
    cat_group: 'group1',
    is_income: 0,
  });
  await db.insertAccount({ id: 'one', name: 'one' });
  await db.insertAccount({ id: 'two', name: 'two' });
  await db.insertAccount({ id: 'three', name: 'three' });
  await db.insertAccount({ id: 'offbudget', name: 'offbudget', offbudget: 1 });
  await db.insertPayee({ name: '', transfer_acct: 'one' });
  await db.insertPayee({ name: '', transfer_acct: 'two' });
  await db.insertPayee({ name: '', transfer_acct: 'three' });
  await db.insertPayee({ name: '', transfer_acct: 'offbudget' });
}

async function getTransaction(id: string) {
  const transaction = await db.first<db.DbViewTransactionInternal>(
    'SELECT * FROM v_transactions_internal WHERE id = ?',
    [id],
  );
  if (!transaction) {
    throw new Error(`No transaction with id ${id}`);
  }
  return transaction;
}

async function getTransferPayeeId(accountId: string) {
  const payee = await db.first<db.DbPayee>(
    'SELECT * FROM payees WHERE transfer_acct = ?',
    [accountId],
  );
  if (!payee) {
    throw new Error(`No transfer payee for account ${accountId}`);
  }
  return payee.id;
}

describe('findTransferCandidates', () => {
  beforeEach(prepareDatabase);

  it('pairs an incoming outflow with the matching inflow in another account', async () => {
    const counterpartId = await db.insertTransaction({
      account: 'two',
      amount: 5000,
      date: '2017-01-01',
    });

    const detected = await findTransferCandidates('one', [
      { account: 'one', amount: -5000, date: '2017-01-01' },
    ]);

    expect(detected).toHaveLength(1);
    expect(detected[0].candidate.id).toBe(counterpartId);
    expect(detected[0].candidate.account).toBe('two');
  });

  it('matches within the date window but not outside it', async () => {
    // Four days out: just beyond the inclusive +/-3 day default.
    await db.insertTransaction({
      account: 'two',
      amount: 5000,
      date: '2017-01-05',
    });

    const withinWindow = await findTransferCandidates('one', [
      { account: 'one', amount: -5000, date: '2017-01-01' },
    ]);
    expect(withinWindow).toHaveLength(0);

    const widened = await findTransferCandidates(
      'one',
      [{ account: 'one', amount: -5000, date: '2017-01-01' }],
      { windowDays: 5 },
    );
    expect(widened).toHaveLength(1);
  });

  it('refuses to guess when more than one counterpart could match', async () => {
    await db.insertTransaction({
      account: 'two',
      amount: 5000,
      date: '2017-01-01',
    });
    await db.insertTransaction({
      account: 'three',
      amount: 5000,
      date: '2017-01-01',
    });

    const detected = await findTransferCandidates('one', [
      { account: 'one', amount: -5000, date: '2017-01-01' },
    ]);

    expect(detected).toHaveLength(0);
  });

  it('ignores transactions in the account being imported into', async () => {
    await db.insertTransaction({
      account: 'one',
      amount: 5000,
      date: '2017-01-01',
    });

    const detected = await findTransferCandidates('one', [
      { account: 'one', amount: -5000, date: '2017-01-01' },
    ]);

    expect(detected).toHaveLength(0);
  });

  it('ignores transactions that are already part of a transfer', async () => {
    const existingId = await db.insertTransaction({
      account: 'two',
      amount: 5000,
      date: '2017-01-01',
    });
    const otherId = await db.insertTransaction({
      account: 'three',
      amount: -5000,
      date: '2017-01-01',
    });
    await db.updateTransaction({ id: existingId, transfer_id: otherId });

    const detected = await findTransferCandidates('one', [
      { account: 'one', amount: -5000, date: '2017-01-01' },
    ]);

    expect(detected).toHaveLength(0);
  });

  it('never claims the same counterpart twice in one batch', async () => {
    await db.insertTransaction({
      account: 'two',
      amount: 5000,
      date: '2017-01-01',
    });

    const detected = await findTransferCandidates('one', [
      { account: 'one', amount: -5000, date: '2017-01-01' },
      { account: 'one', amount: -5000, date: '2017-01-01' },
    ]);

    expect(detected).toHaveLength(1);
  });

  it('ignores zero-amount transactions, which would match indiscriminately', async () => {
    await db.insertTransaction({
      account: 'two',
      amount: 0,
      date: '2017-01-01',
    });

    const detected = await findTransferCandidates('one', [
      { account: 'one', amount: 0, date: '2017-01-01' },
    ]);

    expect(detected).toHaveLength(0);
  });
});

describe('linkImportedTransfers', () => {
  beforeEach(prepareDatabase);

  it('links both legs without creating a third transaction', async () => {
    const fromId = await db.insertTransaction({
      account: 'one',
      amount: -5000,
      category: 'cat1',
      date: '2017-01-01',
    });
    const toId = await db.insertTransaction({
      account: 'two',
      amount: 5000,
      category: 'cat1',
      date: '2017-01-01',
    });

    await linkImportedTransfers([
      { transactionId: fromId, counterpartId: toId },
    ]);

    const all = await db.all('SELECT id FROM v_transactions_internal');
    expect(all).toHaveLength(2);

    expect((await getTransaction(fromId)).transfer_id).toBe(toId);
    expect((await getTransaction(toId)).transfer_id).toBe(fromId);
  });

  it('points each leg at the other account transfer payee', async () => {
    const fromId = await db.insertTransaction({
      account: 'one',
      amount: -5000,
      date: '2017-01-01',
    });
    const toId = await db.insertTransaction({
      account: 'two',
      amount: 5000,
      date: '2017-01-01',
    });

    await linkImportedTransfers([
      { transactionId: fromId, counterpartId: toId },
    ]);

    expect((await getTransaction(fromId)).payee).toBe(
      await getTransferPayeeId('two'),
    );
    expect((await getTransaction(toId)).payee).toBe(
      await getTransferPayeeId('one'),
    );
  });

  it('clears categories when both accounts sit on the same budget side', async () => {
    const fromId = await db.insertTransaction({
      account: 'one',
      amount: -5000,
      category: 'cat1',
      date: '2017-01-01',
    });
    const toId = await db.insertTransaction({
      account: 'two',
      amount: 5000,
      category: 'cat1',
      date: '2017-01-01',
    });

    await linkImportedTransfers([
      { transactionId: fromId, counterpartId: toId },
    ]);

    expect((await getTransaction(fromId)).category).toBeNull();
    expect((await getTransaction(toId)).category).toBeNull();
  });

  it('keeps categories when the transfer crosses the budget boundary', async () => {
    const fromId = await db.insertTransaction({
      account: 'one',
      amount: -5000,
      category: 'cat1',
      date: '2017-01-01',
    });
    const toId = await db.insertTransaction({
      account: 'offbudget',
      amount: 5000,
      category: 'cat1',
      date: '2017-01-01',
    });

    await linkImportedTransfers([
      { transactionId: fromId, counterpartId: toId },
    ]);

    expect((await getTransaction(fromId)).category).toBe('cat1');
  });

  it('does nothing when given no links', async () => {
    await expect(linkImportedTransfers([])).resolves.toBeUndefined();
  });
});
