# User study video assets

The survey page expects each method directory to contain exactly these files:

```text
<video-base>/<method>/01.mp4
<video-base>/<method>/02.mp4
...
<video-base>/<method>/13.mp4
```

The active survey method names are `viga`, `c2w`, `ours`, `direct`, `mcp`, and
`swe`. The local files have been normalized to two-digit names. `viga`, `ours`,
`mcp`, and `swe` are ready; `c2w` and `direct` intentionally remain empty
placeholders for now. `minimax` and `wan` are not part of the survey.

The page reads `window.USER_STUDY_CONFIG.videoBaseUrl` from
`user_study/config.js`. It defaults to `../videos/` for local testing. For the
published study, use a public object-storage prefix such as a Cloudflare R2
custom-domain URL and upload the same directory structure there. Keep the
large MP4 files out of the Git history unless there is a deliberate decision
to publish them with the site.
