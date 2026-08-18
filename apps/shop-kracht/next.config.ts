import type { NextConfig } from 'next'

const config: NextConfig = {
  // Photography lives in the shared assets folder and is symlinked into public/.
  outputFileTracingRoot: import.meta.dirname,
}

export default config
