---
name: motion-audio
description: Sound design and music selection for motion graphics — choosing tracks, licensing, sourcing from Pixabay/YouTube Audio Library, downloading with yt-dlp, and editing with ffmpeg. Use when a video, explainer, or animation needs music or sound effects.
---

# Audio for Motion Graphics

Sound is roughly half of perceived production value and the cheapest place to
gain or lose it. This covers choosing the right track, sourcing it legally,
downloading it, and cutting it to picture.

## Design for silence first

Most viewers watch muted — in-feed, in an office, on a commute. If the piece
only works with sound, it does not work. Sound should elevate, never carry, the
message. Build the visual so it reads silent, then add audio as a layer that
rewards unmuting.

This is not a stylistic preference; autoplay policies mute by default in every
major browser, so silence is the *default* delivery condition.

## Choosing music

**Match energy to pacing, not genre to topic.** A fintech explainer does not
need "corporate" music; it needs music whose rhythmic density matches your cut
rate. Fast cuts want a driving pulse. Slow, deliberate camera moves want
sustained pads and space.

**Find the tempo first.** Count your scene changes. If you cut roughly every 3
seconds, you want ~120 BPM (a cut every 6 beats) or ~90 BPM (a cut every 4.5).
Cutting on the beat is the single strongest thing you can do to make a film feel
professionally edited — and it is free.

**The track must have an arc.** A loop that never develops makes a 60-second
film feel like a 15-second film played four times. Look for tracks with a build,
a drop or a lift, and a resolution. Then edit your visual beats to land on the
musical ones.

**Leave the top end open if there is narration.** Music with prominent
mid-range vocals or bright leads fights speech. Instrumental, filtered, or pad-
heavy tracks sit under voice much better. If the track has vocals, either it is
the focus and there is no narration, or it is the wrong track.

**Avoid the obvious library sounds.** Ukulele-and-whistle, generic uplifting
piano, and stock "inspiring corporate" tracks are so overused they actively
signal low budget. Slightly unusual instrumentation reads as intentional.

## Sound effects

**Fewer, better cues.** One considered impact beats ten UI blips. Sound
everything and it becomes a slot machine.

**Sync to the visual accent, not near it.** The ear detects audio-visual
misalignment at roughly 20–40ms. When in doubt, place the sound 1–2 frames
*early* — audio leading video is far less noticeable than audio lagging, because
in the real world light arrives before sound.

**Frequency carries meaning.** Low frequencies read as weight and arrival; high
frequencies as precision and small detail. Match the sound to the size of the
thing moving. A large panel sliding in wants a low whoosh with body; a checkbox
ticking wants a short, bright click.

**Layer for impact.** A convincing impact is usually three sounds: a transient
(the click), a body (the thump), and a tail (the reverb or decay). Any one alone
sounds thin.

## Licensing: read this before you download anything

This is where most projects create problems for themselves. The rules:

**"Free to download" is not "free to use."** A track can be freely downloadable
and still prohibit commercial use, require attribution, or forbid modification.

**Check the specific licence, not the site's reputation.** Sites host tracks
under mixed licences — the same platform may carry CC0, CC-BY, and
rights-reserved material side by side.

**Common licences:**

| Licence | Commercial use | Attribution | Modification |
|---|---|---|---|
| CC0 / Public Domain | Yes | Not required | Yes |
| CC-BY | Yes | **Required** | Yes |
| CC-BY-SA | Yes | Required | Yes, but derivative must share alike |
| CC-BY-NC | **No** | Required | Yes |
| Royalty-free (purchased) | Per licence terms | Usually not | Usually yes |
| Standard YouTube licence | **No** | — | **No** |

That last row matters: the overwhelming majority of music on YouTube is under
the standard licence, which does not grant you any right to extract and reuse
it. Downloading it for use in your own video is copyright infringement
regardless of the tool used.

