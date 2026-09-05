import {
  DEFAULT_NUMBER_FORMAT,
  financialYearOf,
  financialYearStart,
  formatDocumentNumber,
  isValidPrefix,
  previewDocumentNumber,
} from './numbering';

const format = { prefix: 'AMB', ...DEFAULT_NUMBER_FORMAT };

describe('financialYearOf', () => {
  it('starts a new year on 1 April', () => {
    expect(financialYearOf(new Date(2026, 3, 1))).toBe('26-27');
  });

  it('keeps 31 March in the year that began the previous April', () => {
    expect(financialYearOf(new Date(2026, 2, 31))).toBe('25-26');
  });

  it('puts a December date in the year that began that April', () => {
    expect(financialYearOf(new Date(2026, 11, 25))).toBe('26-27');
  });

  it('puts a January date in the year that began the previous April', () => {
    expect(financialYearOf(new Date(2027, 0, 5))).toBe('26-27');
  });

  it('pads a turn-of-century year to two digits', () => {
    expect(financialYearOf(new Date(2099, 11, 1))).toBe('99-00');
  });
});

describe('financialYearStart', () => {
  // Compared in local parts, not ISO: the boundary is local midnight on 1 April, which
  // in IST is the evening of 31 March in UTC. Asserting on toISOString would be testing
  // the timezone rather than the rule.
  const localDate = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;

  it('is 1 April of the year the date belongs to', () => {
    expect(localDate(financialYearStart(new Date(2027, 0, 5)))).toBe('2026-04-01');
  });

  it('is the same day for 1 April itself', () => {
    expect(localDate(financialYearStart(new Date(2026, 3, 1)))).toBe('2026-04-01');
  });

  it('starts at midnight, so a document raised on 1 April is inside the new year', () => {
    const start = financialYearStart(new Date(2026, 3, 1, 9, 30));
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe('formatDocumentNumber', () => {
  it('joins prefix, year and a padded sequence', () => {
    expect(formatDocumentNumber(format, 1, '26-27')).toBe('AMB/26-27/0001');
  });

  it('leaves the year out when the series does not reset', () => {
    expect(formatDocumentNumber({ ...format, resetAnnually: false }, 42, '26-27')).toBe('AMB/0042');
  });

  it('leaves the year out when there is not one', () => {
    expect(formatDocumentNumber(format, 7, null)).toBe('AMB/0007');
  });

  it('honours the separator', () => {
    expect(formatDocumentNumber({ ...format, separator: '-' }, 1, '26-27')).toBe('AMB-26-27-0001');
  });

  it('honours the padding', () => {
    expect(formatDocumentNumber({ ...format, padding: 6 }, 12, '26-27')).toBe('AMB/26-27/000012');
  });

  it('does not truncate a sequence longer than the padding', () => {
    expect(formatDocumentNumber({ ...format, padding: 3 }, 12345, '26-27')).toBe('AMB/26-27/12345');
  });

  it('trims a prefix rather than emitting a ragged number', () => {
    expect(formatDocumentNumber({ ...format, prefix: ' AMB ' }, 1, '26-27')).toBe('AMB/26-27/0001');
  });
});

describe('previewDocumentNumber', () => {
  it('shows what the first number of the year will look like', () => {
    expect(previewDocumentNumber(format, new Date(2026, 5, 1))).toBe('AMB/26-27/0001');
  });
});

describe('isValidPrefix', () => {
  it.each(['AMB', 'HO', 'AM-BUILD', 'BR_1', 'A1'])('accepts %s', (prefix) => {
    expect(isValidPrefix(prefix)).toBe(true);
  });

  it('rejects an empty prefix', () => {
    expect(isValidPrefix('')).toBe(false);
    expect(isValidPrefix('   ')).toBe(false);
  });

  it('rejects untrimmed whitespace, which reads as a different series to a human', () => {
    expect(isValidPrefix('AMB ')).toBe(false);
    expect(isValidPrefix(' AMB')).toBe(false);
  });

  it('rejects a separator inside the prefix', () => {
    expect(isValidPrefix('AM/B')).toBe(false);
  });

  it('rejects a prefix that does not start with a letter or digit', () => {
    expect(isValidPrefix('-AMB')).toBe(false);
  });

  it('rejects one long enough to swamp the number', () => {
    expect(isValidPrefix('A'.repeat(13))).toBe(false);
  });
});
