import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import NavbarMediaOnly from './components/NavbarMediaOnly'
import MediaOnly from './pages/MediaOnly'
import Player from './pages/Player'
import MovieDetails from './pages/MovieDetails'
import './index.css'

function AppMediaOnly() {
    return (
        <Router>
            <div className="min-h-screen bg-black flex flex-col md:flex-row">
                {/* Sidebar for desktop/TV, Top navbar for mobile */}
                <NavbarMediaOnly />
                <div className="flex-1 flex flex-col min-h-screen">
                    {/* Main content area */}
                    <main className="flex-1 max-w-7xl mx-auto w-full px-2 sm:px-4 lg:px-8 py-8">
                        <Routes>
                            <Route path="/" element={<MediaOnly />} />
                            <Route path="/player/:movieId" element={<Player />} />
                            <Route path="/movie/:movieId" element={<MovieDetails />} />
                        </Routes>
                    </main>
                    {/* Footer will be added here later */}
                </div>
            </div>
        </Router>
    )
}

export default AppMediaOnly 