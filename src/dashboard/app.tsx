import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

interface Stats {
  totalRequests: number;
  cachedRequests: number;
  cacheEntries: number;
  sessions: number;
}

interface LogEntry {
  id: number;
  timestamp: number;
  sourceFormat: string;
  targetModel: string;
  originalPrompt?: string;
  rewrittenPrompt?: string;
  profileUsed?: string;
  cached: boolean;
  latencyMs?: number;
  sessionId?: string;
  responsePreview?: string;
}

const API_BASE = window.location.port === '5173'
  ? 'http://localhost:4000'
  : '';

function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [selected, setSelected] = useState<LogEntry | null>(null);

  const fetchData = async () => {
    try {
      const [s, h] = await Promise.all([
        fetch(`${API_BASE}/api/stats`).then(r => r.json()),
        fetch(`${API_BASE}/api/history`).then(r => r.json()),
      ]);
      setStats(s);
      setHistory(h);
    } catch {
      // Server may not be running
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const clearHistory = async () => {
    await fetch(`${API_BASE}/api/history`, { method: 'DELETE' });
    fetchData();
  };

  const clearCache = async () => {
    await fetch(`${API_BASE}/api/cache`, { method: 'DELETE' });
    fetchData();
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>&#9881; promptc</span>
        <span style={{ color: '#666', fontSize: 14 }}>v0.1.0</span>
      </header>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          <StatCard label="Total Requests" value={stats.totalRequests} />
          <StatCard label="Cache Hits" value={stats.cachedRequests} />
          <StatCard label="Cache Entries" value={stats.cacheEntries} />
          <StatCard label="Sessions" value={stats.sessions} />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button onClick={clearHistory} style={btnStyle}>Clear History</button>
        <button onClick={clearCache} style={btnStyle}>Clear Cache</button>
        <button onClick={fetchData} style={btnStyle}>Refresh</button>
      </div>

      {/* History table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333', textAlign: 'left' }}>
              <th style={thStyle}>Time</th>
              <th style={thStyle}>Format</th>
              <th style={thStyle}>Target</th>
              <th style={thStyle}>Profile</th>
              <th style={thStyle}>Cached</th>
              <th style={thStyle}>Latency</th>
            </tr>
          </thead>
          <tbody>
            {history.map(entry => (
              <tr
                key={entry.id}
                onClick={() => setSelected(entry)}
                style={{ borderBottom: '1px solid #1a1a1a', cursor: 'pointer' }}
              >
                <td style={tdStyle}>{new Date((entry.timestamp ?? 0) * 1000).toLocaleTimeString()}</td>
                <td style={tdStyle}><Badge text={entry.sourceFormat} /></td>
                <td style={tdStyle}>{entry.targetModel}</td>
                <td style={tdStyle}>{entry.profileUsed ?? '-'}</td>
                <td style={tdStyle}>{entry.cached ? '\u2713' : '-'}</td>
                <td style={tdStyle}>{entry.latencyMs ? `${entry.latencyMs}ms` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{ marginTop: 32, padding: 20, background: '#111', borderRadius: 8, border: '1px solid #333' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ color: '#fff' }}>Request #{selected.id}</h3>
            <button onClick={() => setSelected(null)} style={btnStyle}>&times; Close</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <h4 style={{ color: '#888', marginBottom: 8 }}>Original Prompt</h4>
              <pre style={preStyle}>{selected.originalPrompt ?? '-'}</pre>
            </div>
            <div>
              <h4 style={{ color: '#888', marginBottom: 8 }}>Rewritten Prompt</h4>
              <pre style={preStyle}>{selected.rewrittenPrompt ?? '-'}</pre>
            </div>
          </div>
          {selected.responsePreview && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ color: '#888', marginBottom: 8 }}>Response Preview</h4>
              <pre style={preStyle}>{selected.responsePreview}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: '#111', padding: 20, borderRadius: 8, border: '1px solid #222' }}>
      <div style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>{value}</div>
      <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Badge({ text }: { text: string }) {
  const color = text === 'anthropic' ? '#d97706' : '#3b82f6';
  return (
    <span style={{ background: color + '22', color, padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
      {text}
    </span>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#222', color: '#ccc', border: '1px solid #333', padding: '6px 14px',
  borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const thStyle: React.CSSProperties = { padding: '8px 12px', color: '#666', fontSize: 12, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13 };
const preStyle: React.CSSProperties = {
  background: '#0a0a0a', padding: 12, borderRadius: 6, fontSize: 12,
  whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflow: 'auto',
  border: '1px solid #222',
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
