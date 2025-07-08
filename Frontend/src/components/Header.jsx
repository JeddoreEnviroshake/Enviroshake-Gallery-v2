import React from 'react'
import { Link } from 'react-router-dom'

const Header = () => {
  return (
    <header className="bg-gray-900 text-white px-4 py-3 shadow-md">
      <div className="max-w-6xl mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold">
          <Link to="/">Enviroshake Gallery</Link>
        </h1>
        <nav className="space-x-4">
          <Link to="/" className="hover:text-blue-400">Home</Link>
          <Link to="/gallery" className="hover:text-blue-400">Gallery</Link>
        </nav>
      </div>
    </header>
  )
}

export default Header
