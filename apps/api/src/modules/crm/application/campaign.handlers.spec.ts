import { toPerformanceRow } from './campaign.handlers';
import type { CampaignPerformanceAggregate } from '../domain/campaign.repository';

const agg = (over: Partial<CampaignPerformanceAggregate> = {}): CampaignPerformanceAggregate => ({
  campaignId: 'c1',
  code: 'CAMP-000001',
  name: 'Diwali Hoardings',
  channel: 'HOARDING',
  status: 'ACTIVE',
  budget: 50000,
  leadsCount: 20,
  convertedCount: 5,
  notInterestedCount: 3,
  openCount: 12,
  pipelineValue: 400000,
  convertedValue: 150000,
  ...over,
});

describe('toPerformanceRow', () => {
  it('divides the budget into a cost per lead and per conversion, and computes ROI', () => {
    const row = toPerformanceRow(agg());
    expect(row.costPerLead).toBe(2500); // 50000 / 20
    expect(row.costPerConversion).toBe(10000); // 50000 / 5
    expect(row.conversionRate).toBe(0.25); // 5 / 20
    // (150000 − 50000) / 50000 × 100
    expect(row.roiPct).toBe(200);
  });

  it('guards divide-by-zero: no leads, no conversions, no budget', () => {
    const row = toPerformanceRow(
      agg({ leadsCount: 0, convertedCount: 0, pipelineValue: 0, convertedValue: 0, budget: 0 }),
    );
    expect(row.costPerLead).toBeNull();
    expect(row.costPerConversion).toBeNull();
    expect(row.conversionRate).toBe(0);
    expect(row.roiPct).toBeNull();
  });

  it('reports a negative ROI when converted value is below the spend', () => {
    const row = toPerformanceRow(agg({ budget: 100000, convertedValue: 40000 }));
    // (40000 − 100000) / 100000 × 100
    expect(row.roiPct).toBe(-60);
  });
});
