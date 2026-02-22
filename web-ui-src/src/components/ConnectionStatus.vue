<template>
  <div class="dropdown dropdown-end">
    <div
      tabindex="0"
      class="indicator cursor-pointer mx-2"
      :title="`Backend: ${backendHealth?.status || 'unknown'} | Connection: ${connectionStatus}`"
    >
      <span
        v-if="backendHealth?.status === 'degraded'"
        class="indicator-item indicator-top indicator-end badge badge-warning"
        style="top: -5px; right: -5px"
      ></span>
      <span
        v-else-if="backendHealth?.status === 'healthy'"
        class="indicator-item indicator-top indicator-end badge badge-success"
        style="top: -5px; right: -5px"
      ></span>
      <div
        class="w-8 h-8 rounded-full border-2 flex items-center justify-center"
        :class="getStatusClass()"
      >
        <Icon icon="clarity:cloud-line" class="h-5 w-5" />
      </div>
    </div>

    <div
      tabindex="0"
      class="dropdown-content card card-compact w-64 p-4 shadow bg-base-100 text-base-content z-50"
    >
      <div class="space-y-3">
        <div class="flex justify-between items-center">
          <span class="font-semibold">Backend Status</span>
          <span
            class="badge"
            :class="backendHealth?.status === 'healthy' ? 'badge-success' : 'badge-warning'"
          >
            {{ backendHealth?.status || 'checking...' }}
          </span>
        </div>

        <div class="flex justify-between items-center">
          <span class="font-semibold">Connection</span>
          <span
            class="badge"
            :class="{
              'badge-success': connectionStatus === 'connected',
              'badge-warning': connectionStatus === 'connecting',
              'badge-error': connectionStatus === 'disconnected',
            }"
          >
            {{ connectionStatus }}
          </span>
        </div>

        <div class="divider my-2"></div>

        <div class="text-sm text-base-content/70">
          <p v-if="connectionStatus === 'disconnected'" class="text-error">
            ⚠️ Connection lost. Downloads may fail.
          </p>
          <p v-else-if="connectionStatus === 'connecting'" class="text-warning">
            🔄 Reconnecting to backend...
          </p>
          <p v-else-if="backendHealth?.status === 'degraded'" class="text-warning">
            ⚠️ Backend may be slow. Retries enabled.
          </p>
          <p v-else class="text-success">
            ✓ All systems operational
          </p>
        </div>

        <button
          @click="checkStatus"
          class="btn btn-sm btn-outline w-full mt-2"
        >
          Check Status
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Icon } from '@iconify/vue'
import { useConnectionStatus } from '../model/connection'

const { connectionStatus, backendHealth, checkBackendHealth } = useConnectionStatus()

function getStatusClass() {
  if (connectionStatus.value === 'connected' && backendHealth.value?.status === 'healthy') {
    return 'border-success'
  } else if (
    connectionStatus.value === 'connecting' ||
    backendHealth.value?.status === 'degraded'
  ) {
    return 'border-warning'
  } else {
    return 'border-error'
  }
}

function checkStatus() {
  checkBackendHealth()
}
</script>

<style scoped></style>
