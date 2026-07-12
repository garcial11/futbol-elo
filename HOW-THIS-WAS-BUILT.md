# How this was built

An AI coding agent (Claude Opus 4.8, running in Claude Code) wrote the code in this repo. It also wrote the spec and the plan it then worked from, which turns out to matter more than the code. I set the goal, steered it, and decided what was wrong. This file was drafted by the same agent from the git log, then fact-checked against the diffs and edited.

It is mostly about what the model got wrong, because that is the part that is actually useful. Some of what it got wrong is small and ordinary, and I have said so where that is true.

## The method

Three artifacts, in order, all committed:

1. **Spec first.** `specs/2026-07-05-futbol-elo-rating-design.md`, 220 lines as first committed (`a8c098b`), written before any code. It has a "Core decisions (locked)" table and is marked "Approved for planning." Remember that word "locked." It matters later.
2. **Plan second.** `plans/2026-07-05-futbol-elo-rating.md`, 1,409 lines as first committed (`9acad8a`), task by task with checkboxes. It instructs the agent to commit after every task with a conventional-commit message, and to run each task through a subagent.
3. **Then code, one commit per task, module and tests together.**

The whole day is Sunday 2026-07-05, 29 commits, 10:45 to 17:12. The Python core (ratings engine, pipeline, fetch, deploy, CLI, all with tests) lands between 10:56 and 11:01. Seven commits in under five minutes. Nobody types that. That cadence is the fingerprint of a plan being executed by an agent.

One thing the git history does *not* prove: only the two planning commits carry a `Co-Authored-By: Claude` trailer. The other 27 commits carry no AI attribution at all. So if you are auditing this, the timestamps are your evidence, not the trailers.

## What the model got wrong

### 1. It invented a fact, put it in its own spec, then shipped it to users two hours later (`7c28748`, fixed in `dcc72a9`)

The site's Method tab shipped claiming: *"Teams are kept exactly as recorded, so historical sides like West Germany and Germany stay separate."*

That is false. The martj42 dataset this project reads does not have a "West Germany" row. It records the FRG as **"Germany"** and the USSR as **"Russia"** (East Germany does appear, as "German DR"). The site was telling users its ratings did something the underlying data makes impossible.

The model did not make this up at the Method tab. It made it up at 10:45, in the spec, in the table headed **"Core decisions (locked)"**: `| Team names | Treated as-is from the raw data (West Germany ≠ Germany) |`. The plan repeated it at 10:52. The Method tab repeated it to users at 12:29. It was corrected at 15:33. The chain is spec to plan to user-facing copy, with no code in it: the model reasoned from a plausible prior about football history instead of from the actual CSV, wrote the guess into a document labeled "Approved," and then treated that document as ground truth for the rest of the day.

That is the failure mode I care about most, and it is not really a coding failure. A spec written by a model can launder a wrong assumption into a fact. Everything downstream stays internally consistent and is still wrong.

The false line then sat in the spec and the plan, untouched, from 10:45 on the build day until 2026-07-12, a week later, when I added a dated `## 0. Corrections` block to the spec and correction notes to the plan. I did not silently rewrite the original lines. The wrong text is still there, marked as wrong, because the wrong text is the exhibit.

### 2. It fixed a bug and then wrote a test the bug would have passed (`996b25b`)

This is the one I would put first if I were you.

The pivot (below) hand-ported the Python pipeline into JavaScript, and the two `slugify` functions came out different. Python did NFKD then dropped all non-ASCII. The JS only stripped combining marks, so letters with no NFKD decomposition (ø, đ, ł, æ) survived and became hyphens. For "Đorđe," Python gives `ore` and the shipped JS gave `or-e`. The slug is a team's identity key.

The repair was right: extract `docs/assets/engine.js` as the single source, run it under Node from `tests/test_js_parity.py`, diff it field by field against Python.

Then look at the test fixtures it wrote: Curaçao, Côte d'Ivoire, São Tomé, Åland, Türkiye. Every one of those decomposes cleanly under NFKD, so the old combining-mark strip already handled them. **They all pass under the buggy slugify.** The test could not have caught the bug it was written for. The tests pass. They would also have passed before the fix.

### 2b. Then I nearly made the same mistake, in the fix, in a file about the mistake

On 2026-07-12 I added four names with no NFKD decomposition (`Tromsø`, `Đorđe`, `Łódź`, `Ærø`) and considered it closed. Before publishing this file I ran the old buggy `slugify` against them, which is the check I should have run the first time.

