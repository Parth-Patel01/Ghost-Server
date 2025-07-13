import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PlayIcon, ClockIcon, TrashIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { moviesAPI } from '../utils/api'

const Library = () => {
  const [movies, setMovies] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState(null)

  useEffect(() => {
    loadMovies()
    // Refresh every 30 seconds to pick up processing updates
    const interval = setInterval(loadMovies, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadMovies = async () => {
    try {
      const data = await moviesAPI.getMovies()
      setMovies(data)
      setError(null)
    } catch (err) {
      console.error('Failed to load movies:', err)
      setError('Failed to load movies')
    } finally {
      setLoading(false)
    }
  }

  const deleteMovie = async (movieId) => {
    if (!confirm('Are you sure you want to delete this movie? This action cannot be undone.')) {
      return
    }

    try {
      await moviesAPI.deleteMovie(movieId)
      setMovies(prev => prev.filter(movie => movie.id !== movieId))
    } catch (err) {
      console.error('Failed to delete movie:', err)
      alert('Failed to delete movie. Please try again.')
    }
  }

  const filteredMovies = movies.filter(movie => {
    if (filter === 'all') return true
    return movie.status === filter
  })

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  const getStatusBadge = (status) => {
    const badges = {
      uploading: 'bg-blue-100 text-blue-800',
      processing: 'bg-yellow-100 text-yellow-800',
      ready: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800'
    }
    
    const labels = {
      uploading: 'Uploading',
      processing: 'Processing',
      ready: 'Ready',
      error: 'Error'
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badges[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button 
          onClick={loadMovies}
          className="btn-primary"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Movie Library</h1>
          <p className="text-gray-600 mt-1">
            {movies.length} movie{movies.length !== 1 ? 's' : ''} in your collection
          </p>
        </div>

        {/* Filter */}
        <div className="flex space-x-2">
          {['all', 'ready', 'processing', 'uploading', 'error'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              {status !== 'all' && (
                <span className="ml-1 text-xs">
                  ({movies.filter(m => m.status === status).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Movies Grid */}
      {filteredMovies.length === 0 ? (
        <div className="text-center py-12">
          <div className="max-w-md mx-auto">
            <PlayIcon className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No movies found</h3>
            <p className="text-gray-500 mb-6">
              {filter === 'all' 
                ? "You haven't uploaded any movies yet. Click the upload button to get started."
                : `No movies with status "${filter}" found.`
              }
            </p>
            {filter === 'all' && (
              <Link to="/upload" className="btn-primary">
                Upload Your First Movie
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {filteredMovies.map((movie) => (
            <div key={movie.id} className="group relative">
              <div className="card overflow-hidden hover:shadow-lg transition-shadow duration-200">
                {/* Poster */}
                <div className="aspect-[2/3] bg-gray-200 relative overflow-hidden">
                  {movie.posterUrl ? (
                    <img
                      src={movie.posterUrl}
                      alt={movie.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextSibling.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  
                  {/* Fallback poster */}
                  <div className={`${movie.posterUrl ? 'hidden' : 'flex'} w-full h-full items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200`}>
                    <PlayIcon className="h-12 w-12 text-primary-600" />
                  </div>

                  {/* Status badge */}
                  <div className="absolute top-2 left-2">
                    {getStatusBadge(movie.status)}
                  </div>

                  {/* Play overlay */}
                  {movie.status === 'ready' && (
                    <Link
                      to={`/player/${movie.id}`}
                      className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                    >
                      <PlayIcon className="h-12 w-12 text-white" />
                    </Link>
                  )}

                  {/* Delete button */}
                  <button
                    onClick={() => deleteMovie(movie.id)}
                    className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-700"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Movie info */}
                <div className="p-3">
                  <h3 className="font-medium text-gray-900 truncate" title={movie.title}>
                    {movie.title}
                  </h3>
                  
                  <div className="flex items-center justify-between mt-1 text-sm text-gray-500">
                    {movie.year && (
                      <div className="flex items-center">
                        <CalendarIcon className="h-4 w-4 mr-1" />
                        {movie.year}
                      </div>
                    )}
                    
                    {movie.duration && (
                      <div className="flex items-center">
                        <ClockIcon className="h-4 w-4 mr-1" />
                        {formatDuration(movie.duration)}
                      </div>
                    )}
                  </div>

                  {/* Processing progress for uploading/processing movies */}
                  {(movie.status === 'uploading' || movie.status === 'processing') && (
                    <div className="mt-2">
                      <div className="progress-bar">
                        <div 
                          className="progress-bar-fill animate-pulse-slow"
                          style={{ width: movie.status === 'processing' ? '65%' : '30%' }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {movie.status === 'processing' 
                          ? 'Generating preview and segments...'
                          : 'Uploading...'
                        }
                      </p>
                    </div>
                  )}

                  {/* Error message */}
                  {movie.status === 'error' && movie.error_message && (
                    <p className="text-xs text-red-600 mt-1" title={movie.error_message}>
                      {movie.error_message.length > 50 
                        ? movie.error_message.substring(0, 50) + '...'
                        : movie.error_message
                      }
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Library