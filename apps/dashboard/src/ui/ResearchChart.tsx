import { useId } from 'react';
export function ResearchChart({
  title,
  unit,
  points,
  kind = 'line',
  probability = false,
  reference,
}: {
  title: string;
  unit: string;
  points: { label: string; value: number; time?: number }[];
  kind?: 'line' | 'bar';
  probability?: boolean;
  reference?: number | undefined;
}) {
  const id = useId();
  const integer = unit === 'stories' || unit === 'count';
  const peak = Math.max(1, ...points.map((p) => p.value), reference ?? 0);
  const max = probability ? 100 : integer ? Math.ceil(peak) : peak * 1.1;
  const min = probability ? 0 : Math.min(0, ...points.map((p) => p.value));
  const y = (v: number) => 155 - ((v - min) / (max - min)) * 125;
  const times = points.map((p, i) => p.time ?? i),
    lo = Math.min(...times),
    hi = Math.max(...times);
  const x = (i: number) => 45 + (hi === lo ? 0.5 : (times[i]! - lo) / (hi - lo)) * 350;
  return (
    <figure className="research-chart" aria-labelledby={id}>
      <figcaption id={id}>
        {title} <small>({unit})</small>
      </figcaption>
      {points.length ? (
        <>
          <svg
            viewBox="0 0 430 200"
            role="img"
            aria-label={`${title}; ${points.length} observations. Exact values in chart data.`}
          >
            {[...new Set([min, integer ? Math.round((max + min) / 2) : (max + min) / 2, max])].map(
              (v, i) => (
                <g key={i}>
                  <line x1="45" x2="405" y1={y(v)} y2={y(v)} className="research-grid" />
                  <text x="39" y={y(v) + 4} textAnchor="end">
                    {unit === 'USD'
                      ? new Intl.NumberFormat('en-US', {
                          notation: 'compact',
                          maximumFractionDigits: 1,
                        }).format(v)
                      : v.toFixed(probability || integer ? 0 : 1)}
                  </text>
                </g>
              ),
            )}
            {reference !== undefined && (
              <line
                x1="45"
                x2="405"
                y1={y(reference)}
                y2={y(reference)}
                className="research-reference"
              />
            )}
            {kind === 'line' && points.length > 1 && (
              <polyline
                fill="none"
                className="research-line"
                points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
              />
            )}
            {points.map((p, i) =>
              kind === 'bar' ? (
                <rect
                  key={i}
                  x={x(i) - Math.min(12, 145 / points.length)}
                  y={Math.min(y(p.value), y(0))}
                  width={Math.min(24, 290 / points.length)}
                  height={Math.max(1, Math.abs(y(p.value) - y(0)))}
                  className="research-bar"
                >
                  <title>
                    {p.label}: {p.value.toFixed(2)} {unit}
                  </title>
                </rect>
              ) : (
                <circle key={i} cx={x(i)} cy={y(p.value)} r="3" className="research-dot">
                  <title>
                    {p.label}: {p.value.toFixed(2)} {unit}
                  </title>
                </circle>
              ),
            )}
            <text x="45" y="181">
              {points[0]!.label}
            </text>
            <text x="405" y="197" textAnchor="end">
              {points.at(-1)!.label}
            </text>
          </svg>
          <details>
            <summary>Chart data</summary>
            <div className="research-table">
              <table>
                <thead>
                  <tr>
                    <th>Observation</th>
                    <th>{unit}</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={i}>
                      <td>{p.label}</td>
                      <td>{p.value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="empty-activity">No verified observations available.</p>
      )}
    </figure>
  );
}
