import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the local DB engine out of the server bundle so its WASM/asset
  // paths resolve at runtime. (In prod we use postgres-js against Supabase.)
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
