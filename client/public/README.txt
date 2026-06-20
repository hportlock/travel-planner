PWA icons required
==================

The web app manifest (see vite.config.ts) references two PNG icons that are NOT
yet present in this folder. Add real PNG files here before shipping:

  - icon-192.png  (192x192, purpose "any maskable")
  - icon-512.png  (512x512, purpose "any maskable")

Until these exist, the install/PWA experience will show a missing-icon warning
but the app still runs. Generate them from your trip/brand mark (warm coral
postcard theme, background #fbf1dd, accent #ff8a5b).
