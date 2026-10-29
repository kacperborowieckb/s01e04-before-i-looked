# Review HTML export and publication

This is a preparation workflow; do not send a preview until the review and publication steps
have actually been completed. The exporter fetches the server-rendered page directly: no browser
save-as, no client JavaScript, and no preview HTML is checked into this repository.

## Initial copy (with the lane marker)

1. Start the local rig with the intended marker in `.env`:

   ```sh
   pnpm start
   ```

   Keep the server running. `.env` is local-only and must never be copied or published.

2. Create a private folder outside this worktree (for example, `/tmp/rig-review`) and export
   the standalone page to it. With the server on the default address, the exact command is:

   ```sh
   node scripts/export-preview.mjs /tmp/rig-review/index.html
   ```

   To use another loopback listener, pass its base URL as the second argument. The command
   accepts only loopback HTTP(S) sources and absolute output paths outside this worktree. Its
   stdout contains only the output path and byte count.

3. Publish only that folder's `index.html` using the team's approved Vercel project, for example
   from the private folder with the Vercel CLI:

   ```sh
   cd /tmp/rig-review
   vercel --prod
   ```

   Use the project's stable production URL, not a one-off preview URL. Verify the public HTTPS
   URL displays the expected initial copy. Send the reviewer the link and repository
   (`kacperborowieckb/s01e04-before-i-looked`) for review. Do not put the HTML, marker, secrets,
   or credentials in git, issues, or chat.

4. Wait for the review and obtain separate human approval before removing the marker. Review
   completion alone is not approval to clean up or publish a changed copy.

## Remove the marker after approval

1. Restart rig with `LANE_MARKER` explicitly empty. This overrides a value loaded from `.env`:

   ```sh
   LANE_MARKER='' pnpm start
   ```

   Alternatively, run with the marker unset and without loading `.env`. Confirm the rendered
   page says **“no marker set”** before exporting.

2. Export over the same private file:

   ```sh
   node scripts/export-preview.mjs /tmp/rig-review/index.html
   ```

3. Upload the replacement `index.html` to the same Vercel project and production URL. Verify
   that the public page says “no marker set” and no longer contains the lane marker. Remove the
   old marker-bearing public deployment/copy after the replacement is verified. Keep preview
   HTML out of git, issues, and chat throughout.
