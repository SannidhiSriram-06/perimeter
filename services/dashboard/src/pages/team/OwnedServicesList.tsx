import { ServiceItem } from '../../api/team';

interface OwnedServicesListProps {
  readonly services: readonly ServiceItem[];
}

export default function OwnedServicesList({ services }: Readonly<OwnedServicesListProps>) {
  return (
    <section className="card" aria-labelledby="owned-services-heading">
      <h2 id="owned-services-heading" className="eyebrow">
        Owned Services ({services.length})
      </h2>

      {services.length === 0 ? (
        <p className="muted">No services owned by your team.</p>
      ) : (
        <ul className="rows">
          {services.map((svc) => (
            <li key={svc.id} data-testid={`service-card-${svc.id}`} className="person">
              <svg aria-hidden="true" width="26" height="46" viewBox="0 0 26 46" style={{ flex: 'none' }}>
                <use href="#tower" width="120" height="320" transform="scale(0.145)" />
              </svg>
              <div>
                <p><strong>{svc.name}</strong></p>
                <p className="muted">{svc.tier} tier</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
