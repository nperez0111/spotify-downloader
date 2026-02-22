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
  const isProcessingBatch = ref(false)
  const batchSize = ref(50) // Number of songs to queue before auto-starting batch

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
              queue(song, false) // Don't start download immediately
            }
          } else {
            console.log('Opened Song:', songs)
            queue(songs, false)
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
    console.log('[download] Starting download for:', song.name)
    console.log('[download] Song URL:', song.url)
    
    const downloadItem = progressTracker.getBySong(song)
    if (!downloadItem) {
      console.error('[download] ERROR: Download item not found for song:', song.name)
      return
    }
    
    console.log('[download] Setting status to "Downloading..."')
    downloadItem.setDownloading()
    
    console.log('[download] Calling API.download()...')
    API.download(song.url)
      .then((res) => {
        console.log('[download] ✓ Received response for', song.name)
        console.log('[download] Response status:', res.status)
        console.log('[download] Response data:', res.data)
        
        if (res.status === 200) {
          let filename = res.data
          console.log('[download] ✓ Download successful:', filename)
          downloadItem.setWebURL(API.downloadFileURL(filename))
          downloadItem.setDownloaded()
          notifySuccess(`Downloaded: ${song.name}`, `by ${song.artist}`)
        } else {
          console.log('[download] ✗ Bad response status:', res.status)
          const errorMsg = parseErrorMessage(res.data)
          downloadItem.setError(errorMsg)
          notifyError(`Failed to download: ${song.name}`, errorMsg)
        }
      })
      .catch((err) => {
        console.log('[download] ✗ Download error for', song.name)
        console.log('[download] Error:', err)
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
    console.log('========================================')
    console.log('[downloadAll] Starting download of', songs.length, 'songs')
    console.log('[downloadAll] Songs:', songs.map(s => s.name))
    notifySuccess(`Added ${songs.length} songs`, 'to download queue')

    // Queue all songs to the frontend
    console.log('[downloadAll] Queueing songs to frontend...')
    for (const song of songs) {
      console.log(`[downloadAll] Adding song to queue: ${song.name}`)
      progressTracker.appendSong(song)
    }
    
    console.log('[downloadAll] All songs queued to frontend, queue size:', downloadQueue.value.length)
    console.log('[downloadAll] Starting sequential downloads...')
    
    // Start downloads sequentially - backend semaphore limits concurrent downloads
    startSequentialDownloads(songs)
    console.log('========================================')
  }

  async function downloadBatch(songs) {
    // Queue and process downloads in batches to prevent network overload.
    // Large playlists are split into batches of batchSize items.
    isProcessingBatch.value = true
    try {
      // First, add all songs to the frontend queue so they're visible in the UI
      console.log('Adding songs to frontend queue:', songs.length)
      for (const song of songs) {
        progressTracker.appendSong(song)
      }
      
      const urls = songs.map(s => s.url)
      console.log('Queueing on backend:', urls.length, 'songs')
      
      // Queue all songs on the backend
      const queueRes = await API.queueBatchDownload(urls)

      if (queueRes.status === 200) {
        const { queued, failed, stats } = queueRes.data
        console.log(`Backend queued ${queued.length} songs, ${failed.length} failed`, stats)
        
        if (failed.length > 0) {
          notifyError('Some songs failed to queue', `${failed.length} songs could not be queued`)
        }

        // Process the batch
        console.log('Starting batch processing...')
        const processRes = await API.processBatchDownload()
        if (processRes.status === 200) {
          const { results, stats: finalStats } = processRes.data
          console.log('Batch processing complete', results, finalStats)
          
          // Update UI with results
          let completed = 0
          let failed = 0
          for (const [taskId, result] of Object.entries(results)) {
            const song = songs.find(s => s.url === taskId)
            if (!song) continue
            
            const downloadItem = progressTracker.getBySong(song)
            if (downloadItem) {
              if (result.status === 'completed') {
                completed++
                downloadItem.setWebURL(API.downloadFileURL(result.path))
                downloadItem.setDownloaded()
              } else if (result.status === 'failed') {
                failed++
                downloadItem.setError(result.error_message)
              }
            }
          }
          
          notifySuccess(
            `Batch complete: ${completed} downloaded, ${failed} failed`,
            `Out of ${songs.length} songs`
          )
        }
      }
    } catch (err) {
      console.error('Batch download error:', err)
      notifyError('Batch download failed', err.message)
    } finally {
      isProcessingBatch.value = false
    }
  }

  function startSequentialDownloads(songs) {
    // Start downloading songs one at a time
    // The backend semaphore limits concurrent downloads
    console.log('========================================')
    console.log('[startSequentialDownloads] Starting sequential downloads for', songs.length, 'songs')
    console.log('[startSequentialDownloads] Using 100ms delay between requests')
    
    let index = 0
    const downloadNext = () => {
      if (index >= songs.length) {
        console.log('[startSequentialDownloads] ✓ All download requests queued (', index, '/', songs.length, ')')
        console.log('========================================')
        return
      }
      
      const song = songs[index]
      const songNum = index + 1
      index++
      
      console.log(`[startSequentialDownloads] Requesting download ${songNum}/${songs.length}: ${song.name}`)
      
      // Download the song (async)
      download(song)
      
      // Queue next download immediately - backend will rate limit
      // Small delay to avoid overwhelming the backend
      setTimeout(downloadNext, 100)
    }
    
    console.log('[startSequentialDownloads] Initiating download loop...')
    downloadNext()
  }

  async function processBatchDownload() {
    // Process the current queue by downloading each song sequentially.
    // The backend batch manager handles rate limiting and retries.
    isProcessingBatch.value = true
    try {
      // Get all queued songs from the frontend
      const queuedSongs = downloadQueue.value
        .filter(item => item.web_status === STATUS.QUEUED)
        .map(item => item.song)
      
      console.log('Processing batch with', queuedSongs.length, 'songs')
      
      // Download each song sequentially - the backend handles the rate limiting
      for (const song of queuedSongs) {
        await new Promise(resolve => {
          // Download the song
          download(song)
          // Wait a bit for the download to complete or fail
          setTimeout(resolve, 100)
        })
      }
      
      console.log('Batch processing finished')
    } catch (err) {
      console.error('Batch processing error:', err)
      notifyError('Batch processing error', err.message)
    } finally {
      isProcessingBatch.value = false
    }
  }

  async function getBatchStatus() {
    // Get current batch download status.
    try {
      const res = await API.getBatchStatus()
      if (res.status === 200) {
        return res.data
      }
    } catch (err) {
      console.error('Error getting batch status:', err)
    }
    return null
  }

  async function clearBatch() {
    // Clear all pending tasks from the batch queue.
    try {
      const res = await API.clearBatchQueue()
      if (res.status === 200) {
        console.log('Batch queue cleared')
        notifySuccess('Queue cleared', 'All pending downloads have been removed')
      }
    } catch (err) {
      console.error('Error clearing batch:', err)
      notifyError('Failed to clear queue', err.message)
    }
  }

  return {
    fromURL,
    download,
    retry,
    queue,
    remove,
    downloadAll,
    downloadBatch,
    processBatchDownload,
    getBatchStatus,
    clearBatch,
    loading,
    isProcessingBatch,
    batchSize,
  }
}
