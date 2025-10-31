"use client";

import { appConfig } from "../config/appConfig";

export type MessageHandler = (event: MessageEvent) => void;

// Same SETTINGS_KEY as useSettings hook
const SETTINGS_KEY = "ros_view_settings";

export class WebSocketConnection {
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private connecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private messageHandler: MessageHandler | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay: number = 1000; // Start with 1 second
  private maxReconnectDelay: number = 30000; // Max 30 seconds
  private shouldReconnect: boolean = true;

  // Load URL from localStorage (same logic as useSettings, but can't use hooks in a class)
  private getUrl(): string {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        try {
          const settings = JSON.parse(saved);
          return settings.connection?.url || appConfig.connection.url;
        } catch (err) {
          console.error("Failed to parse settings:", err);
        }
      }
    }
    return appConfig.connection.url;
  }

  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connecting = true;
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        // Load URL dynamically from settings each time we connect
        const url = this.getUrl();
        this.ws = new WebSocket(url, ["foxglove.websocket.v1"]);

        this.ws.onopen = () => {
          this.connected = true;
          this.connecting = false;
          this.reconnectDelay = 1000; // Reset delay on successful connection
          console.log("WebSocket connected");
          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          if (this.messageHandler) {
            this.messageHandler(event);
          }
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.connected = false;
          this.connecting = false;
          this.connectionPromise = null;

          // Reconnect will be handled by onclose
          reject(new Error("WebSocket connection error"));
        };

        this.ws.onclose = (event) => {
          this.connected = false;
          this.connecting = false;
          this.connectionPromise = null;

          console.log("WebSocket disconnected, code:", event.code, "reason:", event.reason);

          // Auto-reconnect if not manually disconnected
          if (this.shouldReconnect) {
            console.log(`Reconnecting in ${this.reconnectDelay / 1000} seconds...`);
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        console.error("Failed to create WebSocket:", error);
        this.connecting = false;
        this.connectionPromise = null;

        // Schedule reconnection on initial connection failure
        if (this.shouldReconnect) {
          console.log(`Reconnecting in ${this.reconnectDelay / 1000} seconds...`);
          this.scheduleReconnect();
        }

        reject(error);
      }
    });

    return this.connectionPromise;
  }

  private scheduleReconnect(): void {
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // Schedule reconnection with current delay
    this.reconnectTimeout = setTimeout(() => {
      console.log("Attempting to reconnect...");
      this.connect().catch((err) => {
        console.error("Reconnection attempt failed:", err);
      });

      // Increase delay for next attempt (exponential backoff)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  disconnect(): void {
    // Disable auto-reconnect on manual disconnect
    this.shouldReconnect = false;

    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.connecting = false;
    this.connectionPromise = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  send(data: string | ArrayBuffer): void {
    if (!this.ws || !this.connected) {
      throw new Error("WebSocket not connected");
    }
    this.ws.send(data);
  }

  getWebSocket(): WebSocket | null {
    return this.ws;
  }
}