Three of the four discriminate nothing. `Tromsø`, `Łódź` and `Ærø` produce identical output under the buggy code and the fixed code. The undecomposable letter has to sit **inside** the word: at the start or the end, the stray hyphen it leaves behind is trimmed off again and both implementations agree anyway. Only `Đorđe` (`or-e` under the old JS, `ore` under Python) was doing any work at all.

The fixtures are now `Đorđe`, `Bjørn`, `Wisła`, `Sæby`. One per undecomposable letter, every one of them word-internal. Revert `slugify` in `docs/assets/engine.js` to the original and `tests/test_js_parity.py` fails. That is the property that was missing: not "does my test pass," but **"does my test fail when the code is wrong."**

Nobody reasoned their way to this. Running the old code against the new fixtures is what produced it. On the page, all four names looked tricky, and looking tricky is not the same as discriminating. It is the same error as the original one, made a second time, while writing the file about the first one. I am leaving it in, because deleting it would be the least honest thing in this repo.

### 3. The 15:25 pivot, and the two documents it never went back to (`7a05f46`)

At 15:25, commit `7a05f46` throws out the entire architecture: 347 files changed, 339 precomputed JSON files deleted, the GitHub Actions workflow deleted 36 minutes after it was written, and the Elo engine rewritten in JavaScript to run live in the browser.

As an architecture call it was right. The result is simpler: no server, no cron, no publish step. But it created the divergence in item 2, and two more things:

- **A stale doc describing a system that no longer existed** (`dcc72a9`). The Method tab still said "Every update recomputes all ratings from scratch," seven minutes after the concept of an "update" had been deleted. The model changed the architecture and did not re-read the prose it had already shipped about the old one.
- **The spec was never reconciled.** The spec's locked-decisions table says "fully self-contained (no CDN)." The plan's constraints say "no external network calls at runtime." The pivot makes the page fetch a CSV from `raw.githubusercontent.com` on every load, with `cdn.jsdelivr.net` as a fallback CDN. The agent updated the README and treated `specs/` and `plans/` as write-once history. Mid-course pivots are where spec-driven agents leak.

### 4. It escaped by field name, not by trust boundary (`ce84489`)

An audit pass found six things at once. The one worth naming: the rankings, last-10, and head-to-head tables interpolated the **date** column raw into `innerHTML` while every neighboring string field was already run through `esc()`. The model knew to escape. It just did not classify a date as attacker-controlled, because dates "are" dates.

But after the pivot, the page fetches a third-party CSV at runtime and renders it, so a poisoned upstream row was a live script-injection path. The trust boundary moved and the escaping did not move with it.

The finding itself is a checklist item that any decent audit pass returns. What made it matter was the pivot, and the pivot is not in the checklist.

### 5. The boring ones

These are not impressive catches and I am not going to dress them up:

- `load_matches` skipped rows with an empty score cell, then called `int()`. The plan said, verbatim, "Rows with an empty home or away score are skipped." The real CSV uses the R-style string `"NA"`. `int("NA")` raises. The fix (`82f06fe`, 11:06:41) lands about six minutes after the CLI was finished and one second before the site commit, which is to say: the assumption survived every unit test and died on first contact with the real file. That is a stack trace, not an insight.
- `elo/deploy.py` captured subprocess output and never checked `returncode`, so a failed `git push` still returned `True`, and the CLI dutifully printed "Pushed to GitHub Pages." Textbook happy-path subprocess.
- Mobile scroll on the Last-10 table, compare sliders that let From pass To, a `.gitignore` that covered `.jpeg` and had to be widened 33 minutes later for `.jpg` and `.png`. QA nits.

## What I caught, and how

I did not remember any of this. I reconstructed it from the session transcripts, which I have kept and have not published. So take the timestamps below for what they are: I can check them and you cannot. What you can check is the other half of each pair, because the commits are in `git log` and the clocks line up.

**The West Germany error.** Here is the entire exchange. This is my message at 15:31:03, verbatim, pasted straight out of the session transcript. All I did was copy the site's own Method tab and put three words in front of it.

```
15:31:03   me:

Is this correct?

Ratings are computed from every men's international on record (49,495 matches,
1872-11-30 to 2026-07-04, 336 teams), from the community-maintained
martj42/international_results dataset. Teams are kept exactly as recorded, so
historical sides like West Germany and Germany stay separate. Every update
recomputes all ratings from scratch, so corre
```

```
15:33:00   commit dcc72a9

fix: correct Method-tab data note (dataset records West Germany as 'Germany';
site computes live, not via 'updates')
```

One minute, fifty-seven seconds.

