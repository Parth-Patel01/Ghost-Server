import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Upload from './pages/Upload'
import Library from './pages/Library'
import Player from './pages/Player'
import './index.css'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/player/:movieId" element={<Player />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App