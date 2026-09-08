'use client';

import React, { useState } from 'react';
import { useMarket } from '../context/MarketContext';
import { formatUsd } from '../config/contracts';

interface PriceControllerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PriceController: React.FC<PriceControllerProps> = ({ isOpen, onClose }) => {
  const { btcPrice, setMarketPrice, isUpdatingPrice } = useMarket();

  const [customPrice, setCustomPrice] = useState<string>(btcPrice.toString());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQuickChange = async (targetPrice: number, label: string) => {
    setStatusMessage(`Updating oracle price to ${formatUsd(targetPrice)} (${label})...`);
    const success = await setMarketPrice(targetPrice);
    if (success) {
      setCustomPrice(targetPrice.toString());
      setStatusMessage(`✅ Mock oracle updated to ${formatUsd(targetPrice)}!`);
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage(`❌ Failed to update price`);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customPrice);
    if (isNaN(val) || val <= 0) {
      alert('Please enter a valid positive price');
      return;
    }
    setStatusMessage(`Updating oracle price to ${formatUsd(val)}...`);
    const success = await setMarketPrice(val);
    if (success) {
      setStatusMessage(`✅ Mock oracle updated to ${formatUsd(val)}!`);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-[2000] p-4 font-headline select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white border-2 border-black shadow-[8px_8px_0px_0px_#000000] p-6 text-black relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b-2 border-black mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black text-[#FFE600] border-2 border-black flex items-center justify-center text-xl shadow-[2px_2px_0px_0px_#000000] shrink-0">
              ⚡
            </div>
            <div>
              <h3 className="text-lg font-black text-black uppercase tracking-tight">
                Live Mock Oracle Controller
              </h3>
              <span className="font-mono text-[11px] text-gray-500 uppercase">
                Stress-Testing &amp; Liquidation Suite
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 bg-black text-[#FFE600] hover:bg-gray-900 border-2 border-black flex items-center justify-center font-bold text-sm shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        <p className="text-gray-700 font-mono text-xs leading-relaxed mb-4">
          Directly manipulate the on-chain BTC/USD oracle price on local Anvil fork. Test PnL swings, observe SwapVM 0x75 funding rate updates, or crash the price to trigger <strong>keeper liquidations</strong>!
        </p>

        {/* Current Price Banner */}
        <div className="bg-[#FAFAFA] border-2 border-black p-4 text-center mb-5 shadow-[2px_2px_0px_0px_#000000]">
          <span className="font-mono text-[10px] text-gray-500 uppercase font-bold tracking-wider block mb-1">
            Current Spot Oracle Price
          </span>
          <div className="font-mono text-3xl font-black text-black">
            {formatUsd(btcPrice)}
          </div>
        </div>

        {/* Quick Presets */}
        <div className="mb-5">
          <span className="block font-mono text-xs font-bold text-black uppercase mb-2">
            Quick Simulation Actions
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleQuickChange(66000, '+10% Pump')}
              disabled={isUpdatingPrice}
              className="bg-[#00F076] hover:bg-[#00d669] text-black border-2 border-black font-headline font-black text-xs uppercase p-3 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-1.5 transition-transform disabled:opacity-50"
            >
              <span>🚀</span>
              <span>+10% Pump ($66k)</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickChange(63000, '+5% Bump')}
              disabled={isUpdatingPrice}
              className="bg-[#00E5FF] hover:bg-[#00cbe2] text-black border-2 border-black font-headline font-black text-xs uppercase p-3 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-1.5 transition-transform disabled:opacity-50"
            >
              <span>📈</span>
              <span>+5% Bump ($63k)</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickChange(57000, '-5% Dip')}
              disabled={isUpdatingPrice}
              className="bg-[#FFE600] hover:bg-[#ffe100] text-black border-2 border-black font-headline font-black text-xs uppercase p-3 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-1.5 transition-transform disabled:opacity-50"
            >
              <span>📉</span>
              <span>-5% Dip ($57k)</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickChange(54000, '-10% Liquidation')}
              disabled={isUpdatingPrice}
              className="bg-[#FF3366] hover:bg-[#e62957] text-white border-2 border-black font-headline font-black text-xs uppercase p-3 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-1.5 transition-transform disabled:opacity-50"
            >
              <span>🩸</span>
              <span>-10% Liquidate ($54k)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleQuickChange(60000, 'Baseline Reset')}
            disabled={isUpdatingPrice}
            className="w-full mt-2.5 bg-white hover:bg-gray-100 text-black border-2 border-black font-headline font-black text-xs uppercase p-2.5 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-2 transition-transform disabled:opacity-50"
          >
            <span>🔄</span>
            <span>Reset to Baseline ($60,000)</span>
          </button>
        </div>

        {/* Custom Price Form */}
        <form onSubmit={handleCustomSubmit} className="pt-4 border-t-2 border-black">
          <label className="block font-mono text-xs font-bold text-black uppercase mb-1.5">
            Set Custom Target Price
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-gray-500">
                $
              </span>
              <input
                type="number"
                step="100"
                min="1000"
                max="500000"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="w-full bg-[#FAFAFA] border-2 border-black p-2.5 pl-8 font-mono text-sm font-bold text-black focus:outline-none focus:bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={isUpdatingPrice}
              className="bg-black text-[#FFE600] hover:bg-gray-900 border-2 border-black font-headline font-black text-xs uppercase px-5 py-2.5 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer transition-transform disabled:opacity-50"
            >
              {isUpdatingPrice ? 'Updating...' : 'Set Price'}
            </button>
          </div>
        </form>

        {/* Status Toast */}
        {statusMessage && (
          <div className="mt-4 p-3 border-2 border-black bg-[#00E5FF] text-black font-mono text-xs font-bold text-center shadow-[2px_2px_0px_0px_#000000]">
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
};
