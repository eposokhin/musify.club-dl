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
        fetches: {
            type: 'string',
            short: 'f',
            default: '5'
        }
    },
    allowPositionals: true
}

const cleanUpSymbols = inputString => inputString.replace(/[:/"*<>|?]/g, '')

function parseAlbumData(html, domain) {
    const $ = cheerio.load(html)

    const [artist = 'VA', album] = $('h1')
        .text()
        .trim()
        .split(' - ', 2)

    const coverURL = $('.album-img').attr('data-src')

    const tracks = []
    const $items = $('.playlist__item')
    
    $items.each((index, element) => {
        const $item = $(element)
        
        let trackNo = $item
            .find('.playlist__position')
            .text()
            .trim()
        if (trackNo.length < 2) trackNo = '0' + trackNo

        tracks.push({
            trackNo,
            title: $item
                .find('.playlist__details a.strong')
                .text()
                .trim(),
            url: `https://${domain}${$item
                .find('.playlist__control.play')
                .attr('data-url') || restoreRemovedSongUrl($item)}`
        })
    })

    return { artist, album, coverURL, tracks }
}

function restoreRemovedSongUrl(songElement) {
    const href = songElement
        .find('.playlist__heading')
        .find('.strong')
        .attr('href')
        .split('/')
        .at(-1)
    const songId = href.split('-').at(-1)
    const songRawName = href.split('-').slice(0, -1).join('-') + '.mp3'

    return `/track/play/${songId}/${songRawName}`
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
            await rm(filename)
            return
        }

        console.info(`Start downloading: ${url}`)

        await pipeline(res.body, Readable.fromWeb, writer)
        console.info(`Finished: ${filename}`)
    } catch (error) {
        if (error.cause?.code === 'ENOTFOUND') {
            console.warn(`${url} not found`)
            await rm(filename)
        } else if (error.code === 'EEXIST') {
            console.warn(`${filename} exist. Skipping`)
        } else {
            await rm(filename)
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

    await Promise.all(pending)

    return downloadTracks(tracks.slice(simNum), path, simNum)
}

const parsedArgs = parseArgs(config)
const {
    path,
    fetches,
    track: trackNumbers
} = parsedArgs.values

const albumURL = parsedArgs.positionals[0]

const domain = new URL(albumURL).hostname

const siteResponse = await fetch(albumURL)
const albumPage = await siteResponse.text()
const albumData = parseAlbumData(albumPage, domain)

const albumDataCleaned = {
    ...albumData,
    artist: cleanUpSymbols(albumData.artist),
    album: cleanUpSymbols(albumData.album),
    tracks: albumData.tracks.map(track => {
        return {
            ...track,
            title: cleanUpSymbols(track.title)
        }
    })
}

const albumPath = `${path}/${albumDataCleaned.artist}/${albumDataCleaned.album}`

const filterTracks = tracks => tracks
    .filter(track => trackNumbers
        .split(',')
        .map(i => parseInt(i))
        .includes(parseInt(track.trackNo))
    )

const tracksToDownload = trackNumbers ? filterTracks(albumDataCleaned.tracks) : albumDataCleaned.tracks

await prepareAlbumDir(albumPath)
await downloadTracks(tracksToDownload, albumPath, +fetches)
await downloadFile(albumDataCleaned.coverURL, `${albumPath}/cover.jpg`)