Both ends of that are checkable and you should check them. `git show 7c28748:docs/index.html` is the Method tab as it shipped at 12:29, and the sentence is in there word for word. `git show dcc72a9:docs/index.html` is the same paragraph after the fix, and it reads: *"West Germany is recorded as 'Germany' and the Soviet Union as 'Russia'."*

One detail gives away where I was standing. The match and team counts in what I pasted (49,495 matches, 336 teams) are not in the HTML source. They are written into the page by JavaScript at load time. So I did not copy that paragraph out of the code. I copied it off the rendered site, which is the only place those numbers exist.

That is not incidental, it is the whole method. The model can read its own code all day. It cannot look at the thing.

Now the part I want to be precise about, because the flattering version is available and it is false. **I did not know the answer.** I did not know that the dataset records the FRG as "Germany" and the USSR as "Russia." I had no football-history fact in my head that the model lacked. What I had was a sentence that sounded a shade too confident, sitting somewhere that being wrong would matter, and the reflex to make it go and check.

That is the whole skill, and it is smaller than people want it to be. You do not need to know more than the model. You need to know **which of its confident sentences to stop on.** Everything in my day job is that: a number that ties too neatly, a reconciliation that came in clean the first time, a variance nobody can explain but everyone is comfortable with.

**The architecture, at 15:07.** *"Not convinced. Brainstorm options."* I had spent 14:41 to 14:47 asking how a one-click update would work, where it would run, whether it was free, and whether I could press it from my phone. The answers kept requiring a server. At 15:07 I stopped negotiating with the design and asked for other ones. The pivot commit lands at 15:25 and deletes 339 files. That call was mine and I would make it again, although it is also the call that broke two of the spec's own locked constraints and caused the engine divergence in item 2. Both things are true.

**The security review, at 15:35.** *"Run agents to verify and devil advocates on the whole code and setuo."* That is the prompt that produced the XSS fix at 16:02 and the parity test at 16:22. I did not find the XSS. I ordered the sweep that found it, and then decided the finding was real. On a portfolio site that renders a third-party CSV, that is the correct division of labor, and I am not going to claim the XSS as a personal catch when a tool found it.

**The rest is just using the thing.** At 12:33 the team graph did not render. At 17:07 the Team tab still had a plain dropdown while every other tab had a search picker. Nobody finds those by reading a diff. You find them by clicking through your own site and being annoyed.

**And the one that is genuinely invisible to a model:** stale JavaScript on the deployed site (`70ea730`). There is no local symptom, because dev servers always serve fresh assets. You only learn that fresh HTML is loading a cached `app.js` by opening the real URL and watching the page half-break. Same for the three empty commits that exist only to force a rebuild after a failed Pages deploy: build status lives in a dashboard outside the repo, where the agent cannot see it.

## What holds up

The math core (`elo/ratings.py`) is pure, zero I/O, under 70 lines. The tests pin properties rather than outputs: Elo is zero-sum, expected score is symmetric, equal ratings plus a draw means no movement.

Determinism was designed in, not discovered. Same-day matches are sorted with a stable tie-break on CSV order, because Elo is path-dependent and without that your ratings are a coin flip.

`elo/deploy.py` takes its subprocess runner as an injectable parameter, so the one function that touches the outside world is testable without a real repo. And when the CSV fallback mirror is used, the UI says so in the meta line instead of letting you believe stale data is current. That is better manners than most code has.

## What it cost

One Sunday. Six and a half hours, 10:45 to 17:12. Thirty prompts from me, several of them one word. Twenty-nine commits, one deployed site, a Python package with tests, and a JS engine held to it by a parity test.

What that buys is code, and code turns out to be the cheap part. It did not buy the four words at 15:31, and the four words at 15:31 are the only reason the site is not still telling people something false about West Germany.

## What I would tell you

Distrust the spec, especially when the model wrote it.

Everything downstream of a wrong spec stays internally consistent and stays wrong. The West Germany line was born at 10:45 in a table headed "Core decisions (locked)", marked "Approved," and it reached users at 12:29 without ever touching code. No test could have caught it. No review of the diff could have caught it, because the diff was faithful to the spec. The only thing that catches it is somebody stopping on a confident sentence and asking whether it is true.

Which leaves the question I have not resolved. If the model writes the spec, and then reads its own spec as ground truth, and I am the only one who ever pushes back on it, then what exactly is the spec for? I think the answer is that it is a place to put the assumptions where you can see them and go after them. That is not nothing. But it is a much smaller claim than the word "spec" implies, and I notice most people using these tools have not made it.
