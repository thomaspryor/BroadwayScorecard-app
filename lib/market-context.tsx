/**
 * Shared market selection (NYC / London) — persisted to AsyncStorage.
 *
 * Previously Home hardcoded 'nyc' and Settings' picker wrote to local state
 * that nothing read, so West End users were stuck on a Broadway-only Home
 * forever. This context is the single source of truth Home, Browse, and
 * Settings all read from and write to.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Market } from '@/components/MarketPicker';

const MARKET_KEY = '@bsc:market';

interface MarketContextValue {
  market: Market;
  setMarket: (m: Market) => void;
}

const MarketContext = createContext<MarketContextValue>({
  market: 'nyc',
  setMarket: () => {},
});

export function MarketProvider({ children }: { children: ReactNode }) {
  const [market, setMarketState] = useState<Market>('nyc');

  useEffect(() => {
    AsyncStorage.getItem(MARKET_KEY).then(saved => {
      if (saved === 'nyc' || saved === 'london') setMarketState(saved);
    }).catch(() => {});
  }, []);

  const setMarket = useCallback((m: Market) => {
    setMarketState(m);
    AsyncStorage.setItem(MARKET_KEY, m).catch(() => {});
  }, []);

  return (
    <MarketContext.Provider value={{ market, setMarket }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket(): MarketContextValue {
  return useContext(MarketContext);
}
