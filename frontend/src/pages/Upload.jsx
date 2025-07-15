import { useState, useRef, useEffect } from 'react'
import { CloudArrowUpIcon, FilmIcon, XMarkIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/outline'
import { uploadAPI } from '../utils/api'

const Upload = () => {
  const [uploads, setUploads] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const uploadControllers = useRef(new Map()) // For pause/resume control
  const uploadsRef = useRef([])
  useEffect(() => { uploadsRef.current = uploads }, [uploads])

  // Background upload support - restore state on page load
  useEffect(() => {
    const savedUploads = localStorage.getItem('soulstream_uploads')
    if (savedUploads) {
      try {
        const parsedUploads = JSON.parse(savedUploads)
        // Filter out completed or failed uploads, keep only in-progress ones
        const inProgressUploads = parsedUploads.filter(
          upload => upload.status === 'uploading' || upload.status === 'paused'
        )
        if (inProgressUploads.length > 0) {
          setUploads(inProgressUploads)
          // Note: resumeUpload will be available after state is set
          setTimeout(() => {
            inProgressUploads.forEach(upload => {
              if (upload.status === 'uploading') {
                resumeUpload(upload.id)
              }
            })
          }, 100)
        }
      } catch (error) {
        console.error('Error restoring uploads:', error)
      }
    }

    // Handle page visibility changes for background uploads
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('Page hidden - uploads continue in background')
      } else {
        console.log('Page visible - checking upload status')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Save uploads to localStorage whenever uploads change (including chunks)
  useEffect(() => {
    // Only store serializable data (avoid File/Blob in chunks)
    const uploadsToStore = uploads.map(u => ({
      ...u,
      file: undefined, // Don't store File object
      chunks: u.chunks ? u.chunks.map(c => ({ index: c.index, uploaded: c.uploaded || false })) : []
    }))
    localStorage.setItem('soulstream_uploads', JSON.stringify(uploadsToStore))
  }, [uploads])

  // On page load, restore chunks array for in-progress uploads
  useEffect(() => {
    const savedUploads = localStorage.getItem('soulstream_uploads')
    if (savedUploads) {
      try {
        const parsedUploads = JSON.parse(savedUploads)
        const inProgressUploads = parsedUploads.filter(
          upload => upload.status === 'uploading' || upload.status === 'paused'
        )
        if (inProgressUploads.length > 0) {
          // Restore chunks array for each upload
          setUploads(inProgressUploads.map(u => ({
            ...u,
            file: undefined, // File must be reselected if needed
            chunks: u.chunks || []
          })))
          setTimeout(() => {
            inProgressUploads.forEach(upload => {
              if (upload.status === 'uploading') {
                resumeUpload(upload.id)
              }
            })
          }, 100)
        }
      } catch (error) {
        console.error('Error restoring uploads:', error)
      }
    }
  }, [])

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    handleFiles(files)
  }

  const handleFiles = (files) => {
    files.forEach((file) => {
      if (file.type.startsWith('video/')) {
        startUpload(file)
      }
    })
  }

  const startUpload = async (file) => {
    const uploadId = Date.now() + Math.random()
    
    // Add upload to state
    const newUpload = {
      id: uploadId,
      file,
      progress: 0,
      status: 'starting',
      sessionId: null,
      chunks: [],
      error: null,
      isPaused: false,
      uploadedChunks: 0,
      totalChunks: 0
    }

    setUploads(prev => [...prev, newUpload])

    try {
      // Start upload session
      const session = await uploadAPI.startUpload(file.name, file.size)
      
      updateUpload(uploadId, {
        sessionId: session.sessionId,
        status: 'uploading',
        movieInfo: session.movieInfo
      })

      // Upload chunks
      await uploadChunks(uploadId, file, session)
      
    } catch (error) {
      console.error('Upload failed:', error)
      
      let errorMessage = error.response?.data?.error || error.message
      
      // Provide better error messages for common issues
      if (error.response?.status === 429) {
        errorMessage = 'Upload rate limit reached. Please wait a moment and try again.'
      } else if (error.response?.status === 413) {
        errorMessage = 'File chunk too large. Please try uploading a smaller file.'
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. Please try again later.'
      }
      
      updateUpload(uploadId, {
        status: 'error',
        error: errorMessage
      })
    }
  }

  const uploadChunks = async (uploadId, file, session) => {
    const { sessionId, chunkSize, totalChunks } = session
    const chunks = []

    // Create chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)
      chunks.push({ index: i, data: chunk, uploaded: false })
    }

    updateUpload(uploadId, { 
      chunks, 
      totalChunks,
      uploadedChunks: 0
    })

    // Create abort controller for this upload
    const abortController = new AbortController()
    uploadControllers.current.set(uploadId, abortController)

    // Upload chunks with limited concurrency
    const concurrency = 3

    for (let i = 0; i < chunks.length; i += concurrency) {
      // Always check latest state
      const currentUpload = uploadsRef.current.find(u => u.id === uploadId)
      if (abortController.signal.aborted || (currentUpload && currentUpload.isPaused)) {
        console.log('Upload stopped:', currentUpload?.isPaused ? 'paused' : 'cancelled')
        break
      }

      const batch = chunks.slice(i, i + concurrency)
      const batchPromises = batch.map(chunk => 
        uploadChunk(uploadId, sessionId, chunk, 0, abortController.signal)
      )
      
      try {
        await Promise.all(batchPromises)
      } catch (error) {
        if (error.name === 'AbortError' || error.message === 'Upload aborted') {
          console.log('🔄 Upload batch aborted (paused or cancelled)')
          return
        }
        console.log('❌ Upload batch failed:', error)
        throw error
      }
    }

    // Complete upload
    try {
      const result = await uploadAPI.completeUpload(sessionId)
      updateUpload(uploadId, {
        status: 'processing',
        progress: 100,
        movieId: result.movieId
      })
      uploadControllers.current.delete(uploadId)
    } catch (error) {
      throw error
    }
  }

  const uploadChunk = async (uploadId, sessionId, chunk, retryCount = 0, abortSignal = null) => {
    try {
      // Check if upload was aborted
      if (abortSignal && abortSignal.aborted) {
        console.log(`⏸️ Chunk ${chunk.index} upload aborted before starting`)
        throw new Error('Upload aborted')
      }

      await uploadAPI.uploadChunk(
        sessionId,
        chunk.index,
        chunk.data,
        (progressEvent) => {
          if (progressEvent.lengthComputable) {
            updateChunkProgress(uploadId, chunk.index, progressEvent.loaded, progressEvent.total)
          }
        },
        abortSignal
      )

      markChunkUploaded(uploadId, chunk.index)
    } catch (error) {
      // Handle abort
      if (error.name === 'AbortError' || error.message === 'Upload aborted') {
        throw error
      }

      // Handle rate limiting with retry
      if (error.response?.status === 429 && retryCount < 3) {
        console.log(`Rate limited, retrying chunk ${chunk.index} (attempt ${retryCount + 1})`)
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000))
        return uploadChunk(uploadId, sessionId, chunk, retryCount + 1, abortSignal)
      }
      throw error
    }
  }

  const updateUpload = (uploadId, updates) => {
    setUploads(prev => prev.map(upload => 
      upload.id === uploadId ? { ...upload, ...updates } : upload
    ))
  }

  const updateChunkProgress = (uploadId, chunkIndex, loaded, total) => {
    setUploads(prev => prev.map(upload => {
      if (upload.id === uploadId && upload.chunks) {
        const updatedChunks = upload.chunks.map(chunk => 
          chunk.index === chunkIndex 
            ? { ...chunk, loaded, total }
            : chunk
        )
        
        // Calculate overall progress
        const totalUploaded = updatedChunks.reduce((sum, chunk) => 
          sum + (chunk.loaded || 0), 0
        )
        const totalSize = upload.file.size
        const progress = (totalUploaded / totalSize) * 100

        return { ...upload, chunks: updatedChunks, progress }
      }
      return upload
    }))
  }

  const markChunkUploaded = (uploadId, chunkIndex) => {
    setUploads(prev => prev.map(upload => {
      if (upload.id === uploadId && upload.chunks) {
        const updatedChunks = upload.chunks.map(chunk => 
          chunk.index === chunkIndex 
            ? { ...chunk, uploaded: true }
            : chunk
        )
        return { ...upload, chunks: updatedChunks }
      }
      return upload
    }))
  }

  const removeUpload = (uploadId) => {
    setUploads(prev => prev.filter(upload => upload.id !== uploadId))
  }

  const cancelUpload = async (uploadId) => {
    const upload = uploads.find(u => u.id === uploadId)
    if (!upload || !upload.sessionId) return

    // Cancel the upload controller
    const controller = uploadControllers.current.get(uploadId)
    if (controller) {
      controller.abort()
      uploadControllers.current.delete(uploadId)
    }

    try {
      await uploadAPI.cancelUpload(upload.sessionId)
      console.log(`Upload cancelled: ${uploadId}`)
    } catch (error) {
      console.error('Error cancelling upload:', error)
    }
    
    removeUpload(uploadId)
  }

  const pauseUpload = (uploadId) => {
    console.log(`🔄 Pausing upload: ${uploadId}`)
    
    // Abort the current upload controller to stop ongoing chunks
    const controller = uploadControllers.current.get(uploadId)
    if (controller) {
      console.log('✅ Aborting upload controller')
      controller.abort()
    } else {
      console.log('⚠️ No controller found for upload')
    }

    updateUpload(uploadId, {
      status: 'paused',
      isPaused: true
    })
    
    console.log(`✅ Upload paused: ${uploadId}`)
  }

  const resumeUpload = async (uploadId) => {
    console.log(`▶️ Resuming upload: ${uploadId}`)
    
    const upload = uploads.find(u => u.id === uploadId)
    if (!upload) {
      console.log('⚠️ Upload not found for resume')
      return
    }

    updateUpload(uploadId, {
      status: 'uploading',
      isPaused: false
    })

    try {
      // Continue uploading remaining chunks
      if (upload.chunks && upload.sessionId) {
        console.log('🔄 Starting continueUploadChunks')
        await continueUploadChunks(uploadId, upload.file, upload.sessionId, upload.chunks)
      }
    } catch (error) {
      console.error('❌ Error resuming upload:', error)
      updateUpload(uploadId, {
        status: 'error',
        error: error.response?.data?.error || error.message
      })
    }
  }

  const continueUploadChunks = async (uploadId, file, sessionId, existingChunks) => {
    const upload = uploads.find(u => u.id === uploadId)
    if (!upload) return

    // Create abort controller for this upload
    const abortController = new AbortController()
    uploadControllers.current.set(uploadId, abortController)

    const remainingChunks = existingChunks.filter(chunk => !chunk.uploaded)
    const concurrency = 3

    for (let i = 0; i < remainingChunks.length; i += concurrency) {
      const currentUpload = uploadsRef.current.find(u => u.id === uploadId)
      if (abortController.signal.aborted || (currentUpload && currentUpload.isPaused)) {
        console.log('Continue upload stopped:', currentUpload?.isPaused ? 'paused' : 'cancelled')
        break
      }

      const batch = remainingChunks.slice(i, i + concurrency)
      const batchPromises = batch.map(chunk => 
        uploadChunk(uploadId, sessionId, chunk, 0, abortController.signal)
      )
      
      try {
        await Promise.all(batchPromises)
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('🔄 Continue upload batch aborted (paused or cancelled)')
          return
        }
        console.log('❌ Continue upload batch failed:', error)
        throw error
      }
    }

    // Check if all chunks are uploaded
    const updatedUpload = uploads.find(u => u.id === uploadId)
    if (updatedUpload && updatedUpload.chunks.every(chunk => chunk.uploaded)) {
      try {
        const result = await uploadAPI.completeUpload(sessionId)
        updateUpload(uploadId, {
          status: 'processing',
          progress: 100,
          movieId: result.movieId
        })
        uploadControllers.current.delete(uploadId)
      } catch (error) {
        throw error
      }
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'uploading': return 'text-blue-400'
      case 'paused': return 'text-yellow-400'
      case 'processing': return 'text-orange-400'
      case 'error': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'starting': return 'Starting...'
      case 'uploading': return 'Uploading'
      case 'paused': return 'Paused'
      case 'processing': return 'Processing'
      case 'error': return 'Error'
      default: return 'Unknown'
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">Upload Movies</h1>
          <p className="text-gray-300 text-base sm:text-lg max-w-xl mx-auto">
            Drag and drop your movie files below, or click to browse. SoulStream supports large files, chunked uploads, and background processing.
          </p>
        </div>
        
        {/* Upload Area */}
        <div
          className={
            `relative flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-16 px-6 mb-10 transition-all duration-200 cursor-pointer ` +
            (isDragOver ? 'border-white bg-gray-900' : 'border-gray-600 bg-gray-900 hover:border-gray-400')
          }
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          tabIndex={0}
          role="button"
          aria-label="Upload area"
        >
          <input
            type="file"
            accept="video/*"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
          />
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 mx-auto">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-lg text-white font-semibold mb-2">Drop your movie files here</p>
            <p className="text-gray-400 text-sm">or click to select files</p>
          </div>
        </div>
        
        {/* Upload List */}
        {uploads.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4">Uploads</h2>
            {uploads.map(upload => (
              <div key={upload.id} className="bg-gray-900 rounded-lg p-4 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
                      <span className="font-semibold text-white truncate">{upload.file.name}</span>
                      <span className="text-xs text-gray-400">{(upload.file.size / (1024*1024)).toFixed(2)} MB</span>
                      {upload.status === 'uploading' && <span className="px-2 py-0.5 rounded bg-blue-900 text-blue-300 text-xs">Uploading</span>}
                      {upload.status === 'processing' && <span className="px-2 py-0.5 rounded bg-yellow-900 text-yellow-300 text-xs">Processing</span>}
                      {upload.status === 'paused' && <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs">Paused</span>}
                      {upload.status === 'error' && <span className="px-2 py-0.5 rounded bg-red-900 text-red-300 text-xs">Error</span>}
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
                      <div
                        className={
                          `h-full rounded-full transition-all duration-300 ` +
                          (upload.status === 'processing'
                            ? 'bg-yellow-500'
                            : upload.status === 'error'
                            ? 'bg-red-500'
                            : 'bg-white')
                        }
                        style={{ width: `${upload.progress || 0}%` }}
                      />
                    </div>
                    
                    {/* Status/Error */}
                    {upload.status === 'error' && (
                      <div className="text-red-400 text-xs">{upload.error}</div>
                    )}
                  </div>
                  
                  {/* Controls */}
                  <div className="flex flex-row gap-2 sm:flex-shrink-0">
                    {upload.status === 'uploading' && (
                      <button onClick={() => pauseUpload(upload.id)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white transition-colors" title="Pause">
                        <PauseIcon className="w-5 h-5" />
                      </button>
                    )}
                    {upload.status === 'paused' && (
                      <button onClick={() => resumeUpload(upload.id)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white transition-colors" title="Resume">
                        <PlayIcon className="w-5 h-5" />
                      </button>
                    )}
                    {(upload.status === 'uploading' || upload.status === 'paused') && (
                      <button onClick={() => cancelUpload(upload.id)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white transition-colors" title="Cancel">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    )}
                    {(upload.status === 'error' || upload.status === 'processing') && (
                      <button onClick={() => removeUpload(upload.id)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white transition-colors" title="Remove from list">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Upload