import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  PlayIcon, 
  PauseIcon, 
  SpeakerWaveIcon, 
  SpeakerXMarkIcon,
  ArrowLeftIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon
} from '@heroicons/react/24/outline'
import Hls from 'hls.js'
import { moviesAPI } from '../utils/api'

const Player = () => {
  const { movieId } = useParams()
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [movie, setMovie] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [buffered, setBuffered] = useState(0)

  // Auto-hide controls
  const controlsTimeoutRef = useRef(null)

  useEffect(() => {
    loadMovie()
  }, [movieId])

  useEffect(() => {
    if (movie && videoRef.current) {
      initializePlayer()
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
    }
  }, [movie])

  // Auto-hide controls
  useEffect(() => {
    const resetControlsTimer = () => {
      setShowControls(true)
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
      controlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false)
        }
      }, 3000)
    }

    const handleMouseMove = () => resetControlsTimer()
    const handleKeyDown = () => resetControlsTimer()

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('keydown', handleKeyDown)
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
  }, [isPlaying])

  const loadMovie = async () => {
    try {
      const data = await moviesAPI.getMovie(movieId)
      setMovie(data)
      setError(null)
    } catch (err) {
      console.error('Failed to load movie:', err)
      setError('Failed to load movie')
    } finally {
      setLoading(false)
    }
  }

  const initializePlayer = () => {
    const video = videoRef.current
    if (!video) return

    // Use HLS if available and supported, otherwise fall back to MP4
    const useHLS = movie.streamUrl && Hls.isSupported()
    
    if (useHLS) {
      console.log('Using HLS streaming')
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90
      })
      
      hls.loadSource(movie.streamUrl)
      hls.attachMedia(video)
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest parsed')
      })
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data)
        if (data.fatal) {
          console.log('Fatal HLS error, falling back to MP4')
          fallbackToMP4()
        }
      })
      
      hlsRef.current = hls
    } else {
      console.log('Using direct MP4 playback')
      video.src = movie.downloadUrl
    }

    // Set up video event listeners
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('progress', handleProgress)
    video.addEventListener('play', () => setIsPlaying(true))
    video.addEventListener('pause', () => setIsPlaying(false))
    video.addEventListener('ended', () => setIsPlaying(false))
    video.addEventListener('volumechange', handleVolumeChange)
    
    // Keyboard controls
    document.addEventListener('keydown', handleKeyDown)
  }

  const fallbackToMP4 = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    
    const video = videoRef.current
    if (video && movie.downloadUrl) {
      video.src = movie.downloadUrl
    }
  }

  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (video) {
      setDuration(video.duration)
      setVolume(video.volume)
    }
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (video) {
      setCurrentTime(video.currentTime)
    }
  }

  const handleProgress = () => {
    const video = videoRef.current
    if (video && video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1)
      setBuffered((bufferedEnd / video.duration) * 100)
    }
  }

  const handleVolumeChange = () => {
    const video = videoRef.current
    if (video) {
      setVolume(video.volume)
      setIsMuted(video.muted)
    }
  }

  const handleKeyDown = (e) => {
    switch (e.code) {
      case 'Space':
        e.preventDefault()
        togglePlay()
        break
      case 'ArrowLeft':
        e.preventDefault()
        seek(currentTime - 10)
        break
      case 'ArrowRight':
        e.preventDefault()
        seek(currentTime + 10)
        break
      case 'KeyM':
        e.preventDefault()
        toggleMute()
        break
      case 'KeyF':
        e.preventDefault()
        toggleFullscreen()
        break
    }
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (video) {
      if (video.paused) {
        video.play()
      } else {
        video.pause()
      }
    }
  }

  const seek = (time) => {
    const video = videoRef.current
    if (video) {
      video.currentTime = Math.max(0, Math.min(time, duration))
    }
  }

  const handleProgressClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const newTime = (clickX / rect.width) * duration
    seek(newTime)
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (video) {
      video.muted = !video.muted
    }
  }

  const handleVolumeChange_slider = (e) => {
    const video = videoRef.current
    if (video) {
      const newVolume = parseFloat(e.target.value)
      video.volume = newVolume
      video.muted = newVolume === 0
    }
  }

  const toggleFullscreen = () => {
    const container = videoRef.current?.parentElement
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => {
        setIsFullscreen(true)
      }).catch(console.error)
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false)
      }).catch(console.error)
    }
  }

  const formatTime = (time) => {
    if (!time || !isFinite(time)) return '0:00'
    
    const hours = Math.floor(time / 3600)
    const minutes = Math.floor((time % 3600) / 60)
    const seconds = Math.floor(time % 60)
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !movie) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Movie not found'}</p>
        <Link to="/" className="btn-primary">
          Back to Library
        </Link>
      </div>
    )
  }

  if (movie.status !== 'ready') {
    return (
      <div className="text-center py-12">
        <p className="text-yellow-600 mb-4">
          This movie is still being processed. Please check back later.
        </p>
        <Link to="/" className="btn-primary">
          Back to Library
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Back button */}
      <div className="mb-6">
        <Link 
          to="/" 
          className="inline-flex items-center px-4 py-3 text-sm font-semibold text-gray-300 hover:text-white bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          <span>🌊 Back to SoulStream</span>
        </Link>
      </div>

      {/* Video Player */}
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-auto"
          poster={movie.posterUrl}
          preload="metadata"
          onClick={togglePlay}
        />

        {/* Custom Controls Overlay */}
        <div 
          className={`video-controls transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Progress Bar */}
          <div className="mb-4">
            <div 
              className="relative h-2 bg-gray-600 rounded-full cursor-pointer"
              onClick={handleProgressClick}
            >
              {/* Buffered indicator */}
              <div 
                className="absolute h-full bg-gray-500 rounded-full"
                style={{ width: `${buffered}%` }}
              />
              
              {/* Progress indicator */}
              <div 
                className="absolute h-full bg-primary-600 rounded-full"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
              
              {/* Seek handle */}
              <div 
                className="absolute w-4 h-4 bg-white rounded-full -mt-1 -ml-2 shadow-lg"
                style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="text-white hover:text-primary-400 transition-colors"
              >
                {isPlaying ? (
                  <PauseIcon className="h-8 w-8" />
                ) : (
                  <PlayIcon className="h-8 w-8" />
                )}
              </button>

              {/* Volume */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleMute}
                  className="text-white hover:text-primary-400 transition-colors"
                >
                  {isMuted || volume === 0 ? (
                    <SpeakerXMarkIcon className="h-6 w-6" />
                  ) : (
                    <SpeakerWaveIcon className="h-6 w-6" />
                  )}
                </button>
                
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange_slider}
                  className="w-20 h-1 bg-gray-600 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Time */}
              <div className="text-white text-sm font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Movie title */}
              <div className="text-white text-sm">
                <span className="font-medium">{movie.title}</span>
                {movie.year && <span className="text-gray-300 ml-2">({movie.year})</span>}
              </div>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-primary-400 transition-colors"
              >
                {isFullscreen ? (
                  <ArrowsPointingInIcon className="h-6 w-6" />
                ) : (
                  <ArrowsPointingOutIcon className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        )}
      </div>

      {/* Movie details */}
      <div className="mt-6 bg-white rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{movie.title}</h1>
        <div className="flex items-center space-x-4 text-gray-600">
          {movie.year && <span>{movie.year}</span>}
          {movie.duration && <span>{formatTime(movie.duration)}</span>}
          <span className="capitalize">{movie.status}</span>
        </div>
        
        {/* Keyboard shortcuts help */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 mb-2">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
            <div><kbd className="bg-white px-2 py-1 rounded">Space</kbd> Play/Pause</div>
            <div><kbd className="bg-white px-2 py-1 rounded">←/→</kbd> Seek ±10s</div>
            <div><kbd className="bg-white px-2 py-1 rounded">M</kbd> Mute/Unmute</div>
            <div><kbd className="bg-white px-2 py-1 rounded">F</kbd> Fullscreen</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Player