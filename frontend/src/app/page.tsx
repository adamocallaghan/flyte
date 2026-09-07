"use client";

import { useState } from "react";
import { Header, TabType, DemoRole } from "@/components/Header";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("trade");
  const [selectedRole, setSelectedRole] = useState<DemoRole>("trader");
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [walletAddress, setWalletAddress] = useState<string>(
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" // Default Trader (Hamburglar)
  );

  const handleRoleChange = (role: DemoRole) => {
    setSelectedRole(role);
    if (role === "trader") {
      setWalletAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    } else if (role === "lp") {
      setWalletAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
    } else if (role === "keeper") {
      setWalletAddress("0x90F79bf6EB2c4f870365E785982E1f101E93b906");
    }
  };

  const handleConnect = () => {
    setIsConnected(true);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedRole={selectedRole}
        setSelectedRole={handleRoleChange}
        walletAddress={walletAddress}
        isConnected={isConnected}
        onConnect={handleConnect}
      />

      <main style={{ flex: 1, padding: "0 24px 32px 24px", maxWidth: "1600px", width: "100%", margin: "0 auto" }}>
        <div className="glass-panel" style={{ padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(0, 210, 255, 0.1)",
            border: "1px solid rgba(0, 210, 255, 0.25)",
            padding: "4px 14px",
            borderRadius: "20px",
            fontSize: "0.8rem",
            color: "var(--accent-cyan)",
            fontWeight: 600
          }}>
            <span>⚡ Phase 7 UI Shell Ready</span>
          </div>

          <h2 style={{ fontSize: "1.85rem", fontWeight: "800", color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            {activeTab === "trade" && "📈 Perpetual Trading Terminal"}
            {activeTab === "lp" && "💧 Market Maker Liquidity & Quotes"}
            {activeTab === "keeper" && "🛡️ Funding Settlement & Liquidation Console"}
            {activeTab === "coverage" && "🌐 1inch Aqua Shared Liquidity Coverage"}
          </h2>

          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", maxWidth: "620px", lineHeight: "1.6" }}>
            {activeTab === "trade" && "Open long or short perpetual futures with JIT counter-margin sourced directly from LP wallets holding Aave v3 aUSDC via 1inch Aqua."}
            {activeTab === "lp" && "Ship reusable quotes to 1inch Aqua without locking capital in DEX vaults. Your collateral remains in your wallet earning Aave lending yield until fill."}
            {activeTab === "keeper" && "Trigger discrete OI skew funding settlements every 8 hours and earn 1% keeper rewards by liquidating underwater positions."}
            {activeTab === "coverage" && "Monitor real-time capital efficiency and shared liquidity metrics across 1inch Aqua apps."}
          </p>

          <div style={{ display: "flex", gap: "12px", marginTop: "8px", flexWrap: "wrap", justifyContent: "center" }}>
            <span className="badge-cyan">Active Role: {selectedRole.toUpperCase()}</span>
            <span className="badge-teal">Network: Arbitrum One (42161)</span>
            <span className="badge-coral">Collateral: aUSDC (Aave v3)</span>
          </div>
        </div>
      </main>
    </div>
  );
}
