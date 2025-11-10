"use client";

import { useState, useEffect } from "react";

const VIEWER_STATE_KEY = "ros_view_viewer_state";

export interface ViewerState {
  cameraFollowEnabled: boolean;
  cameraAngleLockEnabled: boolean;
  tfVisible: boolean;
  latestScanHighlightEnabled: boolean;
  showModelInsteadOfArrows: boolean;
  statsCollapsed: boolean;
}

const defaultViewerState: ViewerState = {
  cameraFollowEnabled: false,
  cameraAngleLockEnabled: false,
  tfVisible: true,
  latestScanHighlightEnabled: true,
  showModelInsteadOfArrows: false,
  statsCollapsed: false,
};

// Helper to load viewer state from localStorage
function loadViewerStateFromStorage(): ViewerState {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(VIEWER_STATE_KEY);
    if (saved) {
      try {
        const savedState = JSON.parse(saved);
        // Merge with defaults to handle new fields
        return { ...defaultViewerState, ...savedState };
      } catch (err) {
        console.error("Failed to parse viewer state from localStorage:", err);
      }
    }
  }
  return defaultViewerState;
}

export function useViewerState() {
  const [state, setState] = useState<ViewerState>(defaultViewerState);
  const [loaded, setLoaded] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    const loadedState = loadViewerStateFromStorage();
    setState(loadedState);
    setLoaded(true);
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (loaded && typeof window !== "undefined") {
      localStorage.setItem(VIEWER_STATE_KEY, JSON.stringify(state));
    }
  }, [state, loaded]);

  // Individual setters for each state property
  const setCameraFollowEnabled = (value: boolean) => {
    setState((prev) => ({ ...prev, cameraFollowEnabled: value }));
  };

  const setTfVisible = (value: boolean) => {
    setState((prev) => ({ ...prev, tfVisible: value }));
  };

  const setLatestScanHighlightEnabled = (value: boolean) => {
    setState((prev) => ({ ...prev, latestScanHighlightEnabled: value }));
  };

  const setShowModelInsteadOfArrows = (value: boolean) => {
    setState((prev) => ({ ...prev, showModelInsteadOfArrows: value }));
  };

  const setStatsCollapsed = (value: boolean) => {
    setState((prev) => ({ ...prev, statsCollapsed: value }));
  };

  const setCameraAngleLockEnabled = (value: boolean) => {
    setState((prev) => ({ ...prev, cameraAngleLockEnabled: value }));
  };

  return {
    state,
    loaded,
    setCameraFollowEnabled,
    setCameraAngleLockEnabled,
    setTfVisible,
    setLatestScanHighlightEnabled,
    setShowModelInsteadOfArrows,
    setStatsCollapsed,
  };
}
