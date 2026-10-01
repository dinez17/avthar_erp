import { customerNamesMatch, normalizeCustomerName } from './sixorbit-customer-push.service';

describe('SixOrbit customer name matching', () => {
  it('matches a local name contained in a titled SixOrbit name', () => {
    expect(customerNamesMatch('Thangavel', 'Mr. Golden Thangavel')).toBe(true);
  });

  it('ignores SixOrbit balance suffixes and punctuation', () => {
    expect(customerNamesMatch('A Subbu Raj', 'A . SUBBU RAJ [Balance: 0.00]')).toBe(true);
  });

  it('matches names whose spacing differs', () => {
    expect(customerNamesMatch('Dinesh Babu', 'DINESHBABU')).toBe(true);
  });

  it('does not match unrelated customers sharing a phone number', () => {
    expect(customerNamesMatch('Thangavel', 'Golden Murugan')).toBe(false);
  });

  it('removes common salutations during normalization', () => {
    expect(normalizeCustomerName('Mr. Golden Thangavel')).toBe('golden thangavel');
  });
});
