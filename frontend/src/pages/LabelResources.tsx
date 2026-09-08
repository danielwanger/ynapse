type ResourceType = 'wikipedia' | 'organization' | 'tool' | 'general';

interface LabelResource {
  url: string;
  title: string;
  description?: string;
  resource_type: ResourceType;
}

const TYPE_LABELS: Record<ResourceType, string> = {
  wikipedia: 'Hintergrund',
  organization: 'Organisationen',
  tool: 'Live-Daten & Tools',
  general: 'Weitere Links',
};

// Feste Reihenfolge der Gruppen auf der Hub-Page, unabhaengig davon,
// in welcher Reihenfolge die Typen in den Daten vorkommen.
const TYPE_ORDER: ResourceType[] = ['wikipedia', 'tool', 'organization', 'general'];

export function LabelResources({ resources }: { resources: LabelResource[] }) {
  if (resources.length === 0) return null;

  const grouped = resources.reduce((acc, r) => {
    (acc[r.resource_type] ??= []).push(r);
    return acc;
  }, {} as Record<ResourceType, LabelResource[]>);

  return (
    <div className="label-resources">
      {TYPE_ORDER.filter((type) => grouped[type]?.length).map((type) => (
        <div key={type} className="label-resources__group">
          <h4>{TYPE_LABELS[type]}</h4>
          <ul>
            {grouped[type].map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.title}
                </a>
                {r.description && <p>{r.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}