import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type { CallLogItem, LeadStage } from '@tiles-erp/shared-types';
import { CreateCallLogCommand, CreateCallLogHandler } from './call-log.handlers';
import type { CallLogRepository, LeadCallSideEffect } from '../domain/call-log.repository';

const mockRepo = (stage: LeadStage = 'FOLLOW_UP'): jest.Mocked<CallLogRepository> => ({
  list: jest.fn(),
  findById: jest.fn(),
  leadStage: jest.fn().mockResolvedValue(stage),
  callerName: jest.fn().mockResolvedValue('Arun Kumar'),
  create: jest.fn().mockResolvedValue({ id: 'c1', disposition: 'CONNECTED' } as CallLogItem),
  softDelete: jest.fn(),
});

/** The side effect the handler passed to the repository on the last create. */
const sideEffectOf = (repo: jest.Mocked<CallLogRepository>): LeadCallSideEffect | null =>
  repo.create.mock.calls[0]![1];

describe('CreateCallLogHandler', () => {
  it('requires a callback time for a CALLBACK disposition', async () => {
    const repo = mockRepo();
    const handler = new CreateCallLogHandler(repo);
    await expect(
      handler.execute(new CreateCallLogCommand({ leadId: 'l1', disposition: 'CALLBACK' }, 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a negative duration', async () => {
    const repo = mockRepo();
    const handler = new CreateCallLogHandler(repo);
    await expect(
      handler.execute(
        new CreateCallLogCommand(
          { leadId: 'l1', disposition: 'CONNECTED', durationSec: -5 },
          'a',
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('reports a missing lead', async () => {
    const repo = mockRepo();
    repo.leadStage.mockResolvedValue(null);
    const handler = new CreateCallLogHandler(repo);
    await expect(
      handler.execute(new CreateCallLogCommand({ leadId: 'l1', disposition: 'BUSY' }, 'a')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('closes an open lead on a not-interested call, carrying the note as the reason', async () => {
    const repo = mockRepo('FOLLOW_UP');
    const handler = new CreateCallLogHandler(repo);
    await handler.execute(
      new CreateCallLogCommand(
        { leadId: 'l1', disposition: 'NOT_INTERESTED', notes: 'Bought elsewhere' },
        'a',
      ),
    );
    expect(sideEffectOf(repo)).toEqual({
      stage: 'NOT_INTERESTED',
      lostReason: 'Bought elsewhere',
    });
  });

  it('sets the follow-up and moves a new lead into follow-up on a callback', async () => {
    const repo = mockRepo('NEW');
    const handler = new CreateCallLogHandler(repo);
    const callbackAt = '2026-08-20T10:00:00.000Z';
    await handler.execute(
      new CreateCallLogCommand({ leadId: 'l1', disposition: 'CALLBACK', callbackAt }, 'a'),
    );
    const effect = sideEffectOf(repo)!;
    expect(effect.stage).toBe('FOLLOW_UP');
    expect(effect.nextFollowUpAt).toEqual(new Date(callbackAt));
  });

  it('nudges a brand-new lead into follow-up on any worked call', async () => {
    const repo = mockRepo('NEW');
    const handler = new CreateCallLogHandler(repo);
    await handler.execute(
      new CreateCallLogCommand({ leadId: 'l1', disposition: 'CONNECTED' }, 'a'),
    );
    expect(sideEffectOf(repo)).toEqual({ stage: 'FOLLOW_UP' });
  });

  it('leaves a settled lead untouched', async () => {
    const repo = mockRepo('CONVERTED');
    const handler = new CreateCallLogHandler(repo);
    await handler.execute(
      new CreateCallLogCommand({ leadId: 'l1', disposition: 'CONNECTED' }, 'a'),
    );
    expect(sideEffectOf(repo)).toBeNull();
  });
});
