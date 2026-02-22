import { ref, computed } from 'vue'

import API from '/src/model/api'
import { notifyError, notifySuccess } from './notifications'

const STATUS = {
  QUEUED: 'In Queue',
  DOWNLOADING: 'Downloading...',
  DOWNLOADED: 'Done',
  ERROR: 'Error',
}

const downloadQueue = ref([])

class DownloadItem {
  constructor(song) {
    this.song = song
    this.web_status = STATUS.QUEUED
    this.progress = 0
    this.message = ''
    this.web_download_url = null
    this.error_details = null
    this.retry_count = 0
    this.max_retries = 3
  }
  setDownloading() {
    this.web_status = STATUS.DOWNLOADING
    this.error_details = null
  }
  setDownloaded() {
    this.web_status = STATUS.DOWNLOADED
    this.error_details = null
  }
  setError(errorDetails = null) {
    this.web_status = STATUS.ERROR
    this.error_details = errorDetails
  }
  setWebURL(URL) {
    this.web_download_url = URL
  }
  isQueued() {
    return this.song.song_id !== undefined ? true : false
    // return this.web_status === STATUS.QUEUED
  }
  isDownloading() {
    return this.web_status === STATUS.DOWNLOADING
  }
  isDownloaded() {
    return this.web_status === STATUS.DOWNLOADED
  }
  isErrored() {
    return this.web_status === STATUS.ERROR
  }
  canRetry() {
    return this.isErrored() && this.retry_count < this.max_retries
  }
  wsUpdate(message) {
    this.progress = message.progress
    this.message = message.message
  }
}

export function useProgressTracker() {
  function _findIndex(song) {
    return downloadQueue.value.findIndex(
      (downloadItem) => downloadItem.song.song_id === song.song_id
    )
  }
  function appendSong(song) {
    let downloadItem = new DownloadItem(song)
    downloadQueue.value.push(downloadItem)
  }
  function removeSong(song) {
    console.log('removing', song, song.song_id)
    downloadQueue.value = downloadQueue.value.filter(
      (downloadItem) => downloadItem.song.song_id !== song.song_id
    )
    console.log(downloadQueue.value)
  }

  function getBySong(song) {
    const idx = _findIndex(song)
    if (idx === -1) return null
    return downloadQueue.value[_findIndex(song)]
  }

  return {
    appendSong,
    removeSong,
    getBySong,
    downloadQueue,
  }
}

const progressTracker = useProgressTracker()

// Parse error messages to provide more helpful feedback
function parseErrorMessage(error) {
  if (!error) return 'An unknown error occurred'
  
  const message = error.message || error.toString()
  
  if (message.includes('404') || message.includes('not found')) {
    return 'Song not found or unavailable'
  }
  if (message.includes('403') || message.includes('forbidden')) {
    return 'Song unavailable in your region'
  }
  if (message.includes('timeout')) {
    return 'Request timed out - try again'
  }
  if (message.includes('ECONNREFUSED')) {
    return 'Backend connection failed'
  }
  if (message.includes('Network')) {
    return 'Network error - check your connection'
  }
  
  return message
}

// If Websocket connection exists, set status using descriptive events, else, fallback to simple messages.
API.ws_onmessage((event) => {
  // event: MessageEvent
  let data = JSON.parse(event.data)
  progressTracker.getBySong(data.song).wsUpdate(data)
})
API.ws_onerror((event) => {
  // event: MessageEvent
  console.log('websocket error:', event)
})

export function useDownloadManager() {
  const loading = ref(false)
  function fromURL(url) {
    loading.value = true
    return API.open(url)
      .then((res) => {
        console.log('Received Response:', res)
        if (res.status === 200) {
          const songs = res.data
          if (Array.isArray(songs)) {
            for (const song of songs) {
              console.log('Opened Song:', song)
              queue(song)
            }
          } else {
            console.log('Opened Song:', songs)
            queue(songs)
          }
        } else {
          console.log('Error:', res)
        }
      })
      .catch((err) => {
        console.log('Other Error:', err.message)
      })
      .finally(() => {
        loading.value = false
      })
  }

  function download(song) {
    console.log('Downloading', song)
    const downloadItem = progressTracker.getBySong(song)
    downloadItem.setDownloading()
    
    API.download(song.url)
      .then((res) => {
        console.log('Received Response:', res)
        if (res.status === 200) {
          let filename = res.data
          console.log('Download Complete:', filename)
          downloadItem.setWebURL(API.downloadFileURL(filename))
          downloadItem.setDownloaded()
          notifySuccess(`Downloaded: ${song.name}`, `by ${song.artist}`)
        } else {
          console.log('Error:', res)
          const errorMsg = parseErrorMessage(res.data)
          downloadItem.setError(errorMsg)
          notifyError(`Failed to download: ${song.name}`, errorMsg)
        }
      })
      .catch((err) => {
        console.log('Download Error:', err.message)
        const errorMsg = parseErrorMessage(err)
        downloadItem.setError(errorMsg)
        notifyError(`Failed to download: ${song.name}`, errorMsg)
      })
  }

  function retry(song) {
    const downloadItem = progressTracker.getBySong(song)
    if (downloadItem.canRetry()) {
      downloadItem.retry_count++
      console.log(
        `Retrying download for ${song.name} (attempt ${downloadItem.retry_count}/${downloadItem.max_retries})`
      )
      // Exponential backoff: wait 1s, 2s, 4s
      const delay = Math.pow(2, downloadItem.retry_count - 1) * 1000
      setTimeout(() => {
        download(song)
      }, delay)
    }
  }

  function queue(song, beginDownload = true) {
    progressTracker.appendSong(song)
    if (beginDownload) download(song)
  }
  function remove(song) {
    console.log('removing')
    progressTracker.removeSong(song)
  }

  function downloadAll(songs) {
    console.log('Downloading all', songs.length, 'songs')
    notifySuccess(`Added ${songs.length} songs`, 'to download queue')
    for (const song of songs) {
      queue(song)
    }
  }

  return {
    fromURL,
    download,
    retry,
    queue,
    remove,
    downloadAll,
    loading,
  }
}
