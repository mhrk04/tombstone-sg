import { useEffect, useState, useCallback } from "react";
import { NET_KEYS, NETS, WATCHLIST, LIVE, PAYROLL, isSet, decodeChainMask, type NetKey } from "./config";
import { recordOf, payrollEscrow, STATUS_LABELS, type RegistryRecord } from "./registry";
import { DEMO_STEPS } from "./demo";

type Cell = { loading: boolean; error?: string; record: RegistryRecord | null };
type Grid = Record<string, Partial<Record<NetKey, Cell>>>;

const statusClass = (s: number) => ["none", "suspect", "tombstoned", "cleared"][s] ?? "none";

function Badge({ status }: { status: number }) {
  return <span className={`badge ${statusClass(status)}`}>{STATUS_LABELS[status] ?? "NONE"}</span>;
}

export default function App() {
  return LIVE ? <LiveView /> : <DemoView />;
}

function DemoView() {
  const [step, setStep] = useState(0);
  const s = DEMO_STEPS[step];
  return (
    <div className="app">
      <Header mode="demo" />
      <div className="demo-controls">
        <button onClick={() => setStep((i) => Math.max(0, i - 1))} disabled={step === 0}>← Prev</button>
        <span className="step-title">{s.title}</span>
        <button onClick={() => setStep((i) => Math.min(DEMO_STEPS.length - 1, i + 1))} disabled={step === DEMO_STEPS.length - 1}>Next →</button>
      </div>
      <p className="caption">{s.caption}</p>
      <table className="grid">
        <thead><tr><th>Wallet</th><th>Status</th><th>Chains</th><th>Note</th></tr></thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.address}>
              <td><strong>{r.label}</strong><br /><code>{r.address}</code></td>
              <td><span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span></td>
              <td><code>0x{r.chainMask.toString(16)}</code></td>
              <td>{r.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="escrow">Mdm Tan escrow: <strong>{s.escrow} mUSDC</strong></div>
      <Footer />
    </div>
  );
}

function LiveView() {
  const [grid, setGrid] = useState<Grid>({});
  const [escrow, setEscrow] = useState<{ escrowed: bigint; pending: string } | null>(null);
  const [lastErr, setLastErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next: Grid = {};
    await Promise.all(
      WATCHLIST.map(async (w) => {
        next[w.address] = {};
        await Promise.all(
          NET_KEYS.map(async (net) => {
            if (!isSet(NETS[net].registry)) return;
            next[w.address]![net] = { loading: true, record: null };
            try {
              const record = await recordOf(net, w.address);
              next[w.address]![net] = { loading: false, record };
            } catch (e) {
              next[w.address]![net] = { loading: false, record: null, error: String(e).slice(0, 80) };
            }
          }),
        );
      }),
    );
    setGrid({ ...next });
    if (PAYROLL && isSet(PAYROLL)) {
      try { setEscrow(await payrollEscrow(PAYROLL, 0n)); } catch (e) { setLastErr(String(e).slice(0, 120)); }
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 12_000);
    return () => clearInterval(id);
  }, [load]);

  const loaded = Object.keys(grid).length > 0;

  return (
    <div className="app">
      <Header mode="live" />
      {!loaded && <p className="caption">Loading registry state…</p>}
      {lastErr && <p className="error-banner">⚠ {lastErr}</p>}
      {loaded && WATCHLIST.length === 0 && <p className="caption">No wallets in VITE_WATCHLIST.</p>}
      {loaded && (
        <table className="grid">
          <thead>
            <tr>
              <th>Wallet</th>
              {NET_KEYS.filter((k) => isSet(NETS[k].registry)).map((k) => <th key={k}>{NETS[k].label}</th>)}
            </tr>
          </thead>
          <tbody>
            {WATCHLIST.map((w) => (
              <tr key={w.address}>
                <td><strong>{w.label}</strong><br /><code>{w.address}</code></td>
                {NET_KEYS.filter((k) => isSet(NETS[k].registry)).map((k) => {
                  const cell = grid[w.address]?.[k];
                  return (
                    <td key={k}>
                      {!cell || cell.loading ? <span className="skeleton" /> :
                        cell.error ? <span className="cell-err" title={cell.error}>err</span> :
                          cell.record ? (
                            <>
                              <Badge status={cell.record.status} />
                              {cell.record.chainMask > 0 && (
                                <div className="chains">{decodeChainMask(cell.record.chainMask).join(" ") || "—"}</div>
                              )}
                            </>
                          ) : <span className="badge none">NONE</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {escrow && (
        <div className="escrow">
          Mdm Tan escrow (id 0): <strong>{(Number(escrow.escrowed) / 1e6).toLocaleString()} mUSDC</strong>
          {isSet(escrow.pending) && <> · pending → <code>{escrow.pending}</code></>}
        </div>
      )}
      <Footer />
    </div>
  );
}

function Header({ mode }: { mode: "live" | "demo" }) {
  return (
    <header className="header">
      <h1>🪦 Tombstone SG</h1>
      <p className="sub">A "Restriction Order" for wallets · <span className={`mode ${mode}`}>{mode}</span></p>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      Read-only dashboard. Single-node CRE simulation via MockForwarders. Not endorsed by MAS/SPF/banks.
    </footer>
  );
}
