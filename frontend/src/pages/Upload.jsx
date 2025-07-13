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
      updateUpload(uploadId, {
        status: 'error',
        error: error.response?.data?.error || error.message
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

  const uploadChunk = async (uploadId, sessionId, chunk) => {
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Movies</h1>
        <p className="text-gray-600">
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
        <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-700 mb-2">
          Drop video files here, or click to select
        </p>
        <p className="text-sm text-gray-500">
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
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Progress</h2>
          <div className="space-y-4">
            {uploads.map((upload) => (
              <div key={upload.id} className="card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3">
                    <FilmIcon className="h-6 w-6 text-primary-600 mt-1" />
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {upload.movieInfo?.title || upload.file.name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(upload.file.size)} • {getStatusText(upload.status)}
                      </p>
                      {upload.movieInfo?.year && (
                        <p className="text-sm text-gray-400">
                          Year: {upload.movieInfo.year}
                        </p>
                      )}
                    </div>
                  </div>

                  {upload.status === 'error' ? (
                    <button
                      onClick={() => removeUpload(upload.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <XMarkIcon className="h-5 w-5" />
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

                <div className="flex justify-between items-center text-sm">
                  <span className={getStatusColor(upload.status)}>
                    {upload.progress > 0 ? `${Math.round(upload.progress)}%` : '0%'}
                  </span>
                  
                  {upload.error && (
                    <span className="text-red-600 text-xs">
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