**Attribution, when required, goes where it can be seen** — end card, video
description, or project credits. "CC-BY" means the attribution is a condition of
the licence, not a courtesy.

## Where to source legitimately

**Pixabay Music** (pixabay.com/music) — the pragmatic first stop. Content is
under the Pixabay Content Licence: free for commercial use, no attribution
required. Quality is uneven but the catalogue is large and the licence is
genuinely permissive. Verify the licence on the individual track page; Pixabay
has changed terms before.

**YouTube Audio Library** (studio.youtube.com → Audio Library) — free tracks and
sound effects, clearly labelled as attribution-required or not. Requires a
Google account but no channel. Well-tagged by mood, genre, duration, and
instrument, which makes searching by *feel* practical.

**Free Music Archive** (freemusicarchive.org) — curated,每 track carries an
explicit Creative Commons licence. Filter by licence type before browsing so you
do not fall for a CC-BY-NC track on a commercial project.

**ccMixter** (ccmixter.org) — remix-focused, all Creative Commons, strong for
electronic and experimental material.

**Incompetech** (incompetech.com) — Kevin MacLeod's catalogue, CC-BY. Enormously
useful and enormously overused; pick the less obvious tracks.

**Freesound** (freesound.org) — the best source for individual sound effects
rather than music. Mixed licences, clearly stated per file. Excellent for
whooshes, impacts, and UI sounds.

**Zapsplat, Mixkit, Uppbeat** — free tiers with varying attribution
requirements. Read each one's terms; they differ.

**Paid, when the project justifies it:** Artlist, Epidemic Sound, Musicbed,
Soundstripe. Subscription models with broad clearance, meaningfully better
curation, and — importantly — indemnification if a claim arises.

## Downloading with yt-dlp

`yt-dlp` is a general-purpose media downloader. It is a legitimate tool with
legitimate uses: retrieving Creative Commons material, content you own, content
explicitly licensed for reuse, and archival of your own uploads. Use it for
those. Extracting rights-reserved music to put in a video you publish is
infringement, and platform Content ID will usually catch it anyway — resulting
in a claim, demonetisation, or a takedown.

**Install:**

```bash
pip install -U yt-dlp
# ffmpeg is required for audio extraction and format conversion
```

**Audio only, best quality, as MP3:**

```bash
yt-dlp -x --audio-format mp3 --audio-quality 0 "URL"
```

`-x` extracts audio and discards video. `--audio-quality 0` is the best VBR
setting.

**Keep the original codec** (no re-encode, so no generation loss):

```bash
yt-dlp -f bestaudio "URL"
```

Usually yields Opus or AAC in a WebM/M4A container. Prefer this when you will
edit further — re-encoding lossy audio twice audibly degrades it.

**WAV for editing:**

```bash
yt-dlp -x --audio-format wav "URL"
```

**Embed metadata and thumbnail:**

```bash
yt-dlp -x --audio-format mp3 --embed-metadata --embed-thumbnail "URL"
```

**Check the licence before downloading:**

```bash
yt-dlp --print "%(license)s | %(title)s | %(uploader)s" "URL"
```

If this prints `Creative Commons Attribution licence (reuse allowed)`, you are
on solid ground and you owe attribution. If it prints nothing useful or
`Standard YouTube License`, do not use the track — find an equivalent on
Pixabay or the Audio Library instead.

**Search YouTube's CC-licensed material** by adding `,creativecommons` to the
search filter on the site, then verify each result with the `--print` command
above.

**Download a whole playlist's audio:**

```bash
yt-dlp -x --audio-format mp3 -o "%(playlist_index)s - %(title)s.%(ext)s" "PLAYLIST_URL"
```

**Rate-limit to be a good citizen:**

```bash
yt-dlp --sleep-interval 3 --max-sleep-interval 8 -x "URL"
```

## Editing with ffmpeg

`ffmpeg` handles everything you need to fit a track to picture.

