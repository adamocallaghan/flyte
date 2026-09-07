import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flyte | JIT Perp DEX on 1inch Aqua & SwapVM",
  description:
    "Single-maker RFQ Perpetual Futures DEX where market-maker liquidity is just-in-time sourced from LP wallets holding Aave v3 aTokens via 1inch Aqua and executed with SwapVM custom opcodes.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
