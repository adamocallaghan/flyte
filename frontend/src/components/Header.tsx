"use client";

import React from "react";

export type TabType = "trade" | "lp" | "keeper" | "coverage";
export type DemoRole = "injected" | "trader" | "lp" | "keeper";

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  selectedRole: DemoRole;
  setSelectedRole: (role: DemoRole) => void;
  walletAddress?: string;
  isConnected: boolean;
  onConnect: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  selectedRole,
  setSelectedRole,
  walletAddress,
  isConnected,
  onConnect,
}) => {
  const formatAddr = (addr: string) => {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className="glass-panel" style={{ margin: "16px 24px", padding: "12px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        
        {/* Logo & Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            width: "38px",
            height: "38px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #00d2ff 0%, #9d4edd 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "900",
            fontSize: "20px",
            color: "#fff",
            boxShadow: "0 0 16px rgba(0, 210, 255, 0.4)"
          }}>
            ⚡
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.25rem", fontWeight: "800", letterSpacing: "1px", background: "linear-gradient(90deg, #ffffff, #00d2ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                FLYTE
              </span>
              <span className="badge-cyan">v1.0</span>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0 }}>
              JIT Perp DEX on 1inch Aqua & SwapVM
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: "flex", gap: "6px", background: "rgba(0, 0, 0, 0.35)", padding: "4px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
          <button
            onClick={() => setActiveTab("trade")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: activeTab === "trade" ? "var(--accent-cyan)" : "transparent",
              color: activeTab === "trade" ? "#000" : "var(--text-secondary)",
            }}
          >
            📈 Trade
          </button>
          <button
            onClick={() => setActiveTab("lp")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: activeTab === "lp" ? "var(--accent-teal)" : "transparent",
              color: activeTab === "lp" ? "#000" : "var(--text-secondary)",
            }}
          >
            💧 LP & Quotes
          </button>
          <button
            onClick={() => setActiveTab("keeper")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: activeTab === "keeper" ? "var(--accent-coral)" : "transparent",
              color: activeTab === "keeper" ? "#fff" : "var(--text-secondary)",
            }}
          >
            🛡️ Keeper Console
          </button>
          <button
            onClick={() => setActiveTab("coverage")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: activeTab === "coverage" ? "var(--accent-purple)" : "transparent",
              color: activeTab === "coverage" ? "#fff" : "var(--text-secondary)",
            }}
          >
            🌐 Coverage
          </button>
        </nav>

        {/* Right Section: Network & Role & Wallet */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          
          {/* Network Pill */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid var(--border-subtle)",
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "0.78rem",
            color: "var(--text-secondary)"
          }}>
            <span className="pulse-dot" />
            <span>Arbitrum One</span>
          </div>

          {/* Role Switcher (for demo & testing) */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Demo Role:</span>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as DemoRole)}
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                padding: "6px 10px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="injected">Browser Wallet (MetaMask)</option>
              <option value="trader">Trader (Hamburglar)</option>
              <option value="lp">LP Maker (Grimace)</option>
              <option value="keeper">Keeper (Ronald)</option>
            </select>
          </div>

          {/* Connect / Active Wallet Button */}
          {isConnected && walletAddress ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(0, 210, 255, 0.1)",
              border: "1px solid rgba(0, 210, 255, 0.3)",
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontFamily: "var(--font-mono)",
              color: "var(--accent-cyan)"
            }}>
              <span>🟢</span>
              <span>{formatAddr(walletAddress)}</span>
            </div>
          ) : (
            <button onClick={onConnect} className="btn btn-cyan" style={{ padding: "8px 16px", fontSize: "0.82rem" }}>
              Connect Wallet
            </button>
          )}

        </div>

      </div>
    </header>
  );
};
