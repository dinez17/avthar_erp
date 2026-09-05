/**
 * A product was created or edited here.
 *
 * Published rather than acted upon, so the products module stays ignorant of SixOrbit.
 * Anything that cares about a product changing — today the SixOrbit push, tomorrow a
 * search index or a price feed — subscribes without the products module learning its name.
 */
export class ProductChangedEvent {
  constructor(
    public readonly productId: string,
    public readonly actorId: string | null,
  ) {}
}
