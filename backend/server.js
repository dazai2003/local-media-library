const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const chokidar = require('chokidar');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MEDIA_PATH = process.env.MEDIA_PATH;
const API_KEY = process.env.TMDB_API_KEY;

const COVERS_DIR = path.join(__dirname, 'covers');
if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR);
app.use('/covers', express.static(COVERS_DIR));

const DB_FILE = path.join(__dirname, 'data.json');
const HIDDEN_FILE = path.join(__dirname, 'hidden.json');
const MANUAL_MATCHES_FILE = path.join(__dirname, 'manual_matches.json');

let library = [];
let hiddenPaths = [];
let manualMatches = {};

if (fs.existsSync(DB_FILE)) {
    try { library = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); } catch(e) {}
}
if (fs.existsSync(HIDDEN_FILE)) {
    try { hiddenPaths = JSON.parse(fs.readFileSync(HIDDEN_FILE, 'utf-8')); } catch(e) {}
}
if (fs.existsSync(MANUAL_MATCHES_FILE)) {
    try { manualMatches = JSON.parse(fs.readFileSync(MANUAL_MATCHES_FILE, 'utf-8')); } catch(e) {}
}

const saveDb = () => fs.writeFileSync(DB_FILE, JSON.stringify(library, null, 2));
const saveHidden = () => fs.writeFileSync(HIDDEN_FILE, JSON.stringify(hiddenPaths, null, 2));
const saveManualMatches = () => fs.writeFileSync(MANUAL_MATCHES_FILE, JSON.stringify(manualMatches, null, 2));

const isVideo = (file) => /\.(mp4|mkv|avi|mov|wmv|flv)$/i.test(file);

const TMDB_GENRES = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
    878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
    10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
    10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
};

const parseFile = (filepath) => {
    let type = 'movie';
    let cleanTitle = '';
    let year = '';
    const parts = filepath.split(path.sep);
    const filename = path.basename(filepath, path.extname(filepath));

    const tvSeriesIndex = parts.findIndex(p => p.toLowerCase() === 'tv series');
    if (tvSeriesIndex !== -1 && tvSeriesIndex < parts.length - 2) {
        type = 'tv';
        cleanTitle = parts[tvSeriesIndex + 1];
        const seasonMatch = filepath.match(/[Ss](\d{1,2})/);
        const episodeMatch = filepath.match(/[Ee](\d{1,2})/);
        const seasonMatchAlt = filepath.match(/Season\s*(\d+)/i);
        let seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : (seasonMatchAlt ? parseInt(seasonMatchAlt[1]) : 1);
        let episodeNumber = episodeMatch ? parseInt(episodeMatch[1]) : 1;
        return { type, title: cleanTitle, originalName: filename, year: '', isGrouped: true, seasonNumber, episodeNumber };
    }

    let sourceName = filename;
    if (parts.length > 2) {
        const parentFolder = parts[parts.length - 2];
        if (!['movies', 'downloads', 'video', 'new folder'].includes(parentFolder.toLowerCase())) {
            sourceName = parentFolder;
        }
    }

    cleanTitle = sourceName.replace(/\./g, ' ');
    const removeTags = [
        /\[.*?\]/g, /\(.*?\)/g, /\{.*?\}/g,
        /(1080p|720p|480p|2160p|4k|BluRay|BRRip|BDRip|WEBRip|WEB-DL|HDRip|HD|x264|x265|HEVC|AAC|DTS|DD5\.1|YIFY|Pahe|ETRG|Ganool|YTS|AMZN|NF|HULU|DSNY|REPACK|xvid|divx|hdtv)/gi,
        /(www\..*?\.[a-z]{2,4})/gi,
        /(-[A-Za-z0-9]+$)/g
    ];
    removeTags.forEach(tag => cleanTitle = cleanTitle.replace(tag, ' '));
    const yearMatch = sourceName.match(/(19|20)\d{2}/);
    if (yearMatch) year = yearMatch[0];
    cleanTitle = cleanTitle.replace(/[-_\[\]\(\)]/g, ' ').replace(/\s+/g, ' ').trim();
    return { type, title: cleanTitle, originalName: filename, year, isGrouped: false };
};

