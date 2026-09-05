import { ForbiddenError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type { SupplierPortalOrder } from '@tiles-erp/shared-types';
import { AcknowledgeOrderCommand, AcknowledgeOrderHandler } from './supplier-portal.handlers';
import type { SupplierPortalRepository } from '../domain/supplier-portal.repository';
import type { PortalAccessService } from './portal-access.service';

const order = { id: 'po1', poNumber: 'PO-1', ackStatus: 'ACKNOWLEDGED' } as SupplierPortalOrder;

const mockRepo = (): jest.Mocked<SupplierPortalRepository> => ({
  summary: jest.fn(),
  orders: jest.fn(),
  orderDetail: jest.fn(),
  invoices: jest.fn(),
  payments: jest.fn(),
  acknowledgeOrder: jest.fn().mockResolvedValue(order),
});

const allowAccess = (): jest.Mocked<Pick<PortalAccessService, 'assertSupplierAccess'>> => ({
  assertSupplierAccess: jest.fn().mockResolvedValue(undefined),
});

const cmd = (decision: 'ACKNOWLEDGED' | 'QUERIED' = 'ACKNOWLEDGED', note: string | null = null) =>
  new AcknowledgeOrderCommand('u1', 's1', 'po1', decision, note);

describe('AcknowledgeOrderHandler', () => {
  it('refuses when the user has no access to the supplier', async () => {
    const repo = mockRepo();
    const access = allowAccess();
    access.assertSupplierAccess.mockRejectedValue(new ForbiddenError('no'));
    const handler = new AcknowledgeOrderHandler(repo, access as unknown as PortalAccessService);
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.acknowledgeOrder).not.toHaveBeenCalled();
  });

  it('requires a note when raising a query', async () => {
    const repo = mockRepo();
    const handler = new AcknowledgeOrderHandler(
      repo,
      allowAccess() as unknown as PortalAccessService,
    );
    await expect(handler.execute(cmd('QUERIED', '  '))).rejects.toBeInstanceOf(ValidationError);
  });

  it('maps a not-found result to NotFoundError', async () => {
    const repo = mockRepo();
    repo.acknowledgeOrder.mockResolvedValue('NOT_FOUND');
    const handler = new AcknowledgeOrderHandler(
      repo,
      allowAccess() as unknown as PortalAccessService,
    );
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('maps a not-allowed result to ValidationError', async () => {
    const repo = mockRepo();
    repo.acknowledgeOrder.mockResolvedValue('NOT_ALLOWED');
    const handler = new AcknowledgeOrderHandler(
      repo,
      allowAccess() as unknown as PortalAccessService,
    );
    await expect(handler.execute(cmd())).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns the updated order on success', async () => {
    const repo = mockRepo();
    const handler = new AcknowledgeOrderHandler(
      repo,
      allowAccess() as unknown as PortalAccessService,
    );
    const result = await handler.execute(cmd());
    expect(result.poNumber).toBe('PO-1');
    expect(repo.acknowledgeOrder).toHaveBeenCalledWith('s1', 'po1', 'ACKNOWLEDGED', null, 'u1');
  });
});
