import { Link, useLocation } from 'react-router-dom'
import { HomeIcon, CloudArrowUpIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import clsx from 'clsx'

const navigation = [
  { name: 'Library', href: '/', icon: HomeIcon },
  { name: 'Upload', href: '/upload', icon: CloudArrowUpIcon },
]

const Navbar = () => {
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen)

  return (
    <>
      {/* Sidebar for md+ screens */}
      <nav className="hidden md:flex flex-col bg-black border-r border-red-900 shadow-2xl w-64 min-h-screen fixed md:static z-30">
        {/* Logo/Brand */}
        <div className="flex items-center px-6 py-8">
          <div className="relative">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-red-600 via-purple-700 to-black rounded-lg shadow-2xl rotate-45 transform">
              <div className="bg-gradient-to-br from-white to-red-200 rounded-full w-7 h-7 flex items-center justify-center -rotate-45 shadow-inner">
                <div className="w-4 h-4 bg-gradient-to-br from-red-500 to-purple-600 rounded-full animate-pulse"></div>
              </div>
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-red-500 to-purple-500 rounded-full animate-bounce opacity-80"></div>
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
          </div>
          <div className="ml-3">
            <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-red-200 to-purple-300">
              SoulStream
            </span>
            <div className="text-xs text-gray-400 -mt-1">Where souls flow</div>
          </div>
        </div>
        {/* Nav links */}
        <div className="flex-1 flex flex-col space-y-2 px-4">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                className={clsx(
                  'flex items-center px-4 py-3 rounded-lg text-base font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-red-600 to-purple-600 text-white shadow-lg'
                    : 'text-gray-300 hover:text-white hover:bg-gradient-to-r hover:from-gray-800 hover:to-gray-700'
                )}
                tabIndex={0}
              >
                <item.icon className="h-6 w-6 mr-3" />
                {item.name}
              </Link>
            )
          })}
        </div>
        {/* Status indicator at bottom */}
        <div className="px-6 py-6 mt-auto flex items-center text-sm text-gray-300">
          <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
          <span className="text-xs">Souls Flowing</span>
        </div>
      </nav>

      {/* Top navbar for mobile */}
      <nav className="md:hidden bg-black shadow-2xl border-b border-red-900 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo/Brand */}
            <div className="flex items-center group">
              <div className="relative">
                <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-red-600 via-purple-700 to-black rounded-lg shadow-2xl rotate-45 transform">
                  <div className="bg-gradient-to-br from-white to-red-200 rounded-full w-6 h-6 flex items-center justify-center -rotate-45 shadow-inner">
                    <div className="w-3 h-3 bg-gradient-to-br from-red-500 to-purple-600 rounded-full animate-pulse"></div>
                  </div>
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-red-500 to-purple-500 rounded-full animate-bounce opacity-80"></div>
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
              </div>
              <div className="ml-3">
                <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-red-200 to-purple-300">
                  SoulStream
                </span>
              </div>
            </div>
            {/* Mobile menu button */}
            <button
              onClick={toggleMobileMenu}
              className="md:hidden p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gradient-to-r hover:from-red-600 hover:to-purple-600 transition-all duration-200"
            >
              {isMobileMenuOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-2 sm:px-3 border-t border-red-900 bg-gradient-to-b from-black to-gray-900">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={clsx(
                      'flex items-center px-4 py-3 rounded-lg text-base font-medium transition-all duration-200',
                      isActive
                        ? 'bg-gradient-to-r from-red-600 to-purple-600 text-white shadow-lg'
                        : 'text-gray-300 hover:text-white hover:bg-gradient-to-r hover:from-gray-800 hover:to-gray-700'
                    )}
                  >
                    <item.icon className="h-5 w-5 mr-3" />
                    {item.name}
                  </Link>
                )
              })}
              {/* Mobile status indicator */}
              <div className="flex items-center px-4 py-3 text-sm text-gray-300 border-t border-red-900 mt-2 pt-2">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                <span className="text-xs">Souls Flowing</span>
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  )
}

export default Navbar