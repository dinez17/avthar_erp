import { amountInWords, numberToIndianWords } from './money-words';

describe('numberToIndianWords', () => {
  it.each([
    [0, 'Zero'],
    [7, 'Seven'],
    [15, 'Fifteen'],
    [40, 'Forty'],
    [72, 'Seventy Two'],
    [100, 'One Hundred'],
    [315, 'Three Hundred Fifteen'],
    [1000, 'One Thousand'],
    [14750, 'Fourteen Thousand Seven Hundred Fifty'],
    [100000, 'One Lakh'],
    [1234567, 'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven'],
    [10000000, 'One Crore'],
    [123456789, 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine'],
  ])('spells %i', (value, expected) => {
    expect(numberToIndianWords(value)).toBe(expected);
  });
});

describe('amountInWords', () => {
  it('spells whole rupees', () => {
    expect(amountInWords(14750)).toBe('Rupees Fourteen Thousand Seven Hundred Fifty Only');
  });

  it('spells paise when there are any', () => {
    expect(amountInWords(14750.5)).toBe(
      'Rupees Fourteen Thousand Seven Hundred Fifty and Fifty Paise Only',
    );
  });

  it('rounds to the nearest paise rather than truncating', () => {
    expect(amountInWords(0.145)).toBe('Rupees Zero and Fifteen Paise Only');
  });

  it('handles a negative round off', () => {
    expect(amountInWords(-25)).toBe('Minus Rupees Twenty Five Only');
  });

  it('spells zero', () => {
    expect(amountInWords(0)).toBe('Rupees Zero Only');
  });
});
