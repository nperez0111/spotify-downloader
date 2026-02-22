<template>
  <div class="min-h-screen m-2">
    <div class="flex justify-between items-center mb-2">
      <h1 class="m-4 text-xl">Queue</h1>
      <div class="flex gap-2 m-4">
        <button
          v-if="pt.downloadQueue.value.length > 0"
          @click="autoDownloadEnabled = !autoDownloadEnabled"
          :class="`btn ${autoDownloadEnabled ? 'btn-info' : 'btn-outline'} m-0`"
          :title="autoDownloadEnabled ? 'Auto-download enabled' : 'Enable auto-download when files complete'"
        >
          <Icon icon="clarity:auto-save-line" class="h-5 w-5" />
          Auto-Download
        </button>
        <button
          v-if="pt.downloadQueue.value.length > 0 && hasCompletedDownloads"
          @click="downloadAllCompleted"
          class="btn btn-success m-0"
          title="Download all completed files now"
        >
          <Icon icon="clarity:download-line" class="h-5 w-5" />
          Download All
        </button>
      </div>
    </div>
    <div v-if="pt.downloadQueue.value.length === 0">
      <div class="alert alert-error shadow-lg">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="stroke-current flex-shrink-0 w-6 h-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <span>No downloads are queued. Search for a song to begin.</span>
      </div>
    </div>
    <div v-else>
      <div class="carousel carousel-end bg-base-200 rounded-box shadow-lg">
        <div
          v-for="(downloadItem, index) in pt.downloadQueue.value"
          :key="index"
          class="carousel-item h-48"
        >
          <img :src="downloadItem.song.cover_url" />
        </div>
      </div>

      <div class="card card-bordered my-2 shadow-lg card-compact bg-base-100">
        <div
          v-for="(downloadItem, index) in pt.downloadQueue.value"
          :key="index"
          class="card-body grid grid-rows-1"
        >
          <h2 class="card-title">
            {{ downloadItem.song.name }} - {{ downloadItem.song.artist }}
          </h2>

          <p>
            {{ downloadItem.song.album_name }}
          </p>
          <div v-if="downloadItem.isErrored()" class="alert alert-error mt-2 py-2">
            <div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                class="stroke-current flex-shrink-0 w-5 h-5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
              <span class="text-sm">{{ downloadItem.error_details || 'Download failed' }}</span>
            </div>
          </div>
           <div class="stat-figure text-primary flex space-x-2 items-center">
             <!-- // If Websocket connection exists, set status using descriptive events (message), else, fallback to simple statuses. -->
             <span class="badge" :title="downloadItem.message">{{
               downloadItem.message || downloadItem.web_status
             }}</span>
             <button
               v-if="downloadItem.canRetry()"
               class="btn btn-warning btn-outline btn-square"
               @click="dm.retry(downloadItem.song)"
               title="Retry download"
             >
               <Icon icon="clarity:reload-line" class="h-6 w-6" />
             </button>
             <button
               class="btn btn-error btn-outline btn-square"
               @click="dm.remove(downloadItem.song)"
               :title="`Remove ${downloadItem.song.name}`"
             >
               <Icon icon="clarity:trash-line" class="h-6 w-6" />
             </button>
            <a
              v-if="downloadItem.isDownloaded()"
              class="btn btn-square btn-ghost"
              href="javascript:;"
              @click="download(downloadItem.web_download_url)"
              download
            >
              <Icon icon="clarity:download-line" class="h-6 w-6" />
            </a>
            <button
              v-else-if="downloadItem.progress === 0"
              class="btn btn-square btn-ghost loading"
            ></button>
            <div
              v-else
              class="radial-progress bg-primary text-primary-content border-4 border-primary"
              :style="`--value: ${downloadItem.progress}; --size: 2.5rem`"
            >
              {{ Math.round(downloadItem.progress) }}%
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Icon } from '@iconify/vue'
import { computed, ref, watch } from 'vue'

import { useProgressTracker, useDownloadManager } from '../model/download'

const props = defineProps({
  data: Object,
})

const pt = useProgressTracker()
const dm = useDownloadManager()

const autoDownloadEnabled = ref(false)
const downloadedCount = ref(0)

const hasCompletedDownloads = computed(() => {
  return pt.downloadQueue.value.some((item) => item.isDownloaded())
})

// Watch for newly completed downloads and auto-download if enabled
watch(
  () => pt.downloadQueue.value.map(item => item.web_status),
  (newStatuses) => {
    if (autoDownloadEnabled.value) {
      const completedItems = pt.downloadQueue.value.filter((item) => item.isDownloaded())
      const newCompletedCount = completedItems.length
      
      // If we have new completed items, download them
      if (newCompletedCount > downloadedCount.value) {
        const newlyCompleted = completedItems.slice(downloadedCount.value)
        console.log('[DownloadList] Auto-downloading', newlyCompleted.length, 'newly completed files')
        newlyCompleted.forEach((item, index) => {
          // Stagger downloads with 200ms delays
          setTimeout(() => {
            download(item.web_download_url)
          }, index * 200)
        })
        downloadedCount.value = newCompletedCount
      }
    }
  },
  { deep: true }
)

function download(url) {
  const a = document.createElement('a')
  a.href = url
  a.download = url.split('/').pop()
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

async function downloadAllCompleted() {
  const completedItems = pt.downloadQueue.value.filter((item) => item.isDownloaded())
  if (completedItems.length === 0) return

  console.log('[downloadAllCompleted] Starting sequential downloads for', completedItems.length, 'files')
  console.log('[downloadAllCompleted] Using 200ms delay between downloads to avoid overwhelming browser')
  
  let index = 0
  const downloadNext = () => {
    if (index >= completedItems.length) {
      console.log('[downloadAllCompleted] ✓ All downloads queued (', index, '/', completedItems.length, ')')
      return
    }
    
    const item = completedItems[index]
    const fileNum = index + 1
    index++
    
    console.log(`[downloadAllCompleted] Downloading file ${fileNum}/${completedItems.length}: ${item.song.name}`)
    download(item.web_download_url)
    
    // Stagger downloads to respect browser connection limits (typically 6 per domain)
    // 200ms delay gives browsers time to manage each download properly
    setTimeout(downloadNext, 200)
  }
  
  console.log('[downloadAllCompleted] Initiating sequential download loop...')
  downloadNext()
}
</script>

<style scoped></style>
