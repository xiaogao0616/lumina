/** @type {import('next').NextConfig} */

// Empty for `next dev` and root-hosted builds; set to "/<repo>" by the Pages workflow.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const nextConfig = {
  output: 'export',
  basePath,
  // GitHub Pages has no rewrite layer, so every route needs its own index.html
  // for direct hits and refreshes to resolve.
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
