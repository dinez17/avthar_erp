import { ValidationError } from '@tiles-erp/shared';

/**
 * Registering a walk-in as a customer when their quotation is accepted.
 *
 * A quote at the counter is often taken before anybody knows whether the person will
 * buy, so it carries a name and a phone number rather than a master record. Accepting it
 * is the moment they become a customer, and that is when the record should exist —
 * asking a clerk to go and create one by hand is how quotes end up converted against the
 * wrong account, or not at all.
 */

/**
 * The comparable form of a phone number.
 *
 * A counter writes the same number a dozen ways — `98765 43210`, `+91 9876543210`,
 * `098765-43210` — so matching on the raw string would create a fresh customer every
 * time. The last ten digits are the number in India; the country code and every space,
 * dash and bracket around it are decoration.
 */
export function normalisePhone(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** The details a walk-in quotation carries about the person who asked for it. */
export interface WalkInDetails {
  customerName: string;
  customerMobile: string | null;
  customerAddress: string | null;
}

/**
 * Checks the quote has enough to become a customer, and returns it normalised.
 *
 * A phone number is required, and it is the only field that is: without one there is no
 * way to tell this walk-in from the next, and the master would collect a new "Ramesh"
 * every time somebody of that name asked for a price.
 */
export function walkInRegistration(details: WalkInDetails): {
  name: string;
  phone: string;
  address: string | null;
} {
  const name = details.customerName.trim();
  if (!name) throw new ValidationError('The quotation has no customer name to register');

  const phone = normalisePhone(details.customerMobile);
  if (!phone) {
    throw new ValidationError(
      'Add a mobile number to this quotation before accepting it, so the customer can be created',
    );
  }

  return { name, phone, address: details.customerAddress?.trim() || null };
}
