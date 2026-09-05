import {
  checkSqftPerBox,
  expectedSqftPerBox,
  parseSizeMm,
  sqftPerPiece,
  SQ_MM_PER_SQ_FT,
} from './tile-area';

describe('parseSizeMm', () => {
  it('reads the usual forms', () => {
    expect(parseSizeMm('600x600')).toEqual({ lengthMm: 600, widthMm: 600 });
    expect(parseSizeMm('600 X 1200')).toEqual({ lengthMm: 600, widthMm: 1200 });
    expect(parseSizeMm('800*800mm')).toEqual({ lengthMm: 800, widthMm: 800 });
    expect(parseSizeMm('300×450')).toEqual({ lengthMm: 300, widthMm: 450 });
  });

  it('gives up rather than guessing', () => {
    expect(parseSizeMm(null)).toBeNull();
    expect(parseSizeMm('')).toBeNull();
    expect(parseSizeMm('large')).toBeNull();
    expect(parseSizeMm('600')).toBeNull();
    expect(parseSizeMm('0x600')).toBeNull();
  });
});

describe('sqftPerPiece', () => {
  it('converts a 600x600 tile', () => {
    // 360,000 mm² ÷ 92,903.04 = 3.875 sq.ft
    expect(sqftPerPiece({ lengthMm: 600, widthMm: 600 })).toBeCloseTo(3.875, 3);
  });

  it('uses the exact conversion', () => {
    expect(sqftPerPiece({ lengthMm: 1000, widthMm: 1000 })).toBeCloseTo(
      1_000_000 / SQ_MM_PER_SQ_FT,
      3,
    );
  });
});

describe('expectedSqftPerBox', () => {
  it('multiplies by the piece count', () => {
    expect(expectedSqftPerBox('600x600', 3)).toBeCloseTo(11.625, 2);
    expect(expectedSqftPerBox('600x1200', 2)).toBeCloseTo(15.5, 1);
  });

  it('is null when the size cannot be read', () => {
    expect(expectedSqftPerBox(null, 4)).toBeNull();
    expect(expectedSqftPerBox('assorted', 4)).toBeNull();
  });

  it('is null when there are no pieces', () => {
    expect(expectedSqftPerBox('600x600', 0)).toBeNull();
  });
});

describe('checkSqftPerBox', () => {
  it('accepts a correct figure', () => {
    expect(checkSqftPerBox('600x600', 3, 11.625).verdict).toBe('OK');
  });

  it('accepts a nominal size a few percent out', () => {
    // A "600x600" is really 597x597, and the trade rounds. That is not an error.
    expect(checkSqftPerBox('600x600', 3, 11.4).verdict).toBe('OK');
    expect(checkSqftPerBox('600x600', 4, 15.5).verdict).toBe('OK');
  });

  it('catches the cm² mistake, which is the one that actually happens', () => {
    // 600x600 is 3,600 cm², and 3,600 is what gets typed into a sq.ft field.
    const check = checkSqftPerBox('600x600', 3, 3600);
    expect(check.verdict).toBe('SUSPECT');
    expect(check.likelyCause).toMatch(/cm²/);
    expect(check.expected).toBeCloseTo(11.625, 2);
  });

  it('catches one piece recorded instead of the box', () => {
    const check = checkSqftPerBox('600x600', 4, 3.875);
    expect(check.verdict).toBe('SUSPECT');
    expect(check.likelyCause).toMatch(/one piece/);
  });

  it('catches the piece count applied twice', () => {
    const check = checkSqftPerBox('600x600', 4, 62);
    expect(check.verdict).toBe('SUSPECT');
    expect(check.likelyCause).toMatch(/twice/);
  });

  it('catches square metres', () => {
    // 600x600 x 4 is 1.44 m², which is 15.5 sq.ft.
    const check = checkSqftPerBox('600x600', 4, 1.44);
    expect(check.verdict).toBe('SUSPECT');
    expect(check.likelyCause).toMatch(/square metres/);
  });

  it('flags nothing recorded', () => {
    const check = checkSqftPerBox('600x600', 3, 0);
    expect(check.verdict).toBe('SUSPECT');
    expect(check.likelyCause).toMatch(/No area/);
  });

  it('says nothing about a product whose size cannot be read', () => {
    const check = checkSqftPerBox('assorted', 3, 999);
    expect(check.verdict).toBe('UNKNOWN');
    expect(check.expected).toBeNull();
    expect(check.likelyCause).toBeNull();
  });

  it('takes a tolerance of its own', () => {
    expect(checkSqftPerBox('600x600', 3, 13, 0.2).verdict).toBe('OK');
    expect(checkSqftPerBox('600x600', 3, 13, 0.05).verdict).toBe('SUSPECT');
  });

  it('reports the ratio, so the size of the error is visible', () => {
    const check = checkSqftPerBox('600x600', 3, 3600);
    expect(check.ratio).toBeGreaterThan(300);
  });
});
