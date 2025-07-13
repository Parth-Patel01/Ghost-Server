import { useState, useRef } from 'react'
import { CloudArrowUpIcon, FilmIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { uploadAPI } from '../utils/api'

const Upload = () => {
  const [uploads, setUploads] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)

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
      error: null
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

    updateUpload(uploadId, { chunks })

    // Upload chunks with limited concurrency
    const concurrency = 3
    const uploadPromises = []

    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency)
      const batchPromises = batch.map(chunk => uploadChunk(uploadId, sessionId, chunk))
      
      try {
        await Promise.all(batchPromises)
      } catch (error) {
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
    } catch (error) {
      throw error
    }
  }

  const uploadChunk = async (uploadId, sessionId, chunk, retryCount = 0) => {
    try {
      await uploadAPI.uploadChunk(
        sessionId,
        chunk.index,
        chunk.data,
        (progressEvent) => {
          if (progressEvent.lengthComputable) {
            updateChunkProgress(uploadId, chunk.index, progressEvent.loaded, progressEvent.total)
          }
        }
      )

      markChunkUploaded(uploadId, chunk.index)
    } catch (error) {
      // Handle rate limiting with retry
      if (error.response?.status === 429 && retryCount < 3) {
        console.log(`Rate limited, retrying chunk ${chunk.index} (attempt ${retryCount + 1})`)
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000))
        return uploadChunk(uploadId, sessionId, chunk, retryCount + 1)
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

    try {
      await uploadAPI.cancelUpload(upload.sessionId)
      console.log(`Upload cancelled: ${uploadId}`)
    } catch (error) {
      console.error('Error cancelling upload:', error)
    }
    
    removeUpload(uploadId)
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
      case 'uploading': return 'text-blue-600'
      case 'processing': return 'text-yellow-600'
      case 'error': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'starting': return 'Starting...'
      case 'uploading': return 'Uploading'
      case 'processing': return 'Processing'
      case 'error': return 'Error'
      default: return 'Unknown'
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Upload Movies</h1>
        <p className="text-sm sm:text-base text-gray-600">
          Drag and drop video files or click to select. Supported formats: MP4, MKV, AVI, MOV, WebM
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
        <CloudArrowUpIcon className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mb-3 sm:mb-4" />
        <p className="text-base sm:text-lg font-medium text-gray-700 mb-2 px-2">
          Drop video files here, or click to select
        </p>
        <p className="text-xs sm:text-sm text-gray-500 px-2">
          Maximum file size: 4GB per file
        </p>
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
        <div className="mt-6 sm:mt-8">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">Upload Progress</h2>
          <div className="space-y-3 sm:space-y-4">
            {uploads.map((upload) => (
              <div key={upload.id} className="card p-3 sm:p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-2 sm:space-x-3 flex-1 min-w-0">
                    <FilmIcon className="h-5 w-5 sm:h-6 sm:w-6 text-primary-600 mt-1 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-gray-900 text-sm sm:text-base truncate">
                        {upload.movieInfo?.title || upload.file.name}
                      </h3>
                      <p className="text-xs sm:text-sm text-gray-500 flex flex-wrap">
                        <span>{formatFileSize(upload.file.size)}</span>
                        <span className="mx-1">•</span>
                        <span>{getStatusText(upload.status)}</span>
                      </p>
                      {upload.movieInfo?.year && (
                        <p className="text-xs sm:text-sm text-gray-400">
                          Year: {upload.movieInfo.year}
                        </p>
                      )}
                    </div>
                  </div>

                  {upload.status === 'error' ? (
                    <button
                      onClick={() => removeUpload(upload.id)}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-1"
                      title="Remove failed upload"
                    >
                      <XMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  ) : (upload.status === 'uploading' || upload.status === 'starting') ? (
                    <button
                      onClick={() => cancelUpload(upload.id)}
                      className="text-red-400 hover:text-red-600 flex-shrink-0 p-1"
                      title="Cancel upload"
                    >
                      <XMarkIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  ) : null}
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
                    <span className="text-red-600 text-xs break-words">
                      {upload.error}
                    </span>
                  )}
                  
                  {upload.status === 'processing' && (
                    <span className="text-yellow-600 text-xs">
                      Processing video... This may take several minutes.
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