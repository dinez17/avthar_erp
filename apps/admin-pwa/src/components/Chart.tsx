import { useMemo } from 'react';
import { useTheme } from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';

// ApexCharts ships its own stylesheet for tooltips and the toolbar. Without it the
// tooltip renders as unstyled stacked text.
import 'apexcharts/dist/apexcharts.css';

type ChartType = NonNullable<ApexOptions['chart']>['type'];

interface ChartProps {
  type: ChartType;
  height: number;
  series: ApexOptions['series'];
  options?: ApexOptions;
}

/** Merges two levels deep, which is all the Apex option tree needs here. */
const merge = (base: ApexOptions, extra: ApexOptions): ApexOptions => {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const existing = out[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      out[key] = { ...(existing as object), ...(value as object) };
    } else {
      out[key] = value;
    }
  }
  return out as ApexOptions;
};

/**
 * ApexCharts wired to the MUI theme.
 *
 * Chart colours are read from the theme rather than hardcoded, so a chart stays
 * legible in dark mode instead of drawing dark grey axis labels on a dark ground.
 * The `key` on the rendered chart is tied to the palette mode: Apex mutates its own
 * DOM and does not re-read these options on a prop change alone, so toggling the
 * theme has to remount it.
 *
 * Legend marker sizing is deliberately left at the library default — that option
 * changed shape between ApexCharts 3 and 4, and pinning it here buys nothing but a
 * compile error the next time the dependency moves.
 */
export function Chart({ type, height, series, options = {} }: ChartProps): JSX.Element {
  const theme = useTheme();

  const merged = useMemo(() => {
    const muted = theme.palette.text.disabled;
    const label = { colors: muted, fontSize: '12px' };

    const base: ApexOptions = {
      chart: {
        type,
        height,
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: theme.typography.fontFamily,
        background: 'transparent',
        animations: { enabled: true },
      },
      theme: { mode: theme.palette.mode },
      colors: [
        theme.palette.primary.main,
        theme.palette.info.main,
        theme.palette.warning.main,
        theme.palette.success.main,
      ],
      dataLabels: { enabled: false },
      grid: {
        borderColor: theme.palette.divider,
        strokeDashArray: 4,
        padding: { left: 6, right: 6 },
      },
      xaxis: {
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: label },
      },
      yaxis: { labels: { style: label } },
      legend: {
        position: 'top',
        horizontalAlign: 'right',
        fontSize: '12.5px',
        labels: { colors: theme.palette.text.secondary },
        itemMargin: { horizontal: 10 },
      },
      tooltip: { theme: theme.palette.mode },
      stroke: { curve: 'smooth', width: 2.5 },
    };

    return merge(base, options);
  }, [theme, type, height, options]);

  return (
    <ReactApexChart
      key={theme.palette.mode}
      type={type}
      height={height}
      series={series}
      options={merged}
    />
  );
}
