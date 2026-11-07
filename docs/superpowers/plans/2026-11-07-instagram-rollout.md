# Instagram rollout plan

Started 2026-11-06. The code is built. What's left is setting it up and going live. Tick the boxes as each step is done, and record progress in `../PROJECT_LOG.md`.

## Where things stand

- The code is on branch `instagram` (commit `b8316bd`), pushed to GitHub, not merged or deployed. That branch was made from `staff-tools`, which isn't merged either.
- The CoversBee Instagram account is already a Business account (confirmed by the user 2026-11-06).
- Nothing has been tried against the real Instagram API yet. Migration 0015 hasn't been run anywhere, because there's no Docker on the development machine.
- There's no Vercel, Supabase or GitHub (`gh`) command-line tool on this machine, so the steps below are done in the dashboards.

## Steps to go live

### 1. Create the Meta app (user, in the browser)

Meta changes its screens often, so the labels may differ a little.

- [ ] Go to developers.facebook.com/apps, click **Create app** and name it "Coversbee Data". Choose the Instagram use case, something like *Manage messaging & content on Instagram*.
- [ ] Open **Instagram → API setup with Instagram login**.
- [ ] Under **Generate access tokens**, click **Add account** and log in as the CoversBee Instagram account. Accept any tester invite in the Instagram app under Settings → Apps and websites.
- [ ] Under **Business login settings**, add this exact redirect URL and save: `https://coversbee-mail.vercel.app/api/instagram/callback`
- [ ] Check the permissions include `instagram_business_basic` and `instagram_business_manage_insights`.
- [ ] Copy the **Instagram app ID** and **Instagram app secret** (not the Facebook App ID). Never paste the secret into a chat, the log or the repo.

The app can stay in Development mode. It only reads the store's own account, so Meta's app review isn't needed.

### 2. Add the keys in Vercel (user)

- [ ] In Vercel → Settings → Environment Variables, add `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` for Production.

### 3. Create the tables in Supabase (user)

- [ ] In the Supabase dashboard → SQL Editor, run the contents of `supabase/migrations/0015_instagram.sql`. It only adds three tables (`instagram_account`, `instagram_daily`, `instagram_media`).
- [ ] Check that the three tables exist under Table Editor.

### 4. Deploy (user, on GitHub)

- [ ] Open and merge a pull request from `staff-tools` into `master`.
- [ ] Open and merge a pull request from `instagram` into `master`.
- [ ] Wait for Vercel to finish deploying production.

### 5. Connect and check (user and Claude together)

- [ ] On the live site, open Social → Instagram and click **Connect Instagram**.
- [ ] The first sync starts by itself. It reads up to 89 days and may need a second click of **Sync Instagram** to finish.
- [ ] Check the follower count and a few posts against the Instagram app.
- [ ] If any figure is always empty or a sync error shows, check these first:
  - the API version in `lib/instagram/client.ts` (`v27.0`)
  - the metric names (`ACCOUNT_METRICS`, `MEDIA_METRICS`)
  - whether `/me` returns `user_id`
- [ ] Confirm that the Blanxer sidebar sync also saves a follower count on the next day the app is used.

## Later

- **TikTok:** next after Instagram. It needs a TikTok developer app with Login Kit and the Display API, privacy policy and terms URLs, and TikTok's app review, which can take days to weeks. Their sandbox mode lets us build before approval. It would follow the same pattern: a `/social/tiktok` page and daily snapshot tables.
- **Instagram follow-ups to consider once data is flowing:** follower demographics (age, city, gender), stories, and orders in the days after each post.
