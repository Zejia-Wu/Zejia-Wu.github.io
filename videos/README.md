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
`mcp`, `direct`, and `swe` are ready; `c2w` intentionally remains an empty
placeholder for now. `minimax` and `wan` are not part of the survey.

The page reads `window.USER_STUDY_CONFIG.videoBaseUrl` from
`user_study/config.js`. The published study uses a public COS object-storage
prefix; for local testing, it can be changed to `../videos/`. Upload the same
directory structure to the bucket and keep the large MP4 files out of the Git
history.
