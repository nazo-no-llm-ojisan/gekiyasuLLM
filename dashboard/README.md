# Static dashboard

Almost static UI. **No upstream auth. No data retention. No live API.**

## What it shows

- Demo offerings from `data/sample-feed.json`
- Local proxy URL + roadmap pin (static text in JSON)
- COI tags (`sponsored` / `affiliate`) without ranking boost

## Run

**A. With local proxy (easiest)**

```bash
cd packages/proxy
npm run dev
```

Open: http://127.0.0.1:16191/dashboard/

**B. Any static server**

```bash
cd dashboard
npx --yes serve -p 3333
```

Open: http://127.0.0.1:3333

Edit `data/sample-feed.json` and refresh. That is the whole “backend”.
