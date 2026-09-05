import { ValidationError } from '@tiles-erp/shared';
import { normalisePhone, walkInRegistration } from './walk-in';

describe('normalisePhone', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['+91 9876543210', '9876543210'],
    ['+91-98765-43210', '9876543210'],
    ['098765 43210', '9876543210'],
    ['(98765) 43210', '9876543210'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it('gives the same answer however the counter wrote it', () => {
    const forms = ['9876543210', '+91 98765 43210', '098765-43210', '91 9876543210'];
    expect(new Set(forms.map(normalisePhone)).size).toBe(1);
  });

  it('has nothing to match on for a number too short to be one', () => {
    expect(normalisePhone('12345')).toBeNull();
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone('n/a')).toBeNull();
  });
});

describe('walkInRegistration', () => {
  const details = {
    customerName: '  Ramesh  ',
    customerMobile: '+91 98765 43210',
    customerAddress: '  4 Bazaar Street  ',
  };

  it('trims the name and normalises the number', () => {
    expect(walkInRegistration(details)).toEqual({
      name: 'Ramesh',
      phone: '9876543210',
      address: '4 Bazaar Street',
    });
  });

  it('accepts a walk-in with no address', () => {
    expect(walkInRegistration({ ...details, customerAddress: null }).address).toBeNull();
    expect(walkInRegistration({ ...details, customerAddress: '   ' }).address).toBeNull();
  });

  /**
   * Without a number there is nothing to tell one walk-in from the next, so the master
   * would gain a new "Ramesh" every time somebody of that name asked for a price.
   */
  it('refuses without a usable phone number', () => {
    expect(() => walkInRegistration({ ...details, customerMobile: null })).toThrow(
      ValidationError,
    );
    expect(() => walkInRegistration({ ...details, customerMobile: '12345' })).toThrow(
      /mobile number/,
    );
  });

  it('refuses without a name', () => {
    expect(() => walkInRegistration({ ...details, customerName: '   ' })).toThrow(/name/);
  });
});