**Trim to a section** (from 0:15, lasting 30s):

```bash
ffmpeg -ss 15 -t 30 -i input.mp3 -c copy output.mp3
```

Putting `-ss` before `-i` seeks fast; `-c copy` avoids re-encoding.

**Fade in and out** (2s fade in, 3s fade out ending at 30s):

```bash
ffmpeg -i input.mp3 -af "afade=t=in:st=0:d=2,afade=t=out:st=27:d=3" output.mp3
```

A fade-out is almost always necessary — music that stops abruptly at the end of
a film sounds like an error.

**Normalize loudness to broadcast standard:**

```bash
ffmpeg -i input.mp3 -af loudnorm=I=-16:TP=-1.5:LRA=11 output.mp3
```

`-16 LUFS` is the streaming/web target. `-14` is Spotify's; `-23` is EBU R128
broadcast. Consistent loudness across cues is what separates a mixed film from a
pile of clips.

**Duck music under narration** (sidechain compression):

```bash
ffmpeg -i music.mp3 -i voice.mp3 -filter_complex \
  "[0:a][1:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[out]" \
  -map "[out]" ducked.mp3
```

The music automatically drops whenever the voice is present and returns when it
stops. Far better than a static volume reduction.

**Mix music and effects:**

```bash
ffmpeg -i music.mp3 -i sfx.wav -filter_complex \
  "[0:a]volume=0.4[a0];[a0][1:a]amix=inputs=2:duration=longest" mixed.mp3
```

**Change tempo without changing pitch** (fit a track to a fixed duration):

```bash
ffmpeg -i input.mp3 -af "atempo=1.08" output.mp3
```

`atempo` accepts 0.5–2.0; chain two filters for larger changes. Beyond about
±10% it becomes audible.

**Extract audio from a video file:**

```bash
ffmpeg -i video.mp4 -vn -acodec copy audio.aac
```

**Convert for web delivery:**

```bash
# AAC — universal support
ffmpeg -i input.wav -c:a aac -b:a 192k output.m4a

# Opus — better quality per byte, modern browsers
ffmpeg -i input.wav -c:a libopus -b:a 128k output.opus
```

## Procedural audio, when files are a problem

If you cannot resolve licensing, need zero network requests, or want sound that
scales with a parameter, synthesize it. The Web Audio API generates clicks,
whooshes, and impacts from oscillators and noise with no assets at all:

```js
function click(ctx, when = ctx.currentTime) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(2400, when);
  osc.frequency.exponentialRampToValueAtTime(800, when + 0.03);
  gain.gain.setValueAtTime(0.3, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.08);
}
```

This is fully licence-free, adds no bytes, and is deterministic — the same code
produces the same sound every time. It will not replace music, but it covers UI
sounds completely.

## Practical checklist

1. Does the piece communicate with sound off? If not, fix the visual first.
2. Is the licence explicitly stated, and does it permit your use? Save a copy of
   the licence text alongside the file.
3. Does the tempo match your cut rate? Count it before committing.
4. Are your key visual beats landing on musical beats?
5. Is the music ducked under any narration?
6. Is everything normalized to a consistent loudness (−16 LUFS for web)?
7. Does the track fade out rather than stop dead?
8. If attribution is required, is it actually in the deliverable?

## Common mistakes

| Symptom | Cause |
|---|---|
| Film feels amateur despite good visuals | Cuts do not land on the beat |
| Music fights the narration | Track has mid-range vocals or leads; no ducking applied |
| Sounds feel disconnected from the motion | Audio lands after the visual accent — move it 1–2 frames early |
| Some cues jarringly louder than others | No loudness normalization pass |
| Copyright claim after publishing | Track was under standard licence, or CC-BY attribution was omitted |
| Music ends abruptly | No fade-out |
| Audio sounds mushy after editing | Re-encoded lossy → lossy multiple times; work from `bestaudio` or WAV |