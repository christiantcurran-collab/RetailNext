import type { ReservationResult } from "@/app/page";

export default function ReservationConfirmation({
  reservation,
  apiUrl,
  onBack,
  onReset,
}: {
  reservation: ReservationResult;
  apiUrl: string;
  onBack: () => void;
  onReset: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto px-8 py-14">
      <button
        onClick={onBack}
        className="text-text-secondary text-[0.75rem] tracking-wide mb-8 hover:text-text-primary transition-colors"
      >
        &larr; Back to selections
      </button>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="border border-border rounded-sm bg-white p-6">
          <div className="text-[0.65rem] tracking-[0.15em] uppercase text-text-secondary mb-2">
            Reservation Confirmed
          </div>
          <h2
            className="text-3xl mb-3"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
          >
            Order {reservation.reservation_id}
          </h2>
          <p className="text-[0.85rem] text-text-secondary mb-6">
            Your outfit has been reserved for in-store pickup.
          </p>

          <div className="flex flex-col gap-4">
            {reservation.items.map((item) => (
              <div key={item.id} className="flex gap-4 border border-border rounded-sm p-4">
                <div className="w-20 h-24 bg-bg-secondary overflow-hidden rounded-sm flex-shrink-0">
                  <img
                    src={`${apiUrl}/api/image/${item.id}`}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="text-[0.85rem] font-semibold text-text-primary">
                      {item.name}
                    </div>
                    <div className="text-[0.78rem] font-semibold text-text-primary">
                      ${item.price}
                    </div>
                  </div>
                  <div className="text-[0.74rem] text-text-secondary mb-2">
                    Size {item.size} &middot; Aisle {item.aisle}
                  </div>
                  <div className="text-[0.74rem] italic text-text-secondary">
                    {item.reason}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="border border-border rounded-sm bg-bg-secondary p-6">
          <div className="text-[0.65rem] tracking-[0.15em] uppercase text-text-secondary mb-2">
            Pickup Store
          </div>
          <h3
            className="text-2xl mb-2"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
          >
            {reservation.store.name}
          </h3>
          <div className="text-[0.82rem] text-text-secondary leading-relaxed mb-5">
            {reservation.store.address}
          </div>

          <div className="text-[0.65rem] tracking-[0.15em] uppercase text-text-secondary mb-2">
            How To Get There
          </div>
          <div className="text-[0.82rem] text-text-secondary leading-relaxed mb-3">
            {reservation.route.summary}
          </div>
          <a
            href={reservation.route.map_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block bg-nav-bg text-white px-5 py-3 text-[0.68rem] font-semibold tracking-[0.12em] uppercase rounded-sm hover:bg-text-primary transition-colors"
          >
            Open Directions
          </a>

          <div className="mt-8 pt-5 border-t border-border">
            <div className="flex items-center justify-between text-[0.78rem] mb-2">
              <span className="text-text-secondary">Items reserved</span>
              <span className="font-semibold text-text-primary">{reservation.item_count}</span>
            </div>
            <div className="flex items-center justify-between text-[0.78rem]">
              <span className="text-text-secondary">Total value</span>
              <span className="font-semibold text-text-primary">${reservation.total_price}</span>
            </div>
          </div>

          <button
            onClick={onReset}
            className="mt-8 w-full bg-white text-nav-bg px-5 py-3 text-[0.68rem] font-semibold tracking-[0.12em] uppercase rounded-sm hover:bg-white/90 transition-colors"
          >
            Start New Look
          </button>
        </aside>
      </div>
    </div>
  );
}
