import axios from 'axios'

const MEDIA_API_BASE_URL = 'http://localhost:3456/api'

// Create axios instance for media-only server
const mediaApi = axios.create({
  baseURL: MEDIA_API_BASE_URL,
})

// Request interceptor for logging
mediaApi.interceptors.request.use((config) => {
  console.log(`Media API Request: ${config.method?.toUpperCase()} ${config.url}`)
  return config
})

// Response interceptor for error handling
mediaApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Media API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

// Movies functions for media-only server
export const mediaMoviesAPI = {
  // Get all movies
  getMovies: async (status = null) => {
    const params = status ? { status } : {}
    const response = await mediaApi.get('/movies', { params })
    return response.data
  },

  // Search movies
  searchMovies: async (query, status = null) => {
    const params = { q: query }
    if (status) params.status = status
    const response = await mediaApi.get('/movies/search', { params })
    return response.data
  },

  // Get single movie
  getMovie: async (id) => {
    const response = await mediaApi.get(`/movies/${id}`)
    return response.data
  }
}

// Server status for media-only server
export const mediaServerAPI = {
  getStatus: async () => {
    const response = await mediaApi.get('/status')
    return response.data
  }
}

export default mediaApi 