// vite.config.ts
import legacy from "file:///sessions/bold-dreamy-pascal/mnt/tastyscanner/node_modules/@vitejs/plugin-legacy/dist/index.mjs";
import react from "file:///sessions/bold-dreamy-pascal/mnt/tastyscanner/node_modules/@vitejs/plugin-react/dist/index.js";
import { defineConfig } from "file:///sessions/bold-dreamy-pascal/mnt/tastyscanner/node_modules/vite/dist/node/index.js";
import { checker } from "file:///sessions/bold-dreamy-pascal/mnt/tastyscanner/node_modules/vite-plugin-checker/dist/main.js";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    legacy(),
    checker(
      { typescript: true }
    )
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts"
  },
  resolve: {
    alias: {
      "@tastytrade/api/lib/quote-streamer": "/node_modules/@tastytrade/api/lib/quote-streamer.ts"
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvYm9sZC1kcmVhbXktcGFzY2FsL21udC90YXN0eXNjYW5uZXJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9zZXNzaW9ucy9ib2xkLWRyZWFteS1wYXNjYWwvbW50L3Rhc3R5c2Nhbm5lci92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vc2Vzc2lvbnMvYm9sZC1kcmVhbXktcGFzY2FsL21udC90YXN0eXNjYW5uZXIvdml0ZS5jb25maWcudHNcIjsvLy8gPHJlZmVyZW5jZSB0eXBlcz1cInZpdGVzdFwiIC8+XG5cbmltcG9ydCBsZWdhY3kgZnJvbSAnQHZpdGVqcy9wbHVnaW4tbGVnYWN5J1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCB7Y2hlY2tlcn0gZnJvbSAndml0ZS1wbHVnaW4tY2hlY2tlcidcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIGxlZ2FjeSgpLFxuICAgIGNoZWNrZXIoXG4gICAgICB7IHR5cGVzY3JpcHQ6IHRydWUgfSlcbiAgXSxcbiAgdGVzdDoge1xuICAgIGdsb2JhbHM6IHRydWUsXG4gICAgZW52aXJvbm1lbnQ6ICdqc2RvbScsXG4gICAgc2V0dXBGaWxlczogJy4vc3JjL3NldHVwVGVzdHMudHMnLFxuICB9LFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAdGFzdHl0cmFkZS9hcGkvbGliL3F1b3RlLXN0cmVhbWVyJzogJy9ub2RlX21vZHVsZXMvQHRhc3R5dHJhZGUvYXBpL2xpYi9xdW90ZS1zdHJlYW1lci50cycsXG4gICAgfVxuICB9XG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUVBLE9BQU8sWUFBWTtBQUNuQixPQUFPLFdBQVc7QUFDbEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUSxlQUFjO0FBR3RCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQO0FBQUEsTUFDRSxFQUFFLFlBQVksS0FBSztBQUFBLElBQUM7QUFBQSxFQUN4QjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0osU0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsWUFBWTtBQUFBLEVBQ2Q7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLHNDQUFzQztBQUFBLElBQ3hDO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
