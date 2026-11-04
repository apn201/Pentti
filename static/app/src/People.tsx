// People: bus factor per person. A person who leaves soon and is the only name on machines gets a red row.
import { useEffect, useState } from 'react';
import { call, Chip, Empty, errorText } from './ui';

interface Row {
  personId: string;
  name: string;
  role: string;
  plant: string | null;
  left: boolean;
  leftDaysAgo: number | null;
  leavingInDays: number | null;
  leavingSoon: boolean;
  touched: number;
  recent: number;
  soleKnower: number;
  soleCritical: number;
  note: string | null;
}

export function People() {
  const [data, setData] = useState<{ rows: Row[]; ownerWindowMonths: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { call<{ rows: Row[]; ownerWindowMonths: number }>('people').then(setData).catch((e) => setError(errorText(e))); }, []);

  if (error) return <p className="err">{error}</p>;
  if (!data) return <Empty>Loading.</Empty>;
  return (
    <section>
      <p className="muted">
        Who touched which machines in pages and tickets. Only name means the one person still here who touched the machine in the last {data.ownerWindowMonths} months.
        The people are generated <Chip k="GEN" />.
      </p>
      <table>
        <thead>
          <tr>
            <th>Person</th>
            <th>Role</th>
            <th>Plant</th>
            <th className="r">Machines, ever <Chip k="GEN" /></th>
            <th className="r">Recently <Chip k="GEN" /></th>
            <th className="r">Only name on <Chip k="SCORE" /></th>
            <th className="r">Of them Critical <Chip k="SCORE" /></th>
            <th>Status <Chip k="GEN" /></th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.personId} className={r.leavingSoon && r.soleKnower > 0 ? 'hot' : ''} title={r.note ?? undefined}>
              <td><strong>{r.name}</strong></td>
              <td>{r.role}</td>
              <td>{r.plant ?? 'all'}</td>
              <td className="r">{r.touched}</td>
              <td className="r">{r.recent}</td>
              <td className="r"><strong>{r.soleKnower}</strong></td>
              <td className="r">{r.soleCritical}</td>
              <td>
                {r.left ? <span className="muted">Left {r.leftDaysAgo} days ago</span>
                  : r.leavingInDays !== null ? <span className={r.leavingSoon ? 'err' : ''}>Leaves in {r.leavingInDays} days</span>
                    : 'Stays'}
                {r.note && <div className="small muted">{r.note}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
