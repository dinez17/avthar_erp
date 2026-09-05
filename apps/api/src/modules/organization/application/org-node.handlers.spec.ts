import { ValidationError } from '@tiles-erp/shared';
import {
  BulkCreateGatesHandler,
  CreateBranchHandler,
  CreateCompanyHandler,
} from './org-node.handlers';
import {
  BulkCreateGatesCommand,
  CreateBranchCommand,
  CreateCompanyCommand,
} from './org-node.commands';
import type { OrgNodeBulkRepository, OrgNodeRepository } from '../domain/org-node.repository';
import type { OrgNodeItem } from '@tiles-erp/shared-types';

const item: OrgNodeItem = {
  id: 'n1',
  name: 'Node',
  code: 'C-1',
  legalName: null,
  gstin: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  stateCode: null,
  pincode: null,
  phone: null,
  email: null,
  isActive: true,
  parentId: null,
  parentName: null,
  childCount: 0,
  version: 1,
};

const mockRepo = (): jest.Mocked<OrgNodeRepository> => ({
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
});

describe('Org node create handlers', () => {
  it('creates a company without parent or code', async () => {
    const repo = mockRepo();
    repo.create.mockResolvedValue(item);
    const handler = new CreateCompanyHandler(repo);
    const result = await handler.execute(
      new CreateCompanyCommand({ name: '  Tiles HQ  ' }, 'actor'),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tiles HQ', parentId: null, code: null, isActive: true }),
    );
    expect(result).toBe(item);
  });

  it('rejects a branch without a parent', async () => {
    const repo = mockRepo();
    const handler = new CreateBranchHandler(repo);
    await expect(
      handler.execute(new CreateBranchCommand({ name: 'Branch', code: 'B-1' }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a GSTIN that does not match the selected state code', async () => {
    const repo = mockRepo();
    const handler = new CreateCompanyHandler(repo);
    await expect(
      handler.execute(
        new CreateCompanyCommand(
          { name: 'HQ', stateCode: '33', gstin: '27AAPFU0939F1ZV' },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('derives the state name from a valid GST state code', async () => {
    const repo = mockRepo();
    repo.create.mockResolvedValue(item);
    const handler = new CreateCompanyHandler(repo);
    await handler.execute(
      new CreateCompanyCommand({ name: 'HQ', stateCode: '33' }, 'actor'),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ stateCode: '33', state: 'Tamil Nadu' }),
    );
  });

  it('rejects a branch without a code and uppercases provided codes', async () => {
    const repo = mockRepo();
    repo.create.mockResolvedValue(item);
    const handler = new CreateBranchHandler(repo);

    await expect(
      handler.execute(new CreateBranchCommand({ name: 'Branch', parentId: 'c1' }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);

    await handler.execute(
      new CreateBranchCommand({ name: 'Branch', parentId: 'c1', code: 'br-01' }, 'actor'),
    );
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ code: 'BR-01' }));
  });
});


const mockBulkRepo = (): jest.Mocked<OrgNodeBulkRepository> => ({
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  bulkCreate: jest.fn(),
});

describe('BulkCreateGatesHandler', () => {
  it('normalises codes, keeps order and delegates to the repository', async () => {
    const repo = mockBulkRepo();
    repo.bulkCreate.mockResolvedValue([item]);
    const handler = new BulkCreateGatesHandler(repo);
    await handler.execute(
      new BulkCreateGatesCommand(
        { parentId: 'g1', items: [{ name: ' Gate 1 ', code: 'gate-01' }] },
        'actor',
      ),
    );
    expect(repo.bulkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 'g1',
        isActive: true,
        items: [{ name: 'Gate 1', code: 'GATE-01' }],
      }),
    );
  });

  it('rejects duplicate codes within the payload', async () => {
    const repo = mockBulkRepo();
    const handler = new BulkCreateGatesHandler(repo);
    await expect(
      handler.execute(
        new BulkCreateGatesCommand(
          {
            parentId: 'g1',
            items: [
              { name: 'A', code: 'G-1' },
              { name: 'B', code: 'g-1' },
            ],
          },
          'actor',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.bulkCreate).not.toHaveBeenCalled();
  });

  it('rejects an empty payload', async () => {
    const repo = mockBulkRepo();
    const handler = new BulkCreateGatesHandler(repo);
    await expect(
      handler.execute(new BulkCreateGatesCommand({ parentId: 'g1', items: [] }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
