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
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8">
        <div className="mb-4 sm:mb-0">
                     <div className="flex items-center mb-2">
             <div className="relative mr-3">
               <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-red-600 via-purple-700 to-black rounded-lg shadow-2xl rotate-45 transform">
                 <div className="bg-gradient-to-br from-white to-red-200 rounded-full w-6 h-6 flex items-center justify-center -rotate-45 shadow-inner">
                   <div className="w-3 h-3 bg-gradient-to-br from-red-500 to-purple-600 rounded-full animate-pulse"></div>
                 </div>
               </div>
             </div>
            <h1 className="text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-red-300 to-purple-400">
              SoulStream Collection
            </h1>
          </div>
          <p className="text-sm sm:text-base text-gray-300 mt-1">
            {movies.length} soul{movies.length !== 1 ? 's' : ''} flowing through eternity
          </p>
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-2 sm:space-x-2 sm:gap-0">
          {['all', 'ready', 'processing', 'uploading', 'error'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                filter === status
                  ? 'bg-gradient-to-r from-red-600 to-purple-600 text-white shadow-lg'
                  : 'bg-gradient-to-r from-gray-800 to-gray-700 text-gray-300 hover:from-gray-700 hover:to-gray-600 hover:shadow-md'
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
        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            <div className="relative mb-6">
              <PlayIcon className="mx-auto h-20 w-20 text-gray-500 mb-4" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 bg-gradient-to-r from-red-500 to-purple-500 rounded-full animate-pulse opacity-40"></div>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-300 to-purple-300 mb-3">
              The Stream Awaits
            </h3>
            <p className="text-gray-400 mb-8">
              {filter === 'all' 
                ? "🌊 No souls have joined the eternal stream yet. Upload your first soul to begin the journey."
                : `No souls with status "${filter}" found in the stream.`
              }
            </p>
            {filter === 'all' && (
              <Link to="/upload" className="btn-primary inline-flex items-center">
                � <span className="ml-2">Join the Stream</span>
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6">
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
                  <div className={`${movie.posterUrl ? 'hidden' : 'flex'} w-full h-full items-center justify-center bg-gradient-to-br from-gray-800 to-red-900`}>
                    <PlayIcon className="h-8 w-8 sm:h-12 sm:w-12 text-red-400" />
                  </div>

                  {/* Status badge */}
                  <div className="absolute top-1 sm:top-2 left-1 sm:left-2">
                    {getStatusBadge(movie.status)}
                  </div>

                  {/* Play overlay */}
                  {movie.status === 'ready' && (
                    <Link
                      to={`/player/${movie.id}`}
                      className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                    >
                      <PlayIcon className="h-8 w-8 sm:h-12 sm:w-12 text-white" />
                    </Link>
                  )}

                  {/* Delete button */}
                  <button
                    onClick={() => deleteMovie(movie.id)}
                    className="absolute top-1 sm:top-2 right-1 sm:right-2 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-700"
                  >
                    <TrashIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                  </button>
                </div>

                {/* Movie info */}
                <div className="p-2 sm:p-3">
                  <h3 className="font-medium text-gray-100 truncate text-sm sm:text-base" title={movie.title}>
                    {movie.title}
                  </h3>
                  
                  <div className="flex items-center justify-between mt-1 text-xs sm:text-sm text-gray-400">
                    {movie.year && (
                      <div className="flex items-center">
                        <CalendarIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        {movie.year}
                      </div>
                    )}
                    
                    {movie.duration && (
                      <div className="flex items-center">
                        <ClockIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
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
                      <p className="text-xs text-gray-400 mt-1">
                        {movie.status === 'processing' 
                          ? '⚗️ Extracting soul essence...'
                          : '💀 Harvesting soul...'
                        }
                      </p>
                    </div>
                  )}

                  {/* Error message */}
                  {movie.status === 'error' && movie.error_message && (
                    <p className="text-xs text-red-400 mt-1" title={movie.error_message}>
                      💀 {movie.error_message.length > 35 
                        ? movie.error_message.substring(0, 35) + '...'
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