const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
] as const;

/** Spells a number below one thousand, e.g. 315 -> "Three Hundred Fifteen". */
function underThousand(value: number): string {
  if (value < 20) return ONES[value] ?? '';
  if (value < 100) {
    const tens = TENS[Math.floor(value / 10)] ?? '';
    const ones = ONES[value % 10] ?? '';
    return ones ? `${tens} ${ones}` : tens;
  }
  const hundreds = `${ONES[Math.floor(value / 100)]} Hundred`;
  const rest = underThousand(value % 100);
  return rest ? `${hundreds} ${rest}` : hundreds;
}

/**
 * Spells a whole number using the Indian system: crore, lakh, thousand, hundred.
 * 1234567 -> "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven".
 */
export function numberToIndianWords(value: number): string {
  const whole = Math.floor(Math.abs(value));
  if (whole === 0) return 'Zero';

  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${numberToIndianWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest > 0) parts.push(underThousand(rest));

  return parts.join(' ');
}

/**
 * Renders an amount the way an Indian invoice or quotation prints it, paise included:
 * 14750.5 -> "Rupees Fourteen Thousand Seven Hundred Fifty and Fifty Paise Only".
 */
export function amountInWords(amount: number): string {
  const negative = amount < 0;
  // Binary floating point puts 0.145 * 100 at 14.499999…, which would round down and
  // print a paisa short, so nudge by an epsilon before rounding to the nearest paisa.
  const absolute = Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100;
  const rupees = Math.floor(absolute);
  const paise = Math.round((absolute - rupees) * 100);

  const words = [`Rupees ${numberToIndianWords(rupees)}`];
  if (paise > 0) words.push(`and ${numberToIndianWords(paise)} Paise`);
  words.push('Only');

  return `${negative ? 'Minus ' : ''}${words.join(' ')}`;
}
