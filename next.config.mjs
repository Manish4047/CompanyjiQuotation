/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  // Tree-shake heavy packages that are imported by name from many files.
  // This noticeably trims both cold-start and incremental rebuild time —
  // lucide-react in particular pulls hundreds of icons across the app.
  experimental: {
    optimizePackageImports: ["lucide-react", "@dnd-kit/core", "@dnd-kit/sortable", "recharts"]
  }
};

export default nextConfig;
