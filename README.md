
# musify-dl

A command-line interface (CLI) program for downloading music from [musify.club](https://musify.club). This tool allows you to easily download albums and tracks with customizable options.

## Features

- Download entire albums or specific tracks.
- Automatically generate pretty file names and artist/album directories.
- Concurrent downloads for faster retrieval.
- Simple and intuitive command-line interface.

## Installation

1. **Prerequisites**: Ensure you have Node.js (version 21 or later) installed on your system.

2. **Clone the Repository**:

    ```bash
    git clone https://github.com/eposokhin/musify.club-dl
    cd musify.club-dl
    ```

3. **Install Dependencies**:

    ```bash
    npm ci
    ```

## Usage

### Basic Example

Download an entire album:

```bash
node app.js https://musify.club/some_album_url
```

### Options

```plaintext
Usage: app.js [OPTIONS...] ALBUM_URL
 -h, --help     Shows this message
 -p, --path     Specify directory to download music into (default: ~/Music)
 -t, --track    Specify a track by its number in the album to download. Can be multiple values separated by comma
 -f, --fetches  Number of tracks to download concurrently. Default is 5
```

### Examples

- Download specific tracks from an album:

    ```bash
    node app.js https://musify.club/some_album_url --track 1,3,5
    ```

- Specify a download directory:

    ```bash
    node app.js https://musify.club/some_album_url --path /path/to/directory
    ```

- Increase concurrent downloads:

    ```bash
    node app.js https://musify.club/some_album_url --fetches 10
    ```
