import { ConflictError, ValidationError } from '@tiles-erp/shared';
import {
  CreateCustomerCommand,
  CreateCustomerHandler,
  CreateSupplierCommand,
  CreateSupplierHandler,
} from './party.handlers';
import type { PartyRepository } from '../domain/party.repository';
import type { PartyItem } from '@tiles-erp/shared-types';

const item = { id: 'c1' } as PartyItem;

const mockRepo = (): jest.Mocked<PartyRepository> => ({
  list: jest.fn(),
  findById: jest.fn(),
  codeExists: jest.fn().mockResolvedValue(false),
  findByPhone: jest.fn().mockResolvedValue(null),
  nextCode: jest.fn().mockResolvedValue('CUST-000001'),
  create: jest.fn().mockResolvedValue(item),
  update: jest.fn(),
  softDelete: jest.fn(),
});

describe('Party create handlers', () => {
  it('assigns the next sequential code when none is supplied', async () => {
    const repo = mockRepo();
    const handler = new CreateCustomerHandler(repo);
    await handler.execute(new CreateCustomerCommand({ name: '  Sri Balaji  ', phone: '9876543210' }, 'actor'));
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CUST-000001', name: 'Sri Balaji' }),
    );
  });

  it('derives the state name and uppercases GSTIN/PAN', async () => {
    const repo = mockRepo();
    const handler = new CreateSupplierHandler(repo);
    await handler.execute(
      new CreateSupplierCommand(
        { name: 'Kajaria Depot', stateCode: '33', gstin: '33aapfu0939f1zv', panNumber: 'aapfu0939f' },
        'actor',
      ),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'Tamil Nadu',
        gstin: '33AAPFU0939F1ZV',
        panNumber: 'AAPFU0939F',
      }),
    );
  });

  it('rejects a GSTIN that disagrees with the state code', async () => {
    const repo = mockRepo();
    const handler = new CreateCustomerHandler(repo);
    await expect(
      handler.execute(
        new CreateCustomerCommand(
          { name: 'X', phone: '9876543210', stateCode: '33', gstin: '27AAPFU0939F1ZV' },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a duplicate code', async () => {
    const repo = mockRepo();
    repo.codeExists.mockResolvedValue(true);
    const handler = new CreateCustomerHandler(repo);
    await expect(
      handler.execute(new CreateCustomerCommand({ name: 'X', phone: '9876543210', code: 'CUST-1' }, 'actor')),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('requires a phone number for customers', async () => {
    const repo = mockRepo();
    const handler = new CreateCustomerHandler(repo);
    await expect(
      handler.execute(new CreateCustomerCommand({ name: 'No Phone' }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('does not require a phone number for suppliers', async () => {
    const repo = mockRepo();
    const handler = new CreateSupplierHandler(repo);
    await handler.execute(new CreateSupplierCommand({ name: 'No Phone Vendor' }, 'actor'));
    expect(repo.create).toHaveBeenCalled();
  });

  it('blocks a second customer using the same phone number', async () => {
    const repo = mockRepo();
    repo.findByPhone.mockResolvedValue({
      name: 'Existing Customer',
      code: 'CUST-000009',
    } as PartyItem);
    const handler = new CreateCustomerHandler(repo);
    await expect(
      handler.execute(new CreateCustomerCommand({ name: 'Dup', phone: '9876543210' }, 'actor')),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('allows suppliers to share a phone number', async () => {
    const repo = mockRepo();
    repo.findByPhone.mockResolvedValue({ name: 'Other', code: 'SUPP-1' } as PartyItem);
    const handler = new CreateSupplierHandler(repo);
    await handler.execute(new CreateSupplierCommand({ name: 'Vendor', phone: '9876543210' }, 'a'));
    expect(repo.create).toHaveBeenCalled();
  });

  it('rejects negative credit terms', async () => {
    const repo = mockRepo();
    const handler = new CreateCustomerHandler(repo);
    await expect(
      handler.execute(
        new CreateCustomerCommand({ name: 'X', phone: '9876543210', creditLimit: -5 }, 'actor'),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
