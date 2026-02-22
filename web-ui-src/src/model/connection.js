import { ref } from 'vue'
import API from './api'

export const connectionStatus = ref('connecting') // 'connected', 'disconnected', 'connecting'
export const backendHealth = ref(null) // { status: 'healthy' | 'degraded', timestamp }

let healthCheckInterval = null
let wsMonitorInterval = null

export function initializeConnectionMonitoring() {
  // Monitor WebSocket connection
  monitorWebSocketConnection()
  
  // Start health checks
  startHealthChecks()
}

function monitorWebSocketConnection() {
  // Check WebSocket connection status periodically
  wsMonitorInterval = setInterval(() => {
    try {
      if (API.wsConnection) {
        if (API.wsConnection.readyState === WebSocket.OPEN) {
          connectionStatus.value = 'connected'
        } else if (API.wsConnection.readyState === WebSocket.CONNECTING) {
          connectionStatus.value = 'connecting'
        } else {
          connectionStatus.value = 'disconnected'
        }
      }
    } catch (e) {
      console.error('Error checking WebSocket status:', e)
      connectionStatus.value = 'disconnected'
    }
  }, 2000)
}

function startHealthChecks() {
  // Check backend health every 30 seconds
  healthCheckInterval = setInterval(() => {
    checkBackendHealth()
  }, 30000)
  
  // Initial check
  checkBackendHealth()
}

export function checkBackendHealth() {
  API.get('/api/version')
    .then(() => {
      backendHealth.value = {
        status: 'healthy',
        timestamp: Date.now(),
      }
    })
    .catch(() => {
      backendHealth.value = {
        status: 'degraded',
        timestamp: Date.now(),
      }
    })
}

export function stopHealthChecks() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
  }
  if (wsMonitorInterval) {
    clearInterval(wsMonitorInterval)
  }
}

export function useConnectionStatus() {
  return {
    connectionStatus,
    backendHealth,
    checkBackendHealth,
  }
}
