import type { PaymentMechanism } from '../../domain/foundation/commitment';

/**
 * Money OS field/outcome types.
 *
 * Direction is never a user choice here (unlike F07's generic follow-up): `createObligation` and
 * `createExpectedIncome` are two distinct mutations, each with a fixed direction, so there is no
 * ambiguous picker and no way to save an obligation as income by mistake.
 *
 * Currency is never a user choice either, in V1: F09 is USD-only by product decision (see the
 * owner brief), enforced by always parsing amounts as 'USD' — never by validating a currency the
 * caller supplied. The stored `Money.currency` is still the explicit string 'USD', never blank or
 * implied, satisfying the doctrine that currency must be explicit in canonical storage.
 */

export interface MoneyItemFields {
  /** What it is, in her words. */
  title: string;
  /** A plain decimal string as typed ("80", "80.50"). Parsed exactly, never through a float. */
  amountText: string;
  /** Due date for an obligation, expected date for expected income. YYYY-MM-DD, household zone. */
  dueDate: string;
  /** Only meaningful for an obligation; ignored for expected income. Her descriptive truth, never bank verification. */
  paymentMechanism: PaymentMechanism | null;
  /** Optional canonical child this money concerns. */
  childId: string | null;
  /** Optional free-text context. */
  notes: string;
}

export type MoneyItemOutcome =
  | 'saved'
  | 'unchanged'
  | 'no_category'
  | 'category_archived'
  | 'invalid_child'
  | 'invalid_title'
  | 'invalid_text'
  | 'invalid_date'
  | 'invalid_amount'
  | 'missing'
  | 'not_open'
  | 'not_a_money_item'
  | 'stale';

export const MONEY_ITEM_OK: readonly MoneyItemOutcome[] = ['saved'];

export interface EditMoneyItemInput {
  taskId: string;
  /** The item's REVISION token when the editor was opened. Opaque — a stale-edit guard, mirroring F07. */
  baseUpdatedAt: string | null;
  fields: MoneyItemFields;
}
