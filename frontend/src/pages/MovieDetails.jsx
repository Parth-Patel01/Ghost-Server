import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
    PlayIcon,
    ArrowLeftIcon,
    ClockIcon,
    CalendarIcon,
    StarIcon,
    UserGroupIcon,
    FilmIcon
} from '@heroicons/react/24/outline'
import { moviesAPI } from '../utils/api'

const MovieDetails = () => {
    const { movieId } = useParams()
    const navigate = useNavigate()
    const [movie, setMovie] = useState(null)
    const [movieDetails, setMovieDetails] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        loadMovie()
    }, [movieId])

    const loadMovie = async () => {
        try {
            const data = await moviesAPI.getMovie(movieId)
            setMovie(data)

            // Fetch additional movie details from free API
            if (data.title) {
                await fetchMovieDetails(data.title, data.year)
            }

            setError(null)
        } catch (err) {
            console.error('Failed to load movie:', err)
            setError('Failed to load movie')
        } finally {
            setLoading(false)
        }
    }

    const fetchMovieDetails = async (title, year) => {
        try {
            // Using a free movie database API
            const searchQuery = year ? `${title} ${year}` : title
            const response = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=1b5adf76a72c13da98fb8e091c24305&query=${encodeURIComponent(searchQuery)}&language=en-US&page=1&include_adult=false`)

            if (response.ok) {
                const data = await response.json()
                if (data.results && data.results.length > 0) {
                    const movie = data.results[0]

                    // Fetch additional details for the movie
                    const detailsResponse = await fetch(`https://api.themoviedb.org/3/movie/${movie.id}?api_key=1b5adf76a72c13da98fb8e091c24305&language=en-US&append_to_response=credits`)

                    if (detailsResponse.ok) {
                        const details = await detailsResponse.json()
                        setMovieDetails({
                            ...movie,
                            ...details,
                            poster_path: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                            backdrop_path: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null
                        })
                    } else {
                        setMovieDetails(movie)
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch movie details:', err)
            // Don't set error here as it's optional
        }
    }

    const formatDuration = (seconds) => {
        if (!seconds) return 'Unknown'
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    }

    const formatRating = (rating) => {
        if (!rating || rating === 'N/A') return null
        return parseFloat(rating)
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
        )
    }

    if (error || !movie) {
        return (
            <div className="text-center py-12">
                <p className="text-red-400 mb-4">{error || 'Movie not found'}</p>
                <button
                    onClick={() => navigate('/')}
                    className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                >
                    Back to Library
                </button>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Back Button */}
            <div className="px-4 sm:px-8 lg:px-16 py-4">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                    <ArrowLeftIcon className="h-5 w-5" />
                    Back to Library
                </button>
            </div>

            <div className="px-4 sm:px-8 lg:px-16 pb-8">
                <div className="max-w-6xl mx-auto">
                    {/* Movie Header */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                        {/* Poster */}
                        <div className="lg:col-span-1">
                            <div className="aspect-[2/3] bg-gray-800 rounded-lg overflow-hidden">
                                {movie.posterUrl ? (
                                    <img
                                        src={movie.posterUrl}
                                        alt={movie.title}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center w-full h-full bg-gray-800">
                                        <FilmIcon className="h-24 w-24 text-gray-400" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Movie Info */}
                        <div className="lg:col-span-2">
                            <h1 className="text-3xl md:text-4xl font-bold mb-4">{movie.title}</h1>

                            {/* Basic Info */}
                            <div className="flex flex-wrap items-center gap-4 mb-6 text-sm">
                                {movie.year && (
                                    <div className="flex items-center gap-1">
                                        <CalendarIcon className="h-4 w-4" />
                                        {movie.year}
                                    </div>
                                )}
                                {movie.duration && (
                                    <div className="flex items-center gap-1">
                                        <ClockIcon className="h-4 w-4" />
                                        {formatDuration(movie.duration)}
                                    </div>
                                )}
                                <span className="border border-gray-400 px-2 py-1 text-xs rounded">HD</span>
                            </div>

                            {/* Enhanced Details from API */}
                            {movieDetails && (
                                <div className="space-y-4 mb-6">
                                    {/* Rating */}
                                    {movieDetails.vote_average && (
                                        <div className="flex items-center gap-2">
                                            <StarIcon className="h-5 w-5 text-yellow-400" />
                                            <span className="font-semibold">{movieDetails.vote_average.toFixed(1)}/10</span>
                                            <span className="text-gray-400">({movieDetails.vote_count} votes)</span>
                                        </div>
                                    )}

                                    {/* Genre */}
                                    {movieDetails.genres && movieDetails.genres.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {movieDetails.genres.map((genre, index) => (
                                                <span key={index} className="px-3 py-1 bg-gray-800 rounded-full text-sm">
                                                    {genre.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Director */}
                                    {movieDetails.credits && movieDetails.credits.crew && (
                                        <div>
                                            <span className="text-gray-400">Director: </span>
                                            <span>
                                                {movieDetails.credits.crew
                                                    .filter(person => person.job === 'Director')
                                                    .map(person => person.name)
                                                    .join(', ')}
                                            </span>
                                        </div>
                                    )}

                                    {/* Cast */}
                                    {movieDetails.credits && movieDetails.credits.cast && movieDetails.credits.cast.length > 0 && (
                                        <div>
                                            <span className="text-gray-400">Cast: </span>
                                            <span>
                                                {movieDetails.credits.cast.slice(0, 5).map(person => person.name).join(', ')}
                                                {movieDetails.credits.cast.length > 5 && '...'}
                                            </span>
                                        </div>
                                    )}

                                    {/* Plot */}
                                    {movieDetails.overview && (
                                        <p className="text-gray-300 leading-relaxed">{movieDetails.overview}</p>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons - Netflix Style */}
                            <div className="flex gap-4">
                                {/* Check if user has watched this movie before */}
                                {(() => {
                                    const watchProgress = localStorage.getItem(`watch_progress_${movie.id}`)
                                    const hasWatched = watchProgress && JSON.parse(watchProgress).watched

                                    return hasWatched ? (
                                        <Link
                                            to={`/player/${movie.id}`}
                                            className="flex items-center gap-2 px-8 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                                        >
                                            <PlayIcon className="w-5 h-5" />
                                            Resume
                                        </Link>
                                    ) : (
                                        <Link
                                            to={`/player/${movie.id}`}
                                            className="flex items-center gap-2 px-8 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                                        >
                                            <PlayIcon className="w-5 h-5" />
                                            Play Now
                                        </Link>
                                    )
                                })()}

                                <button className="flex items-center gap-2 px-8 py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                                    <UserGroupIcon className="w-5 h-5" />
                                    Watch with Friends
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Additional Details */}
                    {movieDetails && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {movieDetails.original_language && (
                                <div className="bg-gray-900 p-4 rounded-lg">
                                    <h3 className="text-gray-400 text-sm mb-2">Language</h3>
                                    <p className="uppercase">{movieDetails.original_language}</p>
                                </div>
                            )}

                            {movieDetails.production_countries && movieDetails.production_countries.length > 0 && (
                                <div className="bg-gray-900 p-4 rounded-lg">
                                    <h3 className="text-gray-400 text-sm mb-2">Country</h3>
                                    <p>{movieDetails.production_countries.map(country => country.name).join(', ')}</p>
                                </div>
                            )}

                            {movieDetails.release_date && (
                                <div className="bg-gray-900 p-4 rounded-lg">
                                    <h3 className="text-gray-400 text-sm mb-2">Release Date</h3>
                                    <p>{new Date(movieDetails.release_date).toLocaleDateString()}</p>
                                </div>
                            )}

                            {movieDetails.budget && movieDetails.budget > 0 && (
                                <div className="bg-gray-900 p-4 rounded-lg">
                                    <h3 className="text-gray-400 text-sm mb-2">Budget</h3>
                                    <p>${(movieDetails.budget / 1000000).toFixed(1)}M</p>
                                </div>
                            )}

                            {movieDetails.revenue && movieDetails.revenue > 0 && (
                                <div className="bg-gray-900 p-4 rounded-lg">
                                    <h3 className="text-gray-400 text-sm mb-2">Revenue</h3>
                                    <p>${(movieDetails.revenue / 1000000).toFixed(1)}M</p>
                                </div>
                            )}

                            {movieDetails.runtime && (
                                <div className="bg-gray-900 p-4 rounded-lg">
                                    <h3 className="text-gray-400 text-sm mb-2">Runtime</h3>
                                    <p>{movieDetails.runtime} minutes</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default MovieDetails 