/**
 * Data provider for Broadway Scorecard.
 *
 * Loads show data with a 3-tier fallback strategy:
 * 1. AsyncStorage cache (instant, may be stale)
 * 2. CDN fetch (fresh data)
 * 3. Bundled seed data (first launch / no network)
 *
 * Auto-refreshes when app returns to foreground if cache is stale (>1h).
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { MobileDataResponse, Show, mapMobileShow, EXPECTED_SCHEMA_VERSION } from './types';
import { fetchMobileShows } from './api';
import { getCachedData, setCachedData, isCacheStale, getLastFetched } from './cache';

interface DataState {
  shows: Show[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isStale: boolean;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataState>({
  shows: [],
  isLoading: true,
  error: null,
  lastUpdated: null,
  isStale: false,
  refresh: async () => {},
});

export function useShows() {
  return useContext(DataContext);
}

function parseShows(json: string): Show[] {
  const data: MobileDataResponse = JSON.parse(json);
  if (data._v !== EXPECTED_SCHEMA_VERSION) {
    console.warn(`Schema version mismatch: expected ${EXPECTED_SCHEMA_VERSION}, got ${data._v}`);
  }
  return (data.shows || []).map(mapMobileShow);
}

function loadSeedData(): Show[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const seedData = require('@/assets/seed-data.json') as MobileDataResponse;
    return (seedData.shows || []).map(mapMobileShow);
  } catch {
    return [];
  }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [shows, setShows] = useState<Show[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const hasData = useRef(false);
  const appState = useRef(AppState.currentState);

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      // Try cache first for instant display
      if (!forceRefresh) {
        const cached = await getCachedData();
        if (cached) {
          const parsed = parseShows(cached);
          setShows(parsed);
          hasData.current = true;
          setIsLoading(false);
          const stale = await isCacheStale();
          setIsStale(stale);
          setLastUpdated(await getLastFetched());
          // If cache is fresh, we're done
          if (!stale) return;
          // Otherwise, continue to fetch fresh data in the background
        }
      }

      // Fetch fresh data from CDN
      const json = await fetchMobileShows();
      const parsed = parseShows(json);
      setShows(parsed);
      hasData.current = true;
      await setCachedData(json);
      setLastUpdated(new Date());
      setIsStale(false);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load shows';

      if (hasData.current) {
        // Already have data from cache — just mark stale
        setIsStale(true);
      } else {
        // No cache available — try seed data
        const seed = loadSeedData();
        if (seed.length > 0) {
          setShows(seed);
          hasData.current = true;
          setIsStale(true);
        } else {
          setError(message);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh on app foreground if stale
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        const stale = await isCacheStale();
        if (stale) {
          loadData(true);
        }
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [loadData]);

  return (
    <DataContext.Provider
      value={{
        shows,
        isLoading,
        error,
        lastUpdated,
        isStale,
        refresh: () => loadData(true),
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
