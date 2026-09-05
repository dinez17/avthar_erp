import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes the header row followed by the data, CRLF separated', () => {
    expect(toCsv(['A', 'B'], [[1, 2], [3, 4]])).toBe('A,B\r\n1,2\r\n3,4');
  });

  it('quotes values containing a comma, a quote or a newline', () => {
    expect(toCsv(['X'], [['a,b']])).toBe('X\r\n"a,b"');
    expect(toCsv(['X'], [['say "hi"']])).toBe('X\r\n"say ""hi"""');
    expect(toCsv(['X'], [['line1\nline2']])).toBe('X\r\n"line1\nline2"');
  });

  it('neutralises values a spreadsheet would treat as a formula', () => {
    expect(toCsv(['X'], [['=SUM(A1)']])).toBe("X\r\n'=SUM(A1)");
    expect(toCsv(['X'], [['-2024/07']])).toBe("X\r\n'-2024/07");
    expect(toCsv(['X'], [['+91 98765']])).toBe("X\r\n'+91 98765");
  });

  it('leaves negative numbers alone — only text is escaped', () => {
    expect(toCsv(['X'], [[-500]])).toBe('X\r\n-500');
  });

  it('renders empty cells for null and undefined', () => {
    expect(toCsv(['A', 'B'], [[null, undefined]])).toBe('A,B\r\n,');
  });

  it('renders booleans the way a spreadsheet reads them', () => {
    expect(toCsv(['X'], [[true], [false]])).toBe('X\r\nTRUE\r\nFALSE');
  });
});
