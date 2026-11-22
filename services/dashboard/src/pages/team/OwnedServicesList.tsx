import { ServiceItem } from '../../api/team';

interface OwnedServicesListProps {
  services: ServiceItem[];
}

export default function OwnedServicesList({ services }: OwnedServicesListProps) {
  return (
    <section style={{ marginBottom: '2rem' }} aria-labelledby="owned-services-heading">
      <h2 id="owned-services-heading" style={{ fontSize: '18px', color: '#1f2937', marginBottom: '12px' }}>
        Owned Services ({services.length})
      </h2>

      {services.length === 0 ? (
        <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No services owned by your team.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '12px',
          }}
        >
          {services.map((svc) => (
            <div
              key={svc.id}
              data-testid={`service-card-${svc.id}`}
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#111827', marginBottom: '6px' }}>
                {svc.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Tier:</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    background:
                      svc.tier === 'critical' ? '#fee2e2' : svc.tier === 'high' ? '#ffedd5' : '#f3f4f6',
                    color:
                      svc.tier === 'critical' ? '#991b1b' : svc.tier === 'high' ? '#9a3412' : '#374151',
                  }}
                >
                  {svc.tier}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