const downloadImage = async (url, filename) => {
    try {
        const filepath = path.join(COVERS_DIR, filename);
        if (fs.existsSync(filepath)) return `/covers/${filename}`;
        const res = await axios({ url, responseType: 'stream' });
        return new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(filepath);
            res.data.pipe(writer);
            writer.on('finish', () => resolve(`/covers/${filename}`));
            writer.on('error', reject);
        });
    } catch { return null; }
};

const buildMetadata = async (data, type) => {
    let castInfo = [];
    let genreNames = [];
    try {
        const castUrl = `https://api.themoviedb.org/3/${type}/${data.id}/credits?api_key=${API_KEY}`;
        const castRes = await axios.get(castUrl);
        castInfo = castRes.data.cast ? castRes.data.cast.slice(0, 8).map(c => ({
            name: c.name,
            character: c.character,
            profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null
        })) : [];
    } catch (ignored) {}

    try {
        const detailUrl = `https://api.themoviedb.org/3/${type}/${data.id}?api_key=${API_KEY}`;
        const detailRes = await axios.get(detailUrl);
        genreNames = (detailRes.data.genres || []).map(g => g.name);
    } catch (ignored) {
        genreNames = (data.genre_ids || []).map(id => TMDB_GENRES[id]).filter(Boolean);
    }

    let posterLocal = null;
    let backdropLocal = null;
    if (data.poster_path) posterLocal = await downloadImage(`https://image.tmdb.org/t/p/w500${data.poster_path}`, `poster_${data.id}.jpg`);
    if (data.backdrop_path) backdropLocal = await downloadImage(`https://image.tmdb.org/t/p/original${data.backdrop_path}`, `backdrop_${data.id}.jpg`);

    return {
        tmdbId: data.id,
        title: data.title || data.name,
        overview: data.overview,
        posterUrl: posterLocal ? `http://localhost:${PORT}${posterLocal}` : null,
        backdropUrl: backdropLocal ? `http://localhost:${PORT}${backdropLocal}` : null,
        rating: data.vote_average,
        releaseDate: data.release_date || data.first_air_date,
        cast: castInfo,
        genres: genreNames
    };
};

const fetchMetadata = async (fileInfo) => {
    try {
        const query = encodeURIComponent(fileInfo.title);
        const url = `https://api.themoviedb.org/3/search/${fileInfo.type}?api_key=${API_KEY}&query=${query}${fileInfo.year ? `&year=${fileInfo.year}` : ''}`;
        const res = await axios.get(url);
        if (res.data.results && res.data.results.length > 0) {
            return await buildMetadata(res.data.results[0], fileInfo.type);
        }
    } catch (err) { console.error("TMDB error:", err.message); }
    return null;
};

// Queue
const fileQueue = [];
let isProcessing = false;

