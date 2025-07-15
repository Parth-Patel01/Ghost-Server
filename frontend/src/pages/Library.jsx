import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PlayIcon, ClockIcon, TrashIcon, CalendarIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { moviesAPI } from '../utils/api'

const getContinueWatching = (movies) => {
  try {
    const progress = JSON.parse(localStorage.getItem('soulstream_progress') || '{}')
    return movies.filter(movie => {
      const p = progress[movie.id]
      if (!p || !movie.duration) return false
      const percent = p.currentTime / (p.duration || movie.duration)
      return percent > 0.01 && percent < 0.9 && movie.status === 'ready'
    }).map(movie => {
      const p = progress[movie.id]
      return {
        ...movie,
        resumeTime: p.currentTime,
        resumePercent: Math.min(100, Math.round((p.currentTime / (p.duration || movie.duration)) * 100))
      }
    })
  } catch {
    return []
  }
}

const getHeroMovie = (movies) => {
  return movies.filter(m => m.status === 'ready').sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))[0] || null
}

const Library = () => {
  const [movies, setMovies] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    loadMovies()
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

  const continueWatching = useMemo(() => getContinueWatching(movies), [movies])
  const heroMovie = useMemo(() => getHeroMovie(movies), [movies])
  
  const filteredMovies = useMemo(() => {
    return movies.filter(movie => 
      movie.status === 'ready' && 
      movie.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [movies, searchQuery])

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error}</p>
        <button 
          onClick={loadMovies}
          className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero Section */}
      {heroMovie && (
        <div className="relative w-full h-[60vh] md:h-[70vh] lg:h-[80vh] flex flex-col justify-end overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 z-0">
            {heroMovie.posterUrl ? (
              <img src={heroMovie.posterUrl} alt={heroMovie.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-b from-gray-900 to-black" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
          </div>
          
          {/* Content */}
          <div className="relative z-10 px-4 sm:px-8 lg:px-16 pb-8 md:pb-16">
            <div className="max-w-4xl">
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold mb-4 drop-shadow-lg">
                {heroMovie.title}
              </h1>
              <div className="flex items-center gap-4 mb-4 text-sm md:text-base">
                <span className="text-green-400 font-semibold">98% Match</span>
                <span>{heroMovie.year || '2023'}</span>
                <span>{heroMovie.duration ? formatDuration(heroMovie.duration) : '2h 15m'}</span>
                <span className="border border-gray-400 px-1 text-xs">HD</span>
              </div>
              <p className="text-sm md:text-lg text-gray-300 mb-6 max-w-2xl">
                {heroMovie.description || 'A compelling story that will keep you on the edge of your seat.'}
              </p>
              <div className="flex gap-3">
                <Link 
                  to={`/player/${heroMovie.id}`} 
                  className="flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <PlayIcon className="w-5 h-5" />
                  Play
                </Link>
                <button className="flex items-center gap-2 px-6 py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                  More Info
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="px-4 sm:px-8 lg:px-16 py-6">
        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="Search movies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 bg-gray-900 text-white border border-gray-700 rounded-lg focus:outline-none focus:border-white"
          />
          <MagnifyingGlassIcon className="absolute right-3 top-3.5 h-5 w-5 text-gray-400" />
        </div>
      </div>

      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <div className="px-4 sm:px-8 lg:px-16 mb-8">
          <h2 className="text-xl md:text-2xl font-semibold mb-4">Continue Watching</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {continueWatching.map(movie => (
              <div key={movie.id} className="group relative">
                <Link to={`/player/${movie.id}?resume=1`}>
                  <div className="aspect-[2/3] bg-gray-800 rounded-lg overflow-hidden relative">
                    {movie.posterUrl ? (
                      <img src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full bg-gray-800">
                        <PlayIcon className="h-12 w-12 text-gray-400" />
                      </div>
                    )}
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-700">
                      <div className="h-full bg-white" style={{ width: `${movie.resumePercent}%` }} />
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 mt-2 truncate">{movie.title}</p>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Movies */}
      <div className="px-4 sm:px-8 lg:px-16 mb-8">
        <h2 className="text-xl md:text-2xl font-semibold mb-4">
          {searchQuery ? `Search Results for "${searchQuery}"` : 'All Movies'}
        </h2>
        
        {filteredMovies.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">
              {searchQuery ? 'No movies found matching your search.' : 'No movies available yet.'}
            </p>
            {!searchQuery && (
              <Link 
                to="/upload" 
                className="inline-block mt-4 px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
              >
                Upload Your First Movie
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredMovies.map((movie) => (
              <div key={movie.id} className="group relative">
                <div className="aspect-[2/3] bg-gray-800 rounded-lg overflow-hidden relative">
                  {movie.posterUrl ? (
                    <img
                      src={movie.posterUrl}
                      alt={movie.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full bg-gray-800">
                      <PlayIcon className="h-12 w-12 text-gray-400" />
                    </div>
                  )}

                  {/* Play overlay */}
                  <Link
                    to={`/player/${movie.id}`}
                    className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                  >
                    <PlayIcon className="h-8 w-8 text-white" />
                  </Link>

                  {/* Delete button */}
                  <button
                    onClick={() => deleteMovie(movie.id)}
                    className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-opacity-75"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2">
                  <h3 className="font-medium text-white truncate text-sm" title={movie.title}>
                    {movie.title}
                  </h3>
                  
                  <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
                    {movie.year && (
                      <div className="flex items-center">
                        <CalendarIcon className="h-3 w-3 mr-1" />
                        {movie.year}
                      </div>
                    )}
                    
                    {movie.duration && (
                      <div className="flex items-center">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        {formatDuration(movie.duration)}
                      </div>
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

export default Library