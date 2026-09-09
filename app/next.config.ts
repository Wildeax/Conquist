import type { NextConfig } from 'next';

const nextConfig: NextConfig = process.env.CONQUIST_TARGET === 'vps'
  ? { output: 'export' }
  : {};

export default nextConfig;
