import { config, networks, switchNetwork, type NetworkId } from "../config";

/** Network dropdown. A network that is not fully configured is listed but disabled. Switching reloads the app. */
export function NetworkSelect() {
  const change = (id: NetworkId) => {
    const n = networks.find((x) => x.id === id)!;
    if (n.id === config.id || !n.configured) return;
    if (n.real && !window.confirm("You are switching to MAINNET. Transactions will use REAL funds and this software is unaudited. Continue?")) return;
    switchNetwork(id);
  };
  return (
    <label className={`netselect ${config.real ? "real" : ""}`}>
      <span className="sr-only">Network</span>
      <select value={config.id} onChange={(e) => change(e.target.value as NetworkId)} aria-label="Network">
        {networks.map((n) => (
          <option key={n.id} value={n.id} disabled={!n.configured}>{n.label}{n.configured ? "" : " (not available)"}</option>
        ))}
      </select>
    </label>
  );
}
