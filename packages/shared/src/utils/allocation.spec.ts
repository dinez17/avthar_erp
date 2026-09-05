import {
  drawFromSources,
  preferHomeBranch,
  qtyFromBranch,
  supplyingBranches,
  type StockSource,
} from './allocation';

const source = (
  branchId: string,
  godownId: string,
  availableQtyBoxes: number,
  batchNo: string | null = null,
): StockSource => ({ branchId, godownId, batchNo, shade: null, availableQtyBoxes });

describe('preferHomeBranch', () => {
  it('puts the home branch first however little it holds', () => {
    const sources = [source('b2', 'g2', 500), source('b1', 'g1', 5)];
    expect(preferHomeBranch(sources, 'b1').map((s) => s.branchId)).toEqual(['b1', 'b2']);
  });

  it('keeps the order within a branch, so the oldest batch still ships first', () => {
    const sources = [
      source('b1', 'g1', 10, 'JAN'),
      source('b1', 'g2', 10, 'FEB'),
      source('b2', 'g3', 10, 'DEC'),
    ];
    expect(preferHomeBranch(sources, 'b1').map((s) => s.batchNo)).toEqual(['JAN', 'FEB', 'DEC']);
  });

  it('leaves the list alone when nothing is at home', () => {
    const sources = [source('b2', 'g2', 10), source('b3', 'g3', 10)];
    expect(preferHomeBranch(sources, 'b1')).toEqual(sources);
  });
});

describe('drawFromSources', () => {
  it('takes what the first source has, then moves on', () => {
    const sources = [source('b1', 'g1', 30), source('b1', 'g2', 50)];
    const { draws, shortfall } = drawFromSources(60, sources);
    expect(draws).toEqual([
      { source: sources[0], qtyBoxes: 30 },
      { source: sources[1], qtyBoxes: 30 },
    ]);
    expect(shortfall).toBe(0);
  });

  it('stops as soon as the quantity is met', () => {
    const sources = [source('b1', 'g1', 100), source('b2', 'g2', 100)];
    expect(drawFromSources(40, sources).draws).toHaveLength(1);
  });

  it('reports a shortfall rather than throwing', () => {
    const { draws, shortfall } = drawFromSources(100, [source('b1', 'g1', 30)]);
    expect(draws).toHaveLength(1);
    expect(shortfall).toBe(70);
  });

  it('skips a source with nothing free instead of writing a zero draw', () => {
    const sources = [source('b1', 'g1', 0), source('b1', 'g2', 20)];
    expect(drawFromSources(20, sources).draws).toEqual([{ source: sources[1], qtyBoxes: 20 }]);
  });

  it('handles part boxes without leaving a fraction chasing the next source', () => {
    const { draws, shortfall } = drawFromSources(10.5, [source('b1', 'g1', 10.5)]);
    expect(draws[0]!.qtyBoxes).toBe(10.5);
    expect(shortfall).toBe(0);
  });

  it('finds nothing when there is nowhere to look', () => {
    expect(drawFromSources(10, [])).toEqual({ draws: [], shortfall: 10 });
  });
});

describe('supplyingBranches', () => {
  it('lists each branch once, in the order first drawn on', () => {
    const sources = [source('b1', 'g1', 10), source('b2', 'g2', 10), source('b1', 'g3', 10)];
    const { draws } = drawFromSources(30, sources);
    expect(supplyingBranches(draws)).toEqual(['b1', 'b2']);
  });

  it('is empty when nothing was drawn', () => {
    expect(supplyingBranches([])).toEqual([]);
  });
});

describe('qtyFromBranch', () => {
  it('adds up every draw from one branch', () => {
    const sources = [source('b1', 'g1', 10), source('b2', 'g2', 15), source('b1', 'g3', 5)];
    const { draws } = drawFromSources(30, sources);
    expect(qtyFromBranch(draws, 'b1')).toBe(15);
    expect(qtyFromBranch(draws, 'b2')).toBe(15);
  });

  it('is zero for a branch that supplied nothing', () => {
    const { draws } = drawFromSources(5, [source('b1', 'g1', 10)]);
    expect(qtyFromBranch(draws, 'b9')).toBe(0);
  });
});
