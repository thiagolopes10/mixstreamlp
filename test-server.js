const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');
const net = require('net');
const fs = require('fs').promises;

const app = express();
const startPort = 3002;

// Configurar middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Configurar variável de ambiente PATH para incluir a pasta bin
const BIN_PATH = path.join(__dirname, 'bin');
process.env.PATH = `${BIN_PATH}${path.delimiter}${process.env.PATH}`;

// Caminho para o executável yt-dlp
const YT_DLP_PATH = path.join(BIN_PATH, 'yt-dlp.exe');

// Cache para armazenar URLs de stream com tempo de expiração
const streamUrlCache = new Map();
const CACHE_DURATION = 3600000; // 1 hora em milissegundos

// Função para adicionar URL ao cache com tempo de expiração
function addToCache(videoId, url) {
    streamUrlCache.set(videoId, {
        url,
        timestamp: Date.now()
    });
}

// Função para verificar se a URL do cache ainda é válida
function isValidCacheEntry(entry) {
    if (!entry) return false;
    return (Date.now() - entry.timestamp) < CACHE_DURATION;
}

// Função para obter URL do stream
async function getStreamUrl(videoId) {
    return new Promise((resolve, reject) => {
        const command = `"${YT_DLP_PATH}" -f bestaudio --get-url "https://www.youtube.com/watch?v=${videoId}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error getting stream URL:', error);
                reject(error);
            } else {
                const url = stdout.trim();
                addToCache(videoId, url);
                resolve(url);
            }
        });
    });
}

// Função para pré-carregar URLs de stream
async function preloadStreamUrls(results) {
    console.log('Starting pre-loading for', results.length, 'results');
    
    const preloadPromises = results.map(async (result) => {
        if (!streamUrlCache.has(result.id)) {
            try {
                const url = await getStreamUrl(result.id);
                console.log('Pre-loaded URL for:', result.id);
            } catch (error) {
                console.error('Failed to pre-load URL for:', result.id, error);
            }
        }
    });

    try {
        await Promise.all(preloadPromises);
        console.log('Pre-loading complete for all results');
    } catch (error) {
        console.error('Error in pre-loading:', error);
    }
}

// Função para limpar entradas expiradas do cache periodicamente (a cada 5 minutos)
setInterval(() => {
    console.log('Cleaning expired cache entries...');
    for (const [videoId, entry] of streamUrlCache.entries()) {
        if (!isValidCacheEntry(entry)) {
            streamUrlCache.delete(videoId);
            console.log('Removed expired cache entry for:', videoId);
        }
    }
}, 300000); // 5 minutos

// Endpoint de busca
app.get('/search', (req, res) => {
    const query = req.query.q;
    const offset = parseInt(req.query.offset) || 0;
    
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    const command = `"${YT_DLP_PATH}" ytsearch${10 + offset}:"${query}" --dump-single-json --no-warnings --flat-playlist`;
    console.log('Executing search command:', command);

    exec(command, { maxBuffer: 1024 * 1024 * 10 }, async (error, stdout, stderr) => {
        if (error) {
            console.error('Error:', error);
            return res.status(500).json({ error: 'Search failed' });
        }

        try {
            const data = JSON.parse(stdout);
            console.log('Search results:', data);

            if (!data.entries || !Array.isArray(data.entries)) {
                console.error('Invalid data format:', data);
                return res.status(500).json({ error: 'Invalid response format' });
            }

            // Pegar apenas os novos resultados baseado no offset
            const results = data.entries
                .slice(offset)
                .filter(entry => entry && entry.id)
                .map(entry => ({
                    id: entry.id,
                    title: entry.title || 'Unknown Title',
                    duration: entry.duration || 0,
                    uploader: entry.uploader || entry.channel || 'Unknown',
                    thumbnail: entry.thumbnail || (entry.thumbnails && entry.thumbnails.length > 0 ? entry.thumbnails[0].url : null)
                }));

            // Enviar resultados imediatamente
            res.json({
                results,
                hasMore: results.length === 10
            });

            // Iniciar pré-carregamento em background para todos os resultados
            preloadStreamUrls(results).catch(error => {
                console.error('Error in pre-loading:', error);
            });
        } catch (parseError) {
            console.error('Parse error:', parseError);
            res.status(500).json({ error: 'Failed to parse search results' });
        }
    });
});

// Endpoint de stream
app.get('/stream', async (req, res) => {
    const videoId = req.query.id;
    const isPreload = req.query.preload === 'true';
    
    if (!videoId) {
        return res.status(400).json({ error: 'Video ID is required' });
    }

    try {
        let streamUrl;
        const cachedData = streamUrlCache.get(videoId);
        
        if (cachedData && isValidCacheEntry(cachedData)) {
            streamUrl = cachedData.url;
            console.log('Using cached URL for:', videoId);
        } else {
            streamUrl = await getStreamUrl(videoId);
            console.log('Added new URL to cache for:', videoId);
        }

        // Se for preload, apenas armazenar no cache
        if (isPreload) {
            res.status(200).json({ message: 'URL pre-loaded successfully' });
        } else {
            res.json({ url: streamUrl });
        }
    } catch (error) {
        console.error('Error getting stream URL:', error);
        res.status(500).json({ error: 'Failed to get stream URL' });
    }
});

// Endpoint para obter URL do áudio
app.get('/audio/:id', async (req, res) => {
    try {
        const videoId = req.params.id;
        const url = await getStreamUrl(videoId);
        res.json({ url });
    } catch (error) {
        console.error('Erro ao obter URL do áudio:', error);
        res.status(500).json({ error: 'Falha ao obter URL do áudio' });
    }
});

// Adicionar endpoint de status
app.get('/status', (req, res) => {
    res.json({ status: 'online', type: 'audio' });
});

// Caminho para o arquivo de playlists
const PLAYLISTS_FILE = path.join(__dirname, 'playlists.json');

// Função para carregar playlists do arquivo
async function loadPlaylists() {
    try {
        const data = await fs.readFile(PLAYLISTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Se o arquivo não existir ou estiver vazio, retornar array vazio
        return [];
    }
}

// Função para salvar playlists no arquivo
async function savePlaylists(playlists) {
    await fs.writeFile(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2));
}

// Criar arquivo de playlists se não existir
async function initializePlaylists() {
    try {
        await fs.access(PLAYLISTS_FILE);
    } catch {
        await savePlaylists([]);
    }
}

// Inicializar arquivo de playlists
initializePlaylists().catch(console.error);

// Endpoints para gerenciamento de playlists
app.get('/playlists', async (req, res) => {
    try {
        const playlists = await loadPlaylists();
        res.json(playlists);
    } catch (error) {
        console.error('Error loading playlists:', error);
        res.status(500).json({ error: 'Failed to load playlists' });
    }
});

app.post('/playlists', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Playlist name is required' });
        }

        const playlists = await loadPlaylists();
        const newPlaylist = {
            id: Date.now().toString(),
            name,
            songs: []
        };

        playlists.push(newPlaylist);
        await savePlaylists(playlists);
        res.status(201).json(newPlaylist);
    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).json({ error: 'Failed to create playlist' });
    }
});

app.put('/playlists/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Playlist name is required' });
        }

        const playlists = await loadPlaylists();
        const playlist = playlists.find(p => p.id === id);
        
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        playlist.name = name;
        await savePlaylists(playlists);
        res.json(playlist);
    } catch (error) {
        console.error('Error updating playlist:', error);
        res.status(500).json({ error: 'Failed to update playlist' });
    }
});

app.delete('/playlists/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const playlists = await loadPlaylists();
        const filteredPlaylists = playlists.filter(p => p.id !== id);
        
        if (playlists.length === filteredPlaylists.length) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        await savePlaylists(filteredPlaylists);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting playlist:', error);
        res.status(500).json({ error: 'Failed to delete playlist' });
    }
});

app.post('/playlists/:id/songs', async (req, res) => {
    try {
        const { id } = req.params;
        const { song } = req.body;
        
        if (!song || !song.id || !song.title) {
            return res.status(400).json({ error: 'Song data is required' });
        }

        const playlists = await loadPlaylists();
        const playlist = playlists.find(p => p.id === id);
        
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        // Verificar se a música já existe na playlist
        if (!playlist.songs.some(s => s.id === song.id)) {
            playlist.songs.push({
                id: song.id,
                title: song.title,
                duration: song.duration,
                thumbnail: song.thumbnail,
                uploader: song.uploader
            });
            await savePlaylists(playlists);
        }

        res.json(playlist);
    } catch (error) {
        console.error('Error adding song to playlist:', error);
        res.status(500).json({ error: 'Failed to add song to playlist' });
    }
});

app.delete('/playlists/:playlistId/songs/:songId', async (req, res) => {
    try {
        const { playlistId, songId } = req.params;
        const playlists = await loadPlaylists();
        const playlist = playlists.find(p => p.id === playlistId);
        
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        playlist.songs = playlist.songs.filter(s => s.id !== songId);
        await savePlaylists(playlists);
        res.json(playlist);
    } catch (error) {
        console.error('Error removing song from playlist:', error);
        res.status(500).json({ error: 'Failed to remove song from playlist' });
    }
});

// Função para encontrar uma porta disponível
function findAvailablePort(startPort) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(findAvailablePort(startPort + 1));
            } else {
                reject(err);
            }
        });
    });
}

// Iniciar o servidor
findAvailablePort(startPort).then(port => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
        console.log(`Using yt-dlp from: ${YT_DLP_PATH}`);
        console.log(`Serving files from: ${__dirname}`);
        
        // Criar/atualizar um arquivo com a porta atual
        const portFile = path.join(__dirname, 'current-port.txt');
        fs.writeFile(portFile, port.toString())
            .then(() => console.log(`Port number saved to: ${portFile}`))
            .catch(console.error);
    });
}).catch(err => {
    console.error('Failed to start server:', err);
});
