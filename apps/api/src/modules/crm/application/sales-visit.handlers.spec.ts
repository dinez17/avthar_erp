import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type { SalesVisitItem } from '@tiles-erp/shared-types';
import {
  CreateSalesVisitCommand,
  CreateSalesVisitHandler,
  visitSideEffect,
  type EffectiveVisit,
} from './sales-visit.handlers';
import type {
  LeadVisitSideEffect,
  SalesVisitRepository,
} from '../domain/sales-visit.repository';

const visit = (over: Partial<EffectiveVisit> = {}): EffectiveVisit => ({
  status: 'PLANNED',
  outcome: null,
  scheduledAt: '2026-08-25T09:00:00.000Z',
  nextFollowUpAt: null,
  notes: null,
  ...over,
});

describe('visitSideEffect', () => {
  it('leaves a settled lead untouched', () => {
    expect(visitSideEffect('CONVERTED', visit())).toBeNull();
    expect(visitSideEffect('NOT_INTERESTED', visit())).toBeNull();
  });

  it('a planned visit becomes a new lead’s next action and moves it to follow-up', () => {
    expect(visitSideEffect('NEW', visit())).toEqual({
      stage: 'FOLLOW_UP',
      nextFollowUpAt: new Date('2026-08-25T09:00:00.000Z'),
    });
  });

  it('a planned visit only sets the follow-up when the lead is already worked', () => {
    expect(visitSideEffect('FOLLOW_UP', visit())).toEqual({
      nextFollowUpAt: new Date('2026-08-25T09:00:00.000Z'),
    });
  });

  it('a completed "not interested" visit closes the lead with the note as the reason', () => {
    const effect = visitSideEffect(
      'FOLLOW_UP',
      visit({ status: 'COMPLETED', outcome: 'NOT_INTERESTED', notes: 'Chose a competitor' }),
    );
    expect(effect).toEqual({ stage: 'NOT_INTERESTED', lostReason: 'Chose a competitor' });
  });

  it('a completed positive visit carries the agreed next-action date', () => {
    const effect = visitSideEffect(
      'FOLLOW_UP',
      visit({
        status: 'COMPLETED',
        outcome: 'QUOTATION_REQUESTED',
        nextFollowUpAt: '2026-09-01T09:00:00.000Z',
      }),
    );
    expect(effect).toEqual({ nextFollowUpAt: new Date('2026-09-01T09:00:00.000Z') });
  });

  it('a cancelled visit or a no-show changes nothing', () => {
    expect(visitSideEffect('FOLLOW_UP', visit({ status: 'CANCELLED' }))).toBeNull();
    expect(visitSideEffect('FOLLOW_UP', visit({ status: 'NO_SHOW' }))).toBeNull();
  });
});

const mockRepo = (stage = 'FOLLOW_UP'): jest.Mocked<SalesVisitRepository> => ({
  list: jest.fn(),
  findById: jest.fn(),
  leadStage: jest.fn().mockResolvedValue(stage),
  salespersonName: jest.fn().mockResolvedValue('Arun Kumar'),
  create: jest.fn().mockResolvedValue({ id: 'v1' } as SalesVisitItem),
  update: jest.fn().mockResolvedValue({ id: 'v1' } as SalesVisitItem),
  softDelete: jest.fn(),
});

const sideEffectOf = (repo: jest.Mocked<SalesVisitRepository>): LeadVisitSideEffect | null =>
  repo.create.mock.calls[0]![1];

describe('CreateSalesVisitHandler', () => {
  it('requires an outcome to log a completed visit', async () => {
    const repo = mockRepo();
    const handler = new CreateSalesVisitHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesVisitCommand(
          { leadId: 'l1', status: 'COMPLETED', scheduledAt: '2026-08-25T09:00:00.000Z' },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('reports a missing lead', async () => {
    const repo = mockRepo();
    repo.leadStage.mockResolvedValue(null);
    const handler = new CreateSalesVisitHandler(repo);
    await expect(
      handler.execute(
        new CreateSalesVisitCommand({ leadId: 'l1', scheduledAt: '2026-08-25T09:00:00.000Z' }, 'a'),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('schedules a planned visit and passes the lead side effect through', async () => {
    const repo = mockRepo('NEW');
    const handler = new CreateSalesVisitHandler(repo);
    await handler.execute(
      new CreateSalesVisitCommand(
        { leadId: 'l1', scheduledAt: '2026-08-25T09:00:00.000Z', salespersonUserId: 'u1' },
        'a',
      ),
    );
    expect(sideEffectOf(repo)).toEqual({
      stage: 'FOLLOW_UP',
      nextFollowUpAt: new Date('2026-08-25T09:00:00.000Z'),
    });
  });
});
