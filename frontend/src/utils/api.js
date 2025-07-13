import axios from 'axios'

const API_BASE_URL = '/api'

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

// Request interceptor for logging
api.interceptors.request.use((config) => {
  console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`)
  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

// Upload functions
export const uploadAPI = {
  // Start upload session
  startUpload: async (filename, fileSize, chunkSize = 1024 * 1024) => {
    const response = await api.post('/upload/start', {
      filename,
      fileSize,
      chunkSize
    })
    return response.data
  },

  // Upload chunk
  uploadChunk: async (sessionId, chunkIndex, chunkData, onProgress) => {
    const formData = new FormData()
    formData.append('sessionId', sessionId)
    formData.append('chunkIndex', chunkIndex.toString())
    formData.append('chunk', chunkData)

    const response = await api.post('/upload/chunk', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: onProgress
    })
    return response.data
  },

  // Complete upload
  completeUpload: async (sessionId) => {
    const response = await api.post('/upload/complete', { sessionId })
    return response.data
  }
}

// Movies functions
export const moviesAPI = {
  // Get all movies
  getMovies: async (status = null) => {
    const params = status ? { status } : {}
    const response = await api.get('/movies', { params })
    return response.data
  },

  // Get single movie
  getMovie: async (id) => {
    const response = await api.get(`/movies/${id}`)
    return response.data
  },

  // Delete movie
  deleteMovie: async (id) => {
    const response = await api.delete(`/movies/${id}`)
    return response.data
  }
}

// Server status
export const serverAPI = {
  getStatus: async () => {
    const response = await api.get('/status')
    return response.data
  }
}

export default api