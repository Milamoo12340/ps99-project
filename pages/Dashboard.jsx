import React, { useState, useEffect } from 'react';
import { PS99Finding } from '@/api/entities';

export default function Dashboard() {
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFindings();
  }, []);

  const loadFindings = async () => {
    try {
      const data = await PS99Finding.list({ limit: 100, sort: '-run_at' });
      setFindings(data);
    } catch (err) {
      console.error('Error loading findings:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>🐾 PS99 Intelligence Dashboard</h1>
      <p>Real-time leak & price tracking for Pet Simulator 99</p>

      {loading ? (
        <p>Loading findings...</p>
      ) : (
        <div>
          <p><strong>{findings.length} findings tracked</strong></p>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ccc' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Item</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Type</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Details</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{f.item_name}</td>
                  <td style={{ padding: '8px' }}>{f.change_type}</td>
                  <td style={{ padding: '8px', fontSize: '0.85em' }}>
                    {typeof f.details === 'object' ? JSON.stringify(f.details) : f.details}
                  </td>
                  <td style={{ padding: '8px', fontSize: '0.85em' }}>
                    {new Date(f.run_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
