import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';

dayjs.extend(utc);
dayjs.extend(relativeTime);

export const nowIso = (): string => dayjs().toISOString();

export const toIso = (value: Date | string | number): string => dayjs(value).toISOString();

export const formatDate = (value: Date | string | number, format = 'YYYY-MM-DD'): string =>
  dayjs(value).format(format);

export const addDays = (value: Date | string | number, days: number): Date =>
  dayjs(value).add(days, 'day').toDate();

export const diffInDays = (a: Date | string | number, b: Date | string | number): number =>
  dayjs(a).diff(dayjs(b), 'day');

export const isPast = (value: Date | string | number): boolean => dayjs(value).isBefore(dayjs());

export const fromNow = (value: Date | string | number): string => dayjs(value).fromNow();
