import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SixOrbitCustomerPushService } from '@tiles-erp/sixorbit';

export class PushCustomerToSixOrbitCommand { constructor(public readonly customerId: string) {} }

@CommandHandler(PushCustomerToSixOrbitCommand)
export class PushCustomerToSixOrbitHandler implements ICommandHandler<PushCustomerToSixOrbitCommand> {
  constructor(private readonly pusher: SixOrbitCustomerPushService) {}
  execute(command: PushCustomerToSixOrbitCommand) { return this.pusher.push(command.customerId); }
}
