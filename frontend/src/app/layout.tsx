import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "@/context/Web3Context";
import { MarketProvider } from "@/context/MarketContext";

export const metadata: Metadata = {
  title: "Flyte | JIT-Sourced RFQ Perp Futures on 1inch Aqua",
  description: "Next-generation decentralized perpetual futures powered by 1inch Aqua JIT-liquidity and SwapVM custom opcodes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>
          <MarketProvider>
            {children}
          </MarketProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
