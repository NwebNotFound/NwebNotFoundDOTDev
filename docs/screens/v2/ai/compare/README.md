# AI panel comparison (Summer v2)

The `*-side.png` images show the unchanged static mockup on the left and the actual
mock-backed panel on the right. All data is from `test/helpers.mjs`; no live account,
profile or service is used. Values below are the first-screen changed-pixel share from
`/opt/data/mockups/tools/compare.py`; they are indicators, not visual quality grades.

| View | 1280 before → after | 390 before → after |
|---|---:|---:|
| Chat | 6.6% → 6.9% | 18.0% → 12.0% |
| Bots | 6.1% → 6.0% | 12.3% → 10.8% |
| Crew | 4.9% → 4.9% | 10.4% → 10.6% |
| Cron | 3.9% → 3.9% | 7.3% → 7.1% |
| Usage | 11.5% → 11.5% | 7.3% → 7.1% |
| Log | 7.4% → 7.5% | 17.9% → 16.1% |

Before the changes the phone approval actions were a tall full-width stack, the
composer had an additional inner frame, avatars sat inside accent badges, Crew titles
were squeezed by long IDs, and the mobile log truncated times and paths while hiding
method and latency. Cards, headings and sidebar also differed from the mockups.
The panel retains real controls, live-derived data and scrolling instead of inventing
mockup-only values: the extra Runs navigation and bots remain, Crew transcripts open
on selection, cron has management actions, and Usage and Log show actual API fields.
The screenshot includes a development-only login and synthetic requests. The mockup
uses placeholder data; time, row count, scrollbar position and fonts can change diffs.
The application scrolls inside its views, so full-page capture shows the viewport, not
all internally scrollable content. In particular the mobile Bots and Usage mockups are
taller than the panel screenshot. `compare.py` compares only their common area; its
“whole” figure does not measure the rest of those mockups.

## Reproduce without weakening the panel CSP

`compare.py` injects an inline style, which the actual panel correctly rejects with
`style-src 'self'`. The harness first captures each real authenticated, mock-backed
panel view at the target size, pausing animations via CSSOM as in the existing
`capture.mjs`. It checks the CSP, no horizontal overflow and mobile approval target
sizes. The unchanged `compare.py` then compares each mockup with a 1:1 local HTML
wrapper displaying the captured panel image. The wrapper is not the running panel;
it exists only so the comparator can add its animation style without changing the
panel or its CSP. Both before and after used this same method. Log data accumulate
in the same six-view order in each run, but timestamps and counts can still vary.

From the repository root, using an empty scratch directory and Docker only:

```sh
SCRATCH="$TMPDIR/ai-panel-compare"
mkdir -p "$SCRATCH/out"
docker run --rm --name hermes-scratch-ai-node-export node:22 \
  tar -cf - -C /usr/local/bin node > "$SCRATCH/node.tar"
tar -cf - ai-panel -C /opt/data/mockups summer-v2 tools/compare.py \
  -C "$SCRATCH" node.tar |
  docker run --rm --name hermes-scratch-ai-compare -i -w /work \
    mcr.microsoft.com/playwright/python:v1.64.1-noble sh -c '
      set -e
      tar -xf -
      tar -xf node.tar
      python3 -m pip install -q pillow playwright==1.64.1 >&2
      mkdir -p out
      cp ai-panel/docs/screens/v2/ai/compare-server.mjs ai-panel/compare-server.mjs
      cd ai-panel
      /work/node compare-server.mjs > /work/out/server.log 2>&1 &
      sleep 3
      cd /work
      python3 ai-panel/docs/screens/v2/ai/compare-capture.py > out/capture.txt
      for pair in chat:AiChat bots:AiBots crew:AiCrew cron:AiCron usage:AiUsage log:AiLog; do
        name=${pair%:*}; mock=${pair#*:}
        python3 tools/compare.py --mockup "/work/summer-v2/$mock.html" \
          --url "file:///work/out/wrapper-$name.html" --name "$name" --out /work/out >> out/diffs.txt
      done
      tar -cf - -C /work/out .
    ' | tar -xf - -C "$SCRATCH/out"
```
