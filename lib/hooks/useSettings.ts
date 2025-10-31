"use client";

import { useState, useEffect } from "react";
import { appConfig, type AppConfig } from "../config/appConfig";

const SETTINGS_KEY = "ros_view_settings";
const SETTINGS_CHANGE_EVENT = "ros_settings_changed";

// Helper to load settings from localStorage
function loadSettingsFromStorage(): AppConfig {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (err) {
        console.error("Failed to parse settings from localStorage:", err);
      }
    }
  }
  return appConfig;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppConfig>(appConfig);
  const [loaded, setLoaded] = useState(false);

  // Load settings from localStorage on mount and listen for changes
  useEffect(() => {
    // Initial load
    const loadedSettings = loadSettingsFromStorage();
    setSettings(loadedSettings);
    setLoaded(true);

    // Listen for settings changes from other components
    const handleSettingsChange = () => {
      const updatedSettings = loadSettingsFromStorage();
      setSettings(updatedSettings);
    };

    window.addEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);

    return () => {
      window.removeEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);
    };
  }, []);

  // Save settings to localStorage and notify other components
  const saveSettings = (newSettings: AppConfig) => {
    setSettings(newSettings);
    if (typeof window !== "undefined") {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT));
    }
  };

  // Reset to default config
  const resetSettings = () => {
    setSettings(appConfig);
    if (typeof window !== "undefined") {
      localStorage.removeItem(SETTINGS_KEY);
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT));
    }
  };

  return {
    settings,
    saveSettings,
    resetSettings,
    loaded,
  };
}
