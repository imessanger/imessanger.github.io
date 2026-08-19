# imessenger frontend (PWA)

A no-build-step, plain HTML/CSS/JS Progressive Web App. Deploy the contents of
this folder as a static site on Vercel, Netlify, Cloudflare Pages, etc.

## Configure the backend URL

The app doesn't hardcode a backend URL. On first load, open **Settings**
(from the login screen or the ⚙️ icon once logged in) and enter your deployed
backend's URL, e.g. `https://imessenger-backend.up.railway.app`. This is
saved in `localStorage` on the device, so different installs can point at
different servers.

## Deploying on Vercel

1. `vercel deploy` from this `frontend/` folder (or connect the repo in the
   Vercel dashboard, with this folder as the project root).
2. No build command / framework preset needed — it's a static site
   (Output Directory: `.`).
3. Because it's served over HTTPS with a valid domain, the service worker and
   push notifications will work out of the box.

## Deploying on GitHub Pages

All asset paths are relative, so this works from either a user/org page
(`username.github.io`) or a project page served from a subpath
(`username.github.io/repo-name/`).

1. Put the contents of this `frontend/` folder at the root of the branch
   Pages serves (commonly `main` + `/root`, or a `gh-pages` branch, or a
   `docs/` folder — your choice in the repo's Settings → Pages).
2. The included `.nojekyll` file is already there — it stops GitHub's Jekyll
   build step from interfering with the app's files.
3. Enable Pages in the repo settings and wait for the first deploy; GitHub
   Pages serves over HTTPS automatically, which the service worker and push
   notifications require.
4. Open the deployed URL, go to **Settings**, and set your backend URL —
   same as any other host.

One caveat specific to project pages: if you ever move the site to a
different subpath, uninstall/reinstall the PWA (or clear the old service
worker in devtools) since its registration scope is tied to the path it was
first registered from.

## Notes

- Push notifications require the backend to have VAPID keys configured (see
  backend README) and the site to be served over HTTPS (or `localhost` for
  dev).
- Images are sent as `data:` URIs directly in chat messages — no CDN/object
  storage needed, but keep in mind this makes the database and payloads
  larger than a dedicated file-storage approach. A soft ~3MB cap is enforced
  client- and server-side.
