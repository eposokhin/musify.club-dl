import * as cheerio from 'cheerio'
import { parseArgs } from 'node:util'
import { mkdir, open, rm } from 'node:fs/promises'
import { URL } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const config = {
    options: {
        help: {
            type: 'boolean',
            short: 'h'
        },
        path: {
            type: 'string',
            short: 'p',
            default: `${process.env.HOME}/Music`
        },
        track: {
            type: 'string',
            short: 't'
        },
        simultaneous: {
            type: 'string',
            short: 's',
            default: '5'
        }
    },
    allowPositionals: true
}

const cleanUpSymbols = inputString => inputString.replace(/[:/"*<>|?]/g, '')

function getLinksAndTags(html, domain) {
    const $ = cheerio.load(html)

    const [album, artist = 'VA'] = $('h1')
        .text()
        .trim()
        .split(' - ', 2)
        .reverse()
    const tracksData = []
    const $tracks = $('.playlist__item')
    const coverURL = $('.album-img').attr('data-src')

    $tracks.each((index, element) => {
        let trackNo = $(element)
            .find('.playlist__position')
            .text()
            .trim()
        if (trackNo.length < 2) trackNo = '0' + trackNo

        tracksData.push({
            url: `https://${domain}${$(element)
                .find('.playlist__control.play')
                .attr('data-url')}`,
            trackNo,
            title: $(element)
                .find('.playlist__details a.strong')
                .text()
                .trim(),
            artist,
            album
        })
    })

    return { tracksData, coverURL }
}

async function prepareAlbumDir(path) {
    const newDir = await mkdir(path, { recursive: true })
    if (!newDir) return
    console.log(`Created ${newDir}`)
}

async function downloadFile(url, filename) {
    let filehandle
    try {
        filehandle = await open(filename, 'wx')
        const writer = filehandle.createWriteStream()

        const res = await fetch(url)
        if (!res.ok) {
            console.warn(`Server responds with status ${res.status}. The file at ${url} cannot be downloaded`)
            return
        }

        console.info(`Start downloading: ${url}`)

        await pipeline(res.body, Readable.fromWeb, writer)
        console.info(`Finished: ${filename}`)
    } catch (error) {
        if (error.cause?.code === 'ENOTFOUND') {
            console.warn(`${url} not found`)
            rm(filename)
        } else if (error.code === 'EEXIST') {
            console.warn(`${filename} exist. Skipping`)
        } else {
            throw error
        }
    } finally {
        await filehandle?.close()
    }
}

async function downloadTracks(tracks, path, simNum) {
    if (tracks.length === 0) return
    const toDownload = tracks.slice(0, simNum)

    const pending = toDownload.map(async track => {
        const filename = `${path}/${track.trackNo} - ${track.title}.mp3`
        await downloadFile(track.url, filename)
    })

    await Promise.allSettled(pending)

    return downloadTracks(tracks.slice(simNum), path, simNum)
}

const parsedArgs = parseArgs(config)
const {
    path,
    simultaneous
} = parsedArgs.values

const albumURL = parsedArgs.positionals[0]

const domain = new URL(albumURL).hostname

const res = await fetch(albumURL)
const body = await res.text()
const { tracksData, coverURL } = getLinksAndTags(body, domain)

const tracksDateCleaned = tracksData.map(track => {
    return {
        ...track,
        title: cleanUpSymbols(track.title),
        artist: cleanUpSymbols(track.artist),
        album: cleanUpSymbols(track.album)
    }
})

const albumPath = `${path}/${tracksDateCleaned[0].artist}/${tracksDateCleaned[0].album}`
console.log(albumPath)
await prepareAlbumDir(albumPath)
await downloadTracks(tracksDateCleaned, albumPath, +simultaneous)
