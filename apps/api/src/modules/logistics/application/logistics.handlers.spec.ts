import { ConflictError, ValidationError } from '@tiles-erp/shared';
import {
  CreateDriverCommand,
  CreateDriverHandler,
  CreateVehicleCommand,
  CreateVehicleHandler,
} from './logistics.handlers';
import type { DriverRepository, VehicleRepository } from '../domain/logistics.repositories';
import type { DriverItem, VehicleItem } from '@tiles-erp/shared-types';

const vehicleRepo = (): jest.Mocked<VehicleRepository> => ({
  list: jest.fn(),
  numberExists: jest.fn().mockResolvedValue(false),
  create: jest.fn().mockResolvedValue({ id: 'v1' } as VehicleItem),
  update: jest.fn(),
  softDelete: jest.fn(),
});

const driverRepo = (): jest.Mocked<DriverRepository> => ({
  list: jest.fn(),
  nextCode: jest.fn().mockResolvedValue('DRV-00001'),
  codeExists: jest.fn().mockResolvedValue(false),
  create: jest.fn().mockResolvedValue({ id: 'd1' } as DriverItem),
  update: jest.fn(),
  softDelete: jest.fn(),
});

describe('CreateVehicleHandler', () => {
  it('normalises the registration number', async () => {
    const repo = vehicleRepo();
    const handler = new CreateVehicleHandler(repo);
    await handler.execute(new CreateVehicleCommand({ number: ' tn-01 ab 1234 ' }, 'actor'));
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ number: 'TN01AB1234' }),
    );
  });

  it('requires a transporter for hired vehicles', async () => {
    const repo = vehicleRepo();
    const handler = new CreateVehicleHandler(repo);
    await expect(
      handler.execute(new CreateVehicleCommand({ number: 'TN01AB1234', ownership: 'HIRED' }, 'a')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a duplicate registration', async () => {
    const repo = vehicleRepo();
    repo.numberExists.mockResolvedValue(true);
    const handler = new CreateVehicleHandler(repo);
    await expect(
      handler.execute(new CreateVehicleCommand({ number: 'TN01AB1234' }, 'actor')),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('CreateDriverHandler', () => {
  it('assigns the next code and keeps the phone', async () => {
    const repo = driverRepo();
    const handler = new CreateDriverHandler(repo);
    await handler.execute(
      new CreateDriverCommand({ name: ' Ramesh ', phone: '9876543210' }, 'actor'),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DRV-00001', name: 'Ramesh', phone: '9876543210' }),
    );
  });

  it('requires a phone number', async () => {
    const repo = driverRepo();
    const handler = new CreateDriverHandler(repo);
    await expect(
      handler.execute(new CreateDriverCommand({ name: 'No Phone', phone: '  ' }, 'actor')),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
