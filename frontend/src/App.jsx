import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Upload from './pages/Upload'
import Library from './pages/Library'
import Player from './pages/Player'
import './index.css'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-black flex flex-col md:flex-row">
        {/* Sidebar for desktop/TV, Top navbar for mobile */}
        <Navbar />
        <div className="flex-1 flex flex-col min-h-screen">
          {/* Main content area */}
          <main className="flex-1 max-w-7xl mx-auto w-full px-2 sm:px-4 lg:px-8 py-8">
            <Routes>
              <Route path="/" element={<Library />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/player/:movieId" element={<Player />} />
            </Routes>
          </main>
          {/* Footer will be added here later */}
        </div>
      </div>
    </Router>
  )
}

export default App