import {
  sixOrbitInclusiveLineAmounts,
  sixOrbitOrderCharges,
} from './sixorbit-sales-order-push.service';

describe('sixOrbitInclusiveLineAmounts', () => {
  it('sends the GST-inclusive invoice rate and total to SixOrbit', () => {
    expect(sixOrbitInclusiveLineAmounts({ qtyBoxes: 1, lineTotal: 1100 })).toEqual({
      price: '1100',
      amount: '1100',
    });
  });

  it('derives the inclusive unit rate for multiple boxes', () => {
    expect(sixOrbitInclusiveLineAmounts({ qtyBoxes: 10, lineTotal: 4200 })).toEqual({
      price: '420',
      amount: '4200',
    });
  });
});

describe('sixOrbitOrderCharges', () => {
  it('maps freight and combines unloading into loading when SixOrbit has no unloading charge', () => {
    expect(
      sixOrbitOrderCharges(
        [
          { title: 'Loading Charges', ecid: '410000633', butapid: '' },
          { title: 'Auto Freight', ecid: '410000634', butapid: '' },
        ],
        { freightCharge: 500, loadingCharge: 100, unloadingCharge: 200 },
      ),
    ).toEqual([
      { id: '410000634', value: '500.00', charges: '0' },
      { id: '410000633', value: '300.00', charges: '0' },
    ]);
  });

  it('sends loading and unloading separately when both charge IDs exist', () => {
    expect(
      sixOrbitOrderCharges(
        [
          { title: 'Loading Charges', ecid: 'load' },
          { title: 'Unloading Charges', ecid: 'unload' },
          { title: 'Auto Freight', ecid: 'freight' },
        ],
        { freightCharge: 50, loadingCharge: 10, unloadingCharge: 20 },
      ),
    ).toEqual([
      { id: 'freight', value: '50.00', charges: '0' },
      { id: 'load', value: '10.00', charges: '0' },
      { id: 'unload', value: '20.00', charges: '0' },
    ]);
  });
});
