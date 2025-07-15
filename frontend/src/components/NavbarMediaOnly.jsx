import { Link, useLocation } from 'react-router-dom'
import { HomeIcon, Bars3Icon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import clsx from 'clsx'

const navigation = [
  { name: 'Movies', href: '/', icon: HomeIcon },
]

const NavbarMediaOnly = () => {
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen)
  const toggleSearch = () => setIsSearchOpen(!isSearchOpen)

  return (
    <>
      {/* Desktop/TV Sidebar */}
      <nav className="hidden md:flex flex-col bg-black border-r border-gray-800 w-64 min-h-screen fixed md:static z-30">
        {/* Logo */}
        <div className="flex items-center px-6 py-8">
          <span className="text-2xl font-bold text-white">SoulStream</span>
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
                    ? 'bg-white text-black'
                    : 'text-gray-300 hover:text-white hover:bg-gray-900'
                )}
                tabIndex={0}
              >
                <item.icon className="h-6 w-6 mr-3" />
                {item.name}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Mobile Top Navbar */}
      <nav className="md:hidden bg-black border-b border-gray-800 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <span className="text-xl font-bold text-white">SoulStream</span>
            </div>

            {/* Search and Menu */}
            <div className="flex items-center space-x-4">
              {/* Search Button */}
              <button
                onClick={toggleSearch}
                className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-all duration-200"
              >
                <MagnifyingGlassIcon className="h-6 w-6" />
              </button>

              {/* Mobile menu button */}
              <button
                onClick={toggleMobileMenu}
                className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-all duration-200"
              >
                {isMobileMenuOpen ? (
                  <XMarkIcon className="h-6 w-6" />
                ) : (
                  <Bars3Icon className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>

          {/* Search Bar */}
          {isSearchOpen && (
            <div className="px-2 pb-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search movies..."
                  className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded-lg focus:outline-none focus:border-white"
                />
                <MagnifyingGlassIcon className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>
          )}

          {/* Mobile Navigation Menu */}
          {isMobileMenuOpen && (
            <div className="md:hidden">
              <div className="px-2 pt-2 pb-3 space-y-2 sm:px-3 border-t border-gray-800 bg-black">
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
                          ? 'bg-white text-black'
                          : 'text-gray-300 hover:text-white hover:bg-gray-900'
                      )}
                    >
                      <item.icon className="h-5 w-5 mr-3" />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  )
}

export default NavbarMediaOnly 