const processQueue = async () => {
    if (isProcessing || fileQueue.length === 0) return;
    isProcessing = true;
    const filePath = fileQueue.shift();

    if (hiddenPaths.includes(filePath)) { isProcessing = false; processQueue(); return; }

    const parsed = parseFile(filePath);

    if (parsed.type === 'tv' && parsed.isGrouped) {
        let existingShow = library.find(item => item.type === 'tv' && item.originalName === parsed.title);
        
        if (existingShow && !existingShow.metadata) {
            let metadata = null;
            if (manualMatches[parsed.title]) {
                 try {
                     const r = await axios.get(`https://api.themoviedb.org/3/${manualMatches[parsed.title].type || 'tv'}/${manualMatches[parsed.title].tmdbId}?api_key=${API_KEY}`);
                     metadata = await buildMetadata(r.data, manualMatches[parsed.title].type || 'tv');
                 } catch(e) {}
            }
            if (!metadata) metadata = await fetchMetadata({ type: 'tv', title: parsed.title, year: parsed.year });
            if (metadata) { existingShow.metadata = metadata; saveDb(); io.emit('library_update', library); }
        }

        if (!existingShow) {
            console.log(`Fetching TV Show: ${parsed.title}`);
            let metadata = null;
            if (manualMatches[parsed.title]) {
                 const matchUrl = `https://api.themoviedb.org/3/${manualMatches[parsed.title].type || 'tv'}/${manualMatches[parsed.title].tmdbId}?api_key=${API_KEY}`;
                 try {
                     const r = await axios.get(matchUrl);
                     metadata = await buildMetadata(r.data, manualMatches[parsed.title].type || 'tv');
                 } catch(e) {}
            }
            if (!metadata) metadata = await fetchMetadata({ type: 'tv', title: parsed.title, year: parsed.year });
            
            existingShow = {
                id: Date.now().toString() + Math.random().toString(),
                type: 'tv', originalName: parsed.title,
                metadata: metadata || null,
                addedAt: new Date().toISOString(), watched: false, episodes: []
            };
            library.push(existingShow);
        }
        const epExists = existingShow.episodes.find(e => e.path === filePath);
        if (!epExists) {
            existingShow.episodes.push({
                id: Date.now().toString() + Math.random().toString(),
                path: filePath, season: parsed.seasonNumber, episode: parsed.episodeNumber,
                filename: parsed.originalName, watched: false, addedAt: new Date().toISOString()
            });
            saveDb(); io.emit('library_update', library);
        }
    } else {
        const existingMovie = library.find(item => item.path === filePath);
        
        if (existingMovie && !existingMovie.metadata) {
            let metadata = null;
            if (manualMatches[filePath]) {
                 try {
                     const r = await axios.get(`https://api.themoviedb.org/3/${manualMatches[filePath].type || 'movie'}/${manualMatches[filePath].tmdbId}?api_key=${API_KEY}`);
                     metadata = await buildMetadata(r.data, manualMatches[filePath].type || 'movie');
                 } catch(e) {}
            }
            if (!metadata) metadata = await fetchMetadata(parsed);
            if (metadata) { existingMovie.metadata = metadata; saveDb(); io.emit('library_update', library); }
        }

        if (!existingMovie) {
            console.log(`Fetching Movie: ${parsed.title}`);
            let metadata = null;
            if (manualMatches[filePath]) {
                 const matchUrl = `https://api.themoviedb.org/3/${manualMatches[filePath].type || 'movie'}/${manualMatches[filePath].tmdbId}?api_key=${API_KEY}`;
                 try {
                     const r = await axios.get(matchUrl);
                     metadata = await buildMetadata(r.data, manualMatches[filePath].type || 'movie');
                 } catch(e) {}
            }
            if (!metadata) metadata = await fetchMetadata(parsed);
            
            library.push({
                id: Date.now().toString() + Math.random().toString(),
                path: filePath, type: parsed.type, originalName: parsed.title,
                metadata: metadata || null, addedAt: new Date().toISOString(), watched: false
            });
            saveDb(); io.emit('library_update', library);
        }
    }
    isProcessing = false;
    processQueue();
};

let watcher = null;
const startWatcher = () => {
    if (watcher) watcher.close();
    watcher = chokidar.watch(MEDIA_PATH, {
        ignored: /(^|[\/\\])\../, persistent: true, depth: 4, ignorePermissionErrors: true
    });
    watcher.on('add', (filePath) => {
        if (!isVideo(filePath)) return;
        if (hiddenPaths.includes(filePath)) return;
        const isSavedMovie = library.find(item => item.type === 'movie' && item.path === filePath);
        const isSavedTvShowEp = library.find(item => item.type === 'tv' && item.episodes.some(e => e.path === filePath));
        if (!isSavedMovie && !isSavedTvShowEp) { fileQueue.push(filePath); processQueue(); }
    }).on('unlink', (filePath) => {
        if (!isVideo(filePath)) return;
        const parsed = parseFile(filePath);
        if (parsed.type === 'tv' && parsed.isGrouped) {
            const show = library.find(item => item.type === 'tv' && item.originalName === parsed.title);
            if (show) {
                show.episodes = show.episodes.filter(e => e.path !== filePath);
                if (show.episodes.length === 0) library = library.filter(item => item.id !== show.id);
            }
        } else { library = library.filter(item => item.path !== filePath); }
        saveDb(); io.emit('library_update', library);
    }).on('ready', () => { console.log("Watcher ready. Monitoring for changes."); });
};
startWatcher();

