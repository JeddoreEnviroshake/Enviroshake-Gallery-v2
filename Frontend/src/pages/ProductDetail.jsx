import React from 'react'
import { useParams, Link } from 'react-router-dom'

const products = [
  {
    id: 2,
    name: 'Enviroshingle',
    image: '/assets/product2.jpg',
    description: 'A durable alternative to traditional shingles.'
  },
  {
    id: 3,
    name: 'Enviroslate',
    image: '/assets/product3.jpg',
    description: 'Modern composite slate for elegant roofing.'
  }
]

const ProductDetail = () => {
  const { id } = useParams()
  const product = products.find(p => p.id === parseInt(id))

  if (!product) {
    return (
      <div className="p-6 text-red-600 font-semibold">
        Product not found.
        <br />
        <Link to="/gallery" className="text-blue-600 underline">← Back to Gallery</Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link to="/gallery" className="text-blue-600 hover:underline block mb-4">← Back to Gallery</Link>

      <img
        src={product.image}
        alt={product.name}
        className="w-full h-64 object-cover rounded-xl shadow mb-6"
      />

      <h1 className="text-3xl font-bold text-gray-800">{product.name}</h1>
      <p className="mt-4 text-gray-700 text-base leading-relaxed">{product.description}</p>
    </div>
  )
}

export default ProductDetail
