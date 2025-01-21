import * as cheerio from 'cheerio'
import { parseArgs } from 'node:util'
import { mkdir, open, rm } from 'node:fs/promises'
import { URL } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { exit, env } from 'node:process'

const config = {
    options: {
        help: {
            type: 'boolean',
            short: 'h'
        },
        path: {
            type: 'string',
            short: 'p',
            default: `${env.HOME}/Music`
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

const helpOptions = {
    help: 'Shows this message',
    path: 'Specify directory to download music into',
    track: 'Specify a track by its number in album to download. Can be many values separated by comma',
    fetches: 'How many tracks to download at the same time. Default 5'
}

function showHelp(options) {
    console.info(`Usage: THIS_PROGRAM [OPTIONS...] ALBUM_URL`)
    Object.entries(options).forEach(([key, value]) => {
        console.info(` -${config.options[key].short}, --${key}\t${value}`)
    })
}

const cleanUpSymbols = inputString => inputString.replace(/[:/"*<>|?]/g, '')

function parseAlbumData(html) {
    const $ = cheerio.load(html)

    const [artist, album] = $('h1').text().trim().split(' - ', 2)

    const coverURL = $('.album-img').attr('data-src')

    const parseTracks = (index, element) => {
        const $item = $(element)

        const trackNo = $item.find('.playlist__position').text().trim().padStart(2, '0')
        const title = $item.find('.playlist__details a.strong').text().trim()
        const path = $item
            .find('.playlist__control.play').attr('data-url') || restoreSongPath($item)

        return { trackNo, title, path }
    }
    const tracks = $('.playlist__item').map(parseTracks).toArray()

    return { artist, album, coverURL, tracks }
}

function restoreSongPath(songElement) {
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
        const url = new URL(track.path, albumURL.origin)
        await downloadFile(url, filename)
    })

    await Promise.all(pending)

    return downloadTracks(tracks.slice(simNum), path, simNum)
}

const parsedArgs = parseArgs(config)
const {
    help,
    path,
    fetches,
    track: trackNumbers
} = parsedArgs.values

if (help) {
    showHelp(helpOptions)
    exit(0)
}

const albumURL = new URL(parsedArgs.positionals[0])

const siteResponse = await fetch(albumURL)
const albumPage = await siteResponse.text()
const albumData = parseAlbumData(albumPage)

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