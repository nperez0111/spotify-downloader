"""
Batch Download Manager for handling large playlist downloads efficiently.

This module provides a queue-based download management system to handle
downloads in controlled batches, preventing network overload and failures
from too many concurrent requests.
"""

import asyncio
import logging
from typing import Callable, Dict, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass, field
from enum import Enum

from spotdl.types.song import Song

__all__ = ["DownloadStatus", "BatchDownloadManager"]

logger = logging.getLogger(__name__)


class DownloadStatus(str, Enum):
    """Status of a download task."""

    QUEUED = "queued"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class DownloadTask:
    """Represents a single download task in the queue."""

    song: Song
    status: DownloadStatus = DownloadStatus.QUEUED
    retry_count: int = 0
    max_retries: int = 3
    error_message: Optional[str] = None
    result_path: Optional[Path] = None
    created_at: float = field(default_factory=lambda: asyncio.get_event_loop().time())
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


class BatchDownloadManager:
    """
    Manages downloads in batches to prevent network overload.

    This manager handles:
    - Queue management for large playlists
    - Batch processing with configurable batch size
    - Retry logic with exponential backoff
    - Progress tracking and callbacks
    """

    def __init__(
        self,
        batch_size: int = 5,
        max_concurrent: int = 3,
        max_retries: int = 3,
        progress_callback=None,
    ):
        """
        Initialize the batch download manager.

        ### Arguments
        - batch_size: Number of items to queue before starting batch download
        - max_concurrent: Maximum concurrent downloads at once
        - max_retries: Maximum retry attempts per song
        - progress_callback: Callback for progress updates (song, status_message)
        """

        self.batch_size = batch_size
        self.max_concurrent = max_concurrent
        self.max_retries = max_retries
        self.progress_callback = progress_callback

        # Queue management
        self.queue: asyncio.Queue = None  # type: ignore
        self.tasks_map: Dict[str, DownloadTask] = {}
        self.lock = asyncio.Lock()

        # Stats
        self.total_queued = 0
        self.total_completed = 0
        self.total_failed = 0
        self.total_retried = 0

        logger.info(
            "BatchDownloadManager initialized with batch_size=%d, "
            "max_concurrent=%d, max_retries=%d",
            batch_size,
            max_concurrent,
            max_retries,
        )

    async def initialize(self):
        """Initialize async components."""
        self.queue = asyncio.Queue()
        logger.debug("BatchDownloadManager queue initialized")

    async def add_to_queue(self, song: Song) -> str:
        """
        Add a song to the download queue.

        ### Arguments
        - song: The song to download

        ### Returns
        - Task ID for tracking
        """

        task_id = song.url
        task = DownloadTask(song=song, max_retries=self.max_retries)

        async with self.lock:
            self.tasks_map[task_id] = task
            self.total_queued += 1

        await self.queue.put(task_id)

        if self.progress_callback:
            self.progress_callback(song, "Queued for download")

        logger.debug(
            "Added song to queue: %s (Total queued: %d)",
            song.display_name,
            self.total_queued,
        )

        return task_id

    async def add_batch(self, songs: list) -> list:
        """
        Add multiple songs to the queue.

        ### Arguments
        - songs: List of Song objects to download

        ### Returns
        - List of task IDs
        """

        task_ids = []
        for song in songs:
            task_id = await self.add_to_queue(song)
            task_ids.append(task_id)

        logger.info("Added batch of %d songs to queue", len(songs))
        return task_ids

    async def get_task_status(self, task_id: str) -> Optional[DownloadTask]:
        """Get the current status of a download task."""
        async with self.lock:
            return self.tasks_map.get(task_id)

    async def get_queue_stats(self) -> Dict[str, int]:
        """Get statistics about the download queue."""
        async with self.lock:
            queued = sum(
                1 for t in self.tasks_map.values() if t.status == DownloadStatus.QUEUED
            )
            downloading = sum(
                1
                for t in self.tasks_map.values()
                if t.status == DownloadStatus.DOWNLOADING
            )
            completed = sum(
                1
                for t in self.tasks_map.values()
                if t.status == DownloadStatus.COMPLETED
            )
            failed = sum(
                1 for t in self.tasks_map.values() if t.status == DownloadStatus.FAILED
            )

            return {
                "queued": queued,
                "downloading": downloading,
                "completed": completed,
                "failed": failed,
                "total": len(self.tasks_map),
            }

    async def process_queue(
        self,
        download_func,
    ) -> Dict[str, Dict]:
        """
        Process the download queue with batching and retry logic.

        ### Arguments
        - download_func: Async function that downloads a song, returns (success, path, error_msg)

        ### Returns
        - Dictionary of task_id -> {status, path, error_message, retries}
        """

        if self.queue is None:
            await self.initialize()

        results = {}
        semaphore = asyncio.Semaphore(self.max_concurrent)

        async def download_with_retry(task_id: str):
            """Download a single task with retry logic."""
            task = self.tasks_map[task_id]

            async with semaphore:
                while task.retry_count <= task.max_retries:
                    try:
                        async with self.lock:
                            task.status = DownloadStatus.DOWNLOADING
                            task.started_at = asyncio.get_event_loop().time()

                        if self.progress_callback:
                            self.progress_callback(task.song, "Downloading...")

                        logger.debug(
                            "Downloading: %s (attempt %d)",
                            task.song.display_name,
                            task.retry_count + 1,
                        )

                        # Call the download function (should be async)
                        success, path, error_msg = await download_func(task.song)

                        async with self.lock:
                            if success:
                                task.status = DownloadStatus.COMPLETED
                                task.result_path = path
                                task.completed_at = asyncio.get_event_loop().time()
                                self.total_completed += 1

                                if self.progress_callback:
                                    self.progress_callback(
                                        task.song, "Downloaded successfully"
                                    )

                                logger.info(
                                    "Successfully downloaded: %s",
                                    task.song.display_name,
                                )
                            else:
                                # Retry if we haven't exceeded max retries
                                if task.retry_count < task.max_retries:
                                    task.retry_count += 1
                                    self.total_retried += 1
                                    task.error_message = error_msg
                                    task.status = DownloadStatus.QUEUED

                                    # Exponential backoff
                                    backoff = 2**task.retry_count
                                    if self.progress_callback:
                                        self.progress_callback(
                                            task.song,
                                            f"Retry {task.retry_count}/{task.max_retries} in {backoff}s: {error_msg}",
                                        )

                                    logger.warning(
                                        "Download failed for %s, retrying (%d/%d): %s",
                                        task.song.display_name,
                                        task.retry_count,
                                        task.max_retries,
                                        error_msg,
                                    )

                                    await asyncio.sleep(backoff)
                                    continue
                                else:
                                    task.status = DownloadStatus.FAILED
                                    task.error_message = error_msg
                                    task.completed_at = asyncio.get_event_loop().time()
                                    self.total_failed += 1

                                    if self.progress_callback:
                                        self.progress_callback(
                                            task.song,
                                            f"Failed after {task.max_retries} retries: {error_msg}",
                                        )

                                    logger.error(
                                        "Failed to download %s after %d retries: %s",
                                        task.song.display_name,
                                        task.max_retries,
                                        error_msg,
                                    )

                        break

                    except Exception as e:
                        error_str = str(e)
                        logger.exception(
                            "Exception during download of %s: %s",
                            task.song.display_name,
                            error_str,
                        )

                        async with self.lock:
                            if task.retry_count < task.max_retries:
                                task.retry_count += 1
                                self.total_retried += 1
                                task.error_message = error_str
                                task.status = DownloadStatus.QUEUED

                                backoff = 2**task.retry_count
                                if self.progress_callback:
                                    self.progress_callback(
                                        task.song,
                                        f"Retry {task.retry_count}/{task.max_retries} in {backoff}s: {error_str}",
                                    )

                                await asyncio.sleep(backoff)
                                continue
                            else:
                                task.status = DownloadStatus.FAILED
                                task.error_message = error_str
                                task.completed_at = asyncio.get_event_loop().time()
                                self.total_failed += 1

                                if self.progress_callback:
                                    self.progress_callback(
                                        task.song,
                                        f"Failed: {error_str}",
                                    )

                        break

                # Record result
                async with self.lock:
                    results[task_id] = {
                        "status": task.status.value,
                        "path": str(task.result_path) if task.result_path else None,
                        "error_message": task.error_message,
                        "retries": task.retry_count,
                    }

        # Process all queued tasks
        workers = []
        while True:
            try:
                task_id = self.queue.get_nowait()
                worker = asyncio.create_task(download_with_retry(task_id))
                workers.append(worker)
            except asyncio.QueueEmpty:
                break

        if workers:
            await asyncio.gather(*workers)

        logger.info(
            "Queue processing complete - Completed: %d, Failed: %d, Retried: %d",
            self.total_completed,
            self.total_failed,
            self.total_retried,
        )

        return results

    async def clear_queue(self):
        """Clear all pending tasks from the queue."""
        if self.queue is None:
            return

        while not self.queue.empty():
            try:
                self.queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        logger.info("Queue cleared")

    async def get_all_tasks(self) -> Dict[str, DownloadTask]:
        """Get all tasks with their current status."""
        async with self.lock:
            return self.tasks_map.copy()

    async def reset_stats(self):
        """Reset statistics counters."""
        async with self.lock:
            self.total_queued = 0
            self.total_completed = 0
            self.total_failed = 0
            self.total_retried = 0
        logger.debug("Statistics reset")
