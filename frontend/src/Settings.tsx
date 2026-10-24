import { useEffect } from 'react';
import { autoReconnectAvailable, type KnownDevice } from './ble';
import { BluetoothIcon, XIcon } from './icons';
import { useApp } from './store';

interface Props {
  onClose:   () => void;
  onConnect: (id: string) => void;
}

function fmtAge(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60)         return `${s}s ago`;
  if (s < 3600)       return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)      return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Settings({ onClose, onConnect }: Props) {
  const known     = useApp((s) => s.knownDevices);
  const conn      = useApp((s) => s.conn);
  const forget    = useApp((s) => s.forget);
  const forgetAll = useApp((s) => s.forgetAll);
  const silent    = autoReconnectAvailable();

  const handleForget = (d: KnownDevice) => {
    if (!confirm(`Forget "${d.name}" and delete its saved widgets?`)) return;
    forget(d.id, d.name);
  };

  const handleForgetAll = () => {
    if (!confirm('Forget every paired device and delete all saved widget layouts?')) return;
    forgetAll();
  };

  // Escape closes the sheet, like any other dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"
           onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="settings-title">Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close"><XIcon /></button>
        </header>

        <section className="modal-body">
          <h3>Paired devices</h3>
          {known.length === 0 && (
            <p className="muted small">No paired devices yet. Connect one from the start screen.</p>
          )}
          {known.length > 0 && (
            <ul className="device-list">
              {known.map((d) => {
                const isCurrent = conn?.name === d.name;
                return (
                  <li key={d.id} className="device-row">
                    <span className={`device-avatar ${isCurrent ? 'live' : ''}`}><BluetoothIcon /></span>
                    <div className="device-info">
                      <div className="device-name">{d.name}</div>
                      <div className="muted small">
                        {isCurrent ? <span className="badge">Connected</span> : `Last seen ${fmtAge(d.lastSeen)}`}
                      </div>
                    </div>
                    <div className="device-actions">
                      {silent && !isCurrent && (
                        <button className="tiny" onClick={() => onConnect(d.id)}>Connect</button>
                      )}
                      <button
                        className="tiny danger-text"
                        onClick={() => handleForget(d)}
                        disabled={isCurrent}
                        title={isCurrent ? 'Disconnect first' : 'Forget device'}
                      >
                        Forget
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {known.length > 1 && (
            <div className="modal-footer">
              <button className="tiny danger-text" onClick={handleForgetAll}>
                Forget all devices
              </button>
            </div>
          )}

          {!silent && (
            <p className="notice">
              For one-tap reconnect to a saved device, enable{' '}
              <code>chrome://flags/#enable-experimental-web-platform-features</code>{' '}
              and restart your browser.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
