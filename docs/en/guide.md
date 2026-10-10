# User Guide

This page covers the basics of Ops Music. See [Download](/en/download) for installation packages.

## Playing music

- **Search and play:** Enter a song, artist, or album in the top search box, then play it or add it to the queue.
- **Queue:** Use sequential, shuffle, and repeat-one modes, and drag tracks to reorder them.
- **Quality and effects:** Select audio quality and enable fades, loudness normalization, the equalizer, playback speed, and pitch controls in Settings.

## Local music

1. Open the **Library** page in the sidebar and add the folders to scan.
2. After scanning, browse the library by track, album, or artist.
3. Local track tags and cover art can be edited in the metadata editor.

## Lyrics

Ops Music supports LRC, QRC, YRC, and TTML, including word-by-word highlighting, translations, and romanization. Online lyrics are matched according to **Settings → Lyrics → Source preference**, source order, and format preference.

### Online TTML lyrics

[AMLL TTML DB](https://github.com/amll-dev/amll-ttml-db) is a community-maintained database of high-quality word-timed lyrics, often including translations and romanization.

- Enable **Settings → Lyrics → Online TTML lyrics** (Beta).
- Configure the AMLL TTML DB URL template. It must contain `%p` for platform and `%s` for song ID.
- When a match is found, its timed words, translation, and romanization are used.

### Local TTML library

If you maintain your own TTML files, select a local directory as a lyrics library:

- Enable **Settings → Lyrics → Local TTML lyrics library** (Beta).
- Choose a folder containing `.ttml` files. Tracks are matched by metadata such as title and artist.
- A local match takes precedence over online lyrics.

### Lyrics windows

Only **taskbar lyrics (Windows)** remain: the current line is drawn inside the Windows taskbar, with word-by-word sweep, font size, position, colors and translation options under **Settings → External Lyrics**. The desktop lyrics and Dynamic Island windows were removed as part of this project's scope cut, and their settings no longer exist.

## System integration

- **System media controls:** Windows SMTC provides lock-screen, notification, and media-key control.
- **Tray:** The app keeps running in the tray after the main window is closed, with playback and taskbar-lyric toggles in the menu.
- **Global shortcuts:** Bind global playback shortcuts under **Settings → Hotkey Settings**.

## External control

The external HTTP and WebSocket APIs were removed as part of this project's scope cut.
