import TableViewIcon from '@mui/icons-material/TableView';
import {
  Box,
  Button,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { GSTR1_SECTIONS, summarise, type CsvValue, type Gstr1Section } from '@tiles-erp/shared';
import type { Gstr1Return } from '@tiles-erp/shared-types';
import { downloadCsv } from '../../lib/download';

/**
 * How many rows are drawn before the view stops. A month of counter sales can run to
 * thousands of B2B rows and the browser would spend its time laying them out; the CSV and
 * the workbook carry every one of them, which is what a filer actually uses.
 */
const MAX_ROWS = 300;

const number = (value: number): string =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** Numbers right-aligned as a spreadsheet aligns them, blanks left as blanks. */
function Cell({ value }: { value: CsvValue }): JSX.Element {
  const numeric = typeof value === 'number';
  return (
    <TableCell
      align={numeric ? 'right' : 'left'}
      sx={{ whiteSpace: 'nowrap', fontSize: 13, py: 0.5 }}
    >
      {value === null || value === undefined || value === '' ? '' : numeric ? number(value) : value}
    </TableCell>
  );
}

/**
 * The return as the GST offline tool's own workbook shows it: one tab per sheet, the
 * summary band above the headers, and the rows underneath in the tool's column order.
 *
 * Reading it here rather than in Excel is the point — what is about to be uploaded can be
 * checked before it is, and each sheet still downloads on its own.
 */
export function Gstr1SheetView({
  data,
  period,
}: {
  data: Gstr1Return;
  /** The filing period, used in the filename: `2026-08`. */
  period: string;
}): JSX.Element {
  const [active, setActive] = useState(0);
  const section: Gstr1Section = GSTR1_SECTIONS[active]!;
  const rows = section.rows(data);
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <Paper variant="outlined">
      <Tabs
        value={active}
        onChange={(_, next: number) => setActive(next)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 40,
          '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontFamily: 'monospace' },
        }}
      >
        {GSTR1_SECTIONS.map((each) => (
          <Tab
            key={each.key}
            label={`${each.sheet} (${each.rows(data).length})`}
            id={`gstr1-tab-${each.key}`}
          />
        ))}
      </Tabs>

      <Box sx={{ p: 1.5 }}>
        <Stack
          direction="row"
          alignItems="flex-start"
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 1 }}
        >
          <Stack>
            <Typography variant="subtitle2">{section.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {section.label}
            </Typography>
          </Stack>
          <Button
            className="print-hidden"
            size="small"
            startIcon={<TableViewIcon />}
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv(
                `GSTR1-${section.sheet.replace(/[(),]/g, '')}-${period}.csv`,
                section.headers,
                rows,
              )
            }
          >
            CSV
          </Button>
        </Stack>

        {/* Row 2 and 3 of the sheet: what it totals, and to what. */}
        <Stack
          direction="row"
          spacing={3}
          flexWrap="wrap"
          useFlexGap
          sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 1, mb: 1 }}
        >
          {section.summary.map((summary) => (
            <Stack key={summary.label}>
              <Typography variant="caption" color="text.secondary">
                {summary.label}
              </Typography>
              <Typography variant="body2" fontWeight={700}>
                {number(summarise(summary, rows))}
              </Typography>
            </Stack>
          ))}
        </Stack>

        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' } }}>
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: 'primary.main', color: 'primary.contrastText' } }}>
                <TableCell sx={{ width: 44, fontSize: 12 }}>#</TableCell>
                {section.headers.map((header) => (
                  <TableCell key={header} sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((row, index) => (
                <TableRow key={index} hover>
                  <TableCell sx={{ color: 'text.secondary', fontSize: 12, py: 0.5 }}>
                    {index + 1}
                  </TableCell>
                  {row.map((value, column) => (
                    <Cell key={column} value={value} />
                  ))}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={section.headers.length + 1}>
                    <Typography variant="body2" color="text.secondary">
                      Nothing in this section for the period — the sheet uploads empty, which is
                      correct when there were no such supplies.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>

        {rows.length > shown.length && (
          <Typography variant="caption" color="text.secondary">
            Showing the first {MAX_ROWS} of {rows.length} rows. The CSV and the workbook carry all
            of them.
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
