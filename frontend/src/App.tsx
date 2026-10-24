import { useEffect, useRef, useState } from 'react';
import {
  autoReconnectAvailable,
  connect,
  ESP_NAME_PREFIX,
  tryReconnect,
  type Connection,
} from './ble';
import { Board } from './Board';
import { BluetoothIcon, CheckIcon, GearIcon, PencilIcon, PowerIcon } from './icons';
import { InstallButton } from './InstallButton';
import { Settings } from './Settings';
import { useApp } from './store';

const APP_TITLE = 'BleDeck';
const LOGO = `${import.meta.env.BASE_URL}icon.svg`;

function Busy({ text }: { text: string }) {
  return (
    <main className="center">
      <div className="spinner" aria-hidden="true" />
      <p className="muted">{text}</p>
    </main>
  );
}

async function acquireWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    return await (navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> };
    }).wakeLock?.request('screen') ?? null;
  } catch { return null; }
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

function notify(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body, tag: 'esp32-ble', icon: 'icon.svg', silent: true });
}

export function App() {
  const conn         = useApp((s) => s.conn);
  const probing      = useApp((s) => s.probing);
  const error        = useApp((s) => s.error);
  const knownDevices = useApp((s) => s.knownDevices);
  const editing      = useApp((s) => s.editing);
  const setConn      = useApp((s) => s.setConn);
  const setProbing   = useApp((s) => s.setProbing);
  const setError     = useApp((s) => s.setError);
  const refreshKnown = useApp((s) => s.refreshKnown);
  const clearStates  = useApp((s) => s.clearStates);
  const clearCatalog = useApp((s) => s.clearCatalog);
  const applyLine    = useApp((s) => s.applyLine);
  const toggleEditing = useApp((s) => s.toggleEditing);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const lastDevice = knownDevices[0] ?? null;

  const handleClosed = () => {
    setConn(null);
    clearStates();
    clearCatalog();
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    notify(APP_TITLE, 'Disconnected');
  };

  const adoptConnection = async (c: Connection) => {
    c.subscribe((line) => { if (document.hidden) notify(APP_TITLE, line); });
    c.subscribe((line) => applyLine(line));
    wakeLockRef.current = await acquireWakeLock();
    refreshKnown();
    setConn(c);
  };

  // MARK: silent reconnect on page load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await tryReconnect(handleClosed);
      if (cancelled) { c?.disconnect(); return; }
      if (c) { await adoptConnection(c); notify(APP_TITLE, `Reconnected to ${c.name}`); }
      setProbing(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState === 'visible' && conn && !wakeLockRef.current) {
        wakeLockRef.current = await acquireWakeLock();
      }
    };
    const onPageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) conn?.disconnect();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [conn]);

  // Closing the device picker is a choice, not an error; other failures
  // get a plain-language line instead of the raw DOMException text.
  const showError = (e: unknown) => {
    const err = e as DOMException;
    if (err.name === 'NotFoundError' && /cancel/i.test(err.message)) return;
    if (err.name === 'NetworkError') setError('Could not reach the device. Is it powered on and in range?');
    else if (err.name === 'SecurityError') setError('Bluetooth is blocked for this site. Allow it in the browser settings.');
    else setError(err.message || 'Connection failed.');
  };

  const handleScan = async () => {
    setError(null);
    await ensureNotificationPermission();
    try {
      const c = await connect(handleClosed);
      await adoptConnection(c);
      notify(APP_TITLE, `Connected to ${c.name}`);
    } catch (e) {
      showError(e);
    }
  };

  // MARK: reconnect / connect handler (button click)
  const handleReconnect = async (id?: string) => {
    setError(null);
    await ensureNotificationPermission();
    try {
      // Try silent reconnect first; fall back to chooser when blocked.
      const silent = await tryReconnect(handleClosed, id);
      const c = silent ?? await connect(handleClosed);
      await adoptConnection(c);
      notify(APP_TITLE, `Connected to ${c.name}`);
    } catch (e) {
      showError(e);
    }
  };

  const handleConnectFromSettings = (id: string) => {
    setShowSettings(false);
    void handleReconnect(id);
  };

  const handleDisconnect = () => {
    setDisconnecting(true);
    conn?.disconnect();
    setConn(null);
    clearStates();
    clearCatalog();
    window.setTimeout(() => setDisconnecting(false), 3000);
  };

  if (disconnecting) return <Busy text="Disconnecting…" />;
  if (probing)       return <Busy text="Reconnecting…" />;

  if (!conn) {
    return (
      <>
        <button
          className="icon-btn settings-fab"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
        >
          <GearIcon />
        </button>
        <main className="center">
          <div className="welcome">
            <img className="logo" src={LOGO} alt="" width={76} height={76} />
            <h1>BleDeck</h1>
            <p>Control your ESP32 over Bluetooth.<br />No app store, no cloud, no Wi-Fi.</p>
            <div className="welcome-actions">
              {lastDevice && (
                <button
                  className="primary"
                  onClick={() => handleReconnect(lastDevice.id)}
                  disabled={!navigator.bluetooth}
                >
                  <BluetoothIcon /> Reconnect to {lastDevice.name}
                </button>
              )}
              <button
                className={lastDevice ? '' : 'primary'}
                onClick={handleScan}
                disabled={!navigator.bluetooth}
              >
                {!lastDevice && <BluetoothIcon />} Scan for devices
              </button>
              {knownDevices.length > 0 && (
                <button className="ghost" onClick={() => setShowSettings(true)}>
                  Manage paired devices ({knownDevices.length})
                </button>
              )}
            </div>
            <p className="hint">
              Pick your board from the browser's device list. Boards named{' '}
              <strong>{ESP_NAME_PREFIX}</strong> show their controls automatically.
            </p>
            {error && <p className="notice notice-error" role="alert">{error}</p>}
            {!navigator.bluetooth && (
              <p className="notice">
                This browser has no Web Bluetooth. Use Chrome, Edge or Opera on
                desktop or Android.
              </p>
            )}
            {navigator.bluetooth && lastDevice && !autoReconnectAvailable() && (
              <p className="notice">
                For one-tap reconnect, enable{' '}
                <code>chrome://flags/#enable-experimental-web-platform-features</code>{' '}
                and restart the browser.
              </p>
            )}
            <InstallButton />
          </div>
        </main>
        {showSettings && (
          <Settings
            onClose={() => setShowSettings(false)}
            onConnect={handleConnectFromSettings}
          />
        )}
      </>
    );
  }

  return (
    <>
      <main>
        <header className="bar top">
          <span className="bar-title">
            <span className="live-dot" aria-hidden="true" />
            <span className="bar-name">{conn.name}</span>
          </span>
          <div className="bar-actions">
            {conn.hasCommandChar && (
              <button
                className={`icon-btn ${editing ? 'active' : ''}`}
                onClick={toggleEditing}
                aria-label={editing ? 'Done renaming' : 'Rename widgets'}
                title={editing ? 'Done' : 'Rename widgets'}
              >
                {editing ? <CheckIcon /> : <PencilIcon />}
              </button>
            )}
            <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings" title="Settings">
              <GearIcon />
            </button>
            <button className="icon-btn danger-ghost" onClick={handleDisconnect} aria-label="Disconnect" title="Disconnect">
              <PowerIcon />
            </button>
          </div>
        </header>

        {conn.hasCommandChar ? (
          <Board deviceName={conn.name} send={conn.send} />
        ) : (
          <section className="center" style={{ flex: 1 }}>
            <p className="muted">
              Connected, but this device doesn't expose a writable
              <br />
              <strong>BleDeck</strong> command characteristic.
            </p>
          </section>
        )}
      </main>
      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onConnect={handleConnectFromSettings}
        />
      )}
    </>
  );
}
