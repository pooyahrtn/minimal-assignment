import type { MetadataRoute } from 'next'
import { products } from '../lib/products'

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:4002'

export default function sitemap(): MetadataRoute.Sitemap {
  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${SITE}/product/${product.slug}`,
    changeFrequency: 'weekly',
    priority: product.inStock ? 0.8 : 0.3,
  }))

  return [{ url: `${SITE}/`, changeFrequency: 'daily', priority: 1 }, ...productPages]
}
