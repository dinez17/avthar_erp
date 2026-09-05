import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type { CommandBus } from '@nestjs/cqrs';
import type { LeadItem, QuotationItem } from '@tiles-erp/shared-types';
import {
  ChangeLeadStageCommand,
  ChangeLeadStageHandler,
  ConvertLeadCommand,
  ConvertLeadHandler,
  CreateLeadCommand,
  CreateLeadHandler,
} from './lead.handlers';
import type { LeadRepository } from '../domain/lead.repository';

const NO_RIGHTS = { canOverridePrice: false, canSellBelowCost: false, canOverrideCredit: false };

const leadRow = (over: Partial<LeadItem> = {}): LeadItem => ({
  id: 'l1',
  code: 'LEAD-000001',
  name: 'Ramesh Kumar',
  companyName: 'Sri Balaji Traders',
  phone: '9876543210',
  altPhone: null,
  email: null,
  city: 'Chennai',
  source: 'PHONE',
  stage: 'FOLLOW_UP',
  ownerUserId: 'u1',
  ownerName: 'Arun Kumar',
  expectedValue: 50000,
  nextFollowUpAt: null,
  customerId: null,
  branchId: 'b1',
  campaignId: null,
  campaignName: null,
  convertedQuotationId: null,
  convertedAt: null,
  convertedByUserId: null,
  convertedByName: null,
  lostReason: null,
  notes: null,
  followUpOverdue: false,
  version: 1,
  ...over,
});

const mockRepo = (): jest.Mocked<LeadRepository> => ({
  list: jest.fn(),
  findById: jest.fn().mockResolvedValue(leadRow()),
  codeExists: jest.fn().mockResolvedValue(false),
  nextCode: jest.fn().mockResolvedValue('LEAD-000001'),
  pipeline: jest.fn(),
  assertReferences: jest.fn().mockResolvedValue(undefined),
  ownerName: jest.fn().mockResolvedValue('Arun Kumar'),
  create: jest.fn().mockImplementation(async (data) => leadRow({ code: data.code })),
  update: jest.fn().mockResolvedValue(leadRow()),
  changeStage: jest.fn().mockResolvedValue(leadRow({ stage: 'FOLLOW_UP' })),
  markConverted: jest
    .fn()
    .mockResolvedValue(leadRow({ stage: 'CONVERTED', convertedQuotationId: 'q1' })),
  softDelete: jest.fn(),
});

describe('CreateLeadHandler', () => {
  it('assigns the next code and snapshots the owner name when none is given', async () => {
    const repo = mockRepo();
    const handler = new CreateLeadHandler(repo);
    await handler.execute(
      new CreateLeadCommand({ name: 'New Prospect', ownerUserId: 'u1' }, 'actor'),
    );
    expect(repo.nextCode).toHaveBeenCalled();
    const [data] = repo.create.mock.calls[0]!;
    expect(data).toMatchObject({ code: 'LEAD-000001', ownerName: 'Arun Kumar', createdBy: 'actor' });
  });

  it('rejects a negative expected value', async () => {
    const repo = mockRepo();
    const handler = new CreateLeadHandler(repo);
    await expect(
      handler.execute(new CreateLeadCommand({ name: 'X', expectedValue: -1 }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a code already in use', async () => {
    const repo = mockRepo();
    repo.codeExists.mockResolvedValue(true);
    const handler = new CreateLeadHandler(repo);
    await expect(
      handler.execute(new CreateLeadCommand({ name: 'X', code: 'LEAD-000001' }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('ChangeLeadStageHandler', () => {
  it('refuses to set the converted stage by hand', async () => {
    const repo = mockRepo();
    const handler = new ChangeLeadStageHandler(repo);
    await expect(
      handler.execute(
        // CONVERTED is excluded by the type; a caller bypassing types is still rejected.
        new ChangeLeadStageCommand('l1', { version: 1, stage: 'CONVERTED' as never }, 'actor'),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.changeStage).not.toHaveBeenCalled();
  });

  it('requires a reason when marking a lead not interested', async () => {
    const repo = mockRepo();
    const handler = new ChangeLeadStageHandler(repo);
    await expect(
      handler.execute(
        new ChangeLeadStageCommand('l1', { version: 1, stage: 'NOT_INTERESTED' }, 'actor'),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('moves a lead to another open stage', async () => {
    const repo = mockRepo();
    const handler = new ChangeLeadStageHandler(repo);
    const result = await handler.execute(
      new ChangeLeadStageCommand('l1', { version: 1, stage: 'FOLLOW_UP' }, 'actor'),
    );
    expect(result.stage).toBe('FOLLOW_UP');
    expect(repo.changeStage).toHaveBeenCalledWith('l1', { version: 1, stage: 'FOLLOW_UP' }, 'actor');
  });
});

describe('ConvertLeadHandler', () => {
  const commandBus = (): jest.Mocked<Pick<CommandBus, 'execute'>> => ({
    execute: jest.fn().mockResolvedValue({ id: 'q1', quotationNumber: 'QT-1' } as QuotationItem),
  });

  it('raises a quotation from the lead and stamps it converted', async () => {
    const repo = mockRepo();
    const bus = commandBus();
    const handler = new ConvertLeadHandler(repo, bus as unknown as CommandBus);
    const result = await handler.execute(
      new ConvertLeadCommand(
        'l1',
        { lines: [{ productId: 'p1', rate: 1250, qtyBoxes: 10 }] },
        'actor',
        NO_RIGHTS,
      ),
    );
    // The lead's branch, customer name and owner flow into the quotation command.
    const [command] = bus.execute.mock.calls[0]!;
    expect(command).toMatchObject({
      actorId: 'actor',
      data: { branchId: 'b1', customerName: 'Sri Balaji Traders', salesmanUserId: 'u1' },
    });
    // The converting user is snapshotted alongside the id.
    expect(repo.markConverted).toHaveBeenCalledWith('l1', 1, 'q1', 'actor', 'Arun Kumar');
    expect(result.quotation.id).toBe('q1');
    expect(result.lead.convertedQuotationId).toBe('q1');
  });

  it('refuses to convert a lead that was already converted', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(leadRow({ convertedQuotationId: 'q0', stage: 'CONVERTED' }));
    const bus = commandBus();
    const handler = new ConvertLeadHandler(repo, bus as unknown as CommandBus);
    await expect(
      handler.execute(
        new ConvertLeadCommand('l1', { lines: [{ productId: 'p1', rate: 1 }] }, 'actor', NO_RIGHTS),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(bus.execute).not.toHaveBeenCalled();
  });

  it('refuses to convert a lead with no branch to quote from', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(leadRow({ branchId: null }));
    const bus = commandBus();
    const handler = new ConvertLeadHandler(repo, bus as unknown as CommandBus);
    await expect(
      handler.execute(
        new ConvertLeadCommand('l1', { lines: [{ productId: 'p1', rate: 1 }] }, 'actor', NO_RIGHTS),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('reports a missing lead', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(null);
    const bus = commandBus();
    const handler = new ConvertLeadHandler(repo, bus as unknown as CommandBus);
    await expect(
      handler.execute(
        new ConvertLeadCommand('l1', { lines: [{ productId: 'p1', rate: 1 }] }, 'actor', NO_RIGHTS),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
