import { useState, useRef, useEffect } from 'react'
import { CloudArrowUpIcon, FilmIcon, XMarkIcon, PlayIcon, PauseIcon } from '@heroicons/react/24/outline'
import { uploadAPI } from '../utils/api'

const Upload = () => {
  const [uploads, setUploads] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const uploadControllers = useRef(new Map()) // For pause/resume control

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

  // Save uploads to localStorage whenever uploads change
  useEffect(() => {
    localStorage.setItem('soulstream_uploads', JSON.stringify(uploads))
  }, [uploads])

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
      // Check if upload was paused or cancelled
      if (abortController.signal.aborted) {
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
          console.log('Upload aborted (paused or cancelled)')
          return
        }
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
    const controller = uploadControllers.current.get(uploadId)
    if (controller) {
      controller.abort()
      uploadControllers.current.delete(uploadId)
    }

    updateUpload(uploadId, {
      status: 'paused',
      isPaused: true
    })
    
    console.log(`Upload paused: ${uploadId}`)
  }

  const resumeUpload = async (uploadId) => {
    const upload = uploads.find(u => u.id === uploadId)
    if (!upload) return

    updateUpload(uploadId, {
      status: 'uploading',
      isPaused: false
    })

    try {
      // Continue uploading remaining chunks
      if (upload.chunks && upload.sessionId) {
        await continueUploadChunks(uploadId, upload.file, upload.sessionId, upload.chunks)
      }
    } catch (error) {
      console.error('Error resuming upload:', error)
      updateUpload(uploadId, {
        status: 'error',
        error: error.response?.data?.error || error.message
      })
    }
  }

  const continueUploadChunks = async (uploadId, file, sessionId, existingChunks) => {
    const upload = uploads.find(u => u.id === uploadId)
    if (!upload) return

    // Don't continue if the upload is still paused
    if (upload.status === 'paused' || upload.isPaused) {
      console.log('Upload is paused, not continuing')
      return
    }

    // Create abort controller for this upload
    const abortController = new AbortController()
    uploadControllers.current.set(uploadId, abortController)

    const remainingChunks = existingChunks.filter(chunk => !chunk.uploaded)
    const concurrency = 3

    for (let i = 0; i < remainingChunks.length; i += concurrency) {
      // Check if upload was paused or cancelled
      if (abortController.signal.aborted) {
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
          console.log('Upload batch aborted (paused or cancelled)')
          return
        }
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
       <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="mb-8 sm:mb-12 text-center">
           <div className="flex items-center justify-center mb-4">
             <div className="relative">
               <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-600 to-purple-800 rounded-full shadow-xl">
                 <span className="text-white font-bold text-2xl">🌊</span>
               </div>
               <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full animate-pulse flex items-center justify-center">
                 <span className="text-white text-xs">✨</span>
               </div>
             </div>
           </div>
           <h1 className="text-3xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-red-300 to-purple-400 mb-3">
             SoulStream Portal
           </h1>
           <p className="text-lg sm:text-xl text-gray-300 mb-2">
             🌟 Feed Your Souls to the Eternal Stream 🌟
           </p>
           <p className="text-sm sm:text-base text-gray-400 mb-1">
             Drag and drop video files or click to select. Supported formats: MP4, MKV, AVI, MOV, WebM
           </p>
           <p className="text-xs sm:text-sm text-gray-500">
             Where souls flow through eternity • Background uploads • Pause/Resume anytime
           </p>
         </div>

      {/* Upload Zone */}
      <div
        className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="relative z-10">
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <CloudArrowUpIcon className="h-16 w-16 sm:h-20 sm:w-20 text-red-400 animate-bounce" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-purple-500 rounded-full animate-pulse opacity-60"></div>
              </div>
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-300 to-purple-300 mb-3">
            🌊 Soul Portal Awaits 🌊
          </p>
          <p className="text-base sm:text-lg font-medium text-gray-200 mb-2">
            Drop your souls here to join the eternal stream
          </p>
          <p className="text-sm text-gray-400 mb-3">
            Or click to select from your collection
          </p>
          <div className="flex items-center justify-center space-x-4 text-xs text-gray-500">
            <span>🎬 Up to 4GB</span>
            <span>⏸️ Pause/Resume</span>
            <span>📱 Background Support</span>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Upload Progress */}
              {uploads.length > 0 && (
          <div className="mt-8 sm:mt-12">
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-purple-400 to-red-400 mb-2">
                🌊 Souls Flowing Through Eternity 🌊
              </h2>
              <p className="text-sm text-gray-400">
                {uploads.length} soul{uploads.length !== 1 ? 's' : ''} in the stream
              </p>
            </div>
          <div className="space-y-3 sm:space-y-4">
            {uploads.map((upload) => (
              <div key={upload.id} className="card p-3 sm:p-4">
                                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start space-x-2 sm:space-x-3 flex-1 min-w-0">
                      <FilmIcon className="h-5 w-5 sm:h-6 sm:w-6 text-red-400 mt-1 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-gray-100 text-sm sm:text-base truncate">
                          {upload.movieInfo?.title || upload.file.name}
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-400 flex flex-wrap">
                          <span>{formatFileSize(upload.file.size)}</span>
                          <span className="mx-1">•</span>
                          <span>{getStatusText(upload.status)}</span>
                        </p>
                        {upload.movieInfo?.year && (
                          <p className="text-xs sm:text-sm text-gray-500">
                            Year: {upload.movieInfo.year}
                          </p>
                        )}
                      </div>
                    </div>

                  <div className="flex items-center space-x-2">
                    {upload.status === 'error' ? (
                      <button
                        onClick={() => removeUpload(upload.id)}
                        className="text-gray-400 hover:text-gray-200 flex-shrink-0 p-1"
                        title="Remove failed upload"
                      >
                        <XMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                      </button>
                    ) : upload.status === 'uploading' ? (
                      <>
                        <button
                          onClick={() => pauseUpload(upload.id)}
                          className="text-yellow-400 hover:text-yellow-300 flex-shrink-0 p-1"
                          title="Pause upload"
                        >
                          <PauseIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                        </button>
                        <button
                          onClick={() => cancelUpload(upload.id)}
                          className="text-red-400 hover:text-red-300 flex-shrink-0 p-1"
                          title="Cancel upload"
                        >
                          <XMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                        </button>
                      </>
                    ) : upload.status === 'paused' ? (
                      <>
                        <button
                          onClick={() => resumeUpload(upload.id)}
                          className="text-green-400 hover:text-green-300 flex-shrink-0 p-1"
                          title="Resume upload"
                        >
                          <PlayIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                        </button>
                        <button
                          onClick={() => cancelUpload(upload.id)}
                          className="text-red-400 hover:text-red-300 flex-shrink-0 p-1"
                          title="Cancel upload"
                        >
                          <XMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                        </button>
                      </>
                    ) : upload.status === 'starting' ? (
                      <button
                        onClick={() => cancelUpload(upload.id)}
                        className="text-red-400 hover:text-red-300 flex-shrink-0 p-1"
                        title="Cancel upload"
                      >
                        <XMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="progress-bar mb-2">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${Math.max(0, Math.min(100, upload.progress))}%` }}
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs sm:text-sm space-y-1 sm:space-y-0">
                  <span className={getStatusColor(upload.status)}>
                    {upload.progress > 0 ? `${Math.round(upload.progress)}%` : '0%'}
                  </span>
                  
                  {upload.error && (
                    <span className="text-red-400 text-xs break-words">
                      🌊 Stream interrupted: {upload.error}
                    </span>
                  )}
                  
                  {upload.status === 'processing' && (
                    <span className="text-purple-400 text-xs">
                      ✨ Soul being integrated into the eternal stream... This may take several minutes.
                    </span>
                  )}

                  {upload.status === 'paused' && (
                    <span className="text-yellow-400 text-xs">
                      ⏸️ Soul flow paused - Click to resume the eternal journey
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Upload