// ========== API ROUTES ==========

app.get('/api/library', (req, res) => res.json(library));

app.post('/api/hide', (req, res) => {
    const { id } = req.body;
    const item = library.find(i => i.id === id);
    if (item) {
        if (item.type === 'movie' && item.path) hiddenPaths.push(item.path);
        if (item.type === 'tv' && item.episodes) item.episodes.forEach(e => hiddenPaths.push(e.path));
        library = library.filter(i => i.id !== id);
        saveDb(); saveHidden();
        io.emit('library_update', library);
        return res.json({ success: true });
    }
    res.status(404).json({ success: false });
});

app.get('/api/search-tmdb', async (req, res) => {
    const { query, type } = req.query;
    try {
        const url = `https://api.themoviedb.org/3/search/${type || 'movie'}?api_key=${API_KEY}&query=${encodeURIComponent(query)}`;
        const r = await axios.get(url);
        const results = (r.data.results || []).slice(0, 10).map(d => ({
            tmdbId: d.id,
            title: d.title || d.name,
            overview: (d.overview || '').substring(0, 150),
            posterUrl: d.poster_path ? `https://image.tmdb.org/t/p/w200${d.poster_path}` : null,
            releaseDate: d.release_date || d.first_air_date,
            rating: d.vote_average
        }));
        res.json(results);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/match', async (req, res) => {
    const { libraryId, tmdbId, type } = req.body;
    const item = library.find(i => i.id === libraryId);
    if (!item) return res.status(404).json({ success: false });
    try {
        const url = `https://api.themoviedb.org/3/${type || 'movie'}/${tmdbId}?api_key=${API_KEY}`;
        const r = await axios.get(url);
        const metadata = await buildMetadata(r.data, type || 'movie');
        item.metadata = metadata;
        
        // Save to persistent manual match log
        if (item.type === 'movie' && item.path) manualMatches[item.path] = { tmdbId, type };
        if (item.type === 'tv' && item.originalName) manualMatches[item.originalName] = { tmdbId, type };
        saveManualMatches();

        saveDb(); io.emit('library_update', library);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/refresh', (req, res) => {
    console.log("Force rescan triggered.");
    library = [];
    saveDb();
    // Do NOT wipe hidden or manual paths here
    io.emit('library_update', library);
    startWatcher();
    res.json({ success: true });
});

app.post('/api/watched', (req, res) => {
    const { id, path, watched } = req.body;
    let found = false;
    library.forEach(item => {
        if (item.id === id) {
            if (item.type === 'tv' && path) {
                const ep = item.episodes.find(e => e.path === path);
                if (ep) { ep.watched = watched; found = true; }
            } else { item.watched = watched; found = true; }
        }
    });
    if (found) { saveDb(); io.emit('library_update', library); res.json({ success: true }); }
    else res.status(404).json({ success: false });
});

app.post('/api/play', async (req, res) => {
    const { filePath } = req.body;
    try {
        exec(`start "" "${filePath}"`, (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/subtitles', (req, res) => {
    const { paths } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
        return res.status(400).json({ success: false, error: 'No paths provided' });
    }

    const fileArgs = paths.map(p => `"${p}"`).join(' ');
    const cmd = `subliminal download -l en ${fileArgs}`;
    
    console.log(`Starting Subtitle Download: subliminal download -l en ...`);
    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            console.error("Subtitle download error:", err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        console.log("Subtitle download success:", stdout);
        res.json({ success: true, log: stdout });
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
