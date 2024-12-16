const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');

const app = express();
let port = 3000;
const MAX_BUFFER = 1024 * 1024 * 10; // 10MB buffer

// Configuração CORS mais específica
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Range', 'Accept', 'Origin', 'Authorization'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type']
}));

// Adicionar headers adicionais para streaming
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
    res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    next();
});

app.use(express.json());
app.use(express.static(__dirname));

// Cache para URLs de vídeo
const videoUrlCache = new Map();
let currentProcess = null;

// Add keepalive endpoint
app.post('/keepalive', (req, res) => {
    res.status(200).end();
});

// Add default route to serve player.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'player.html'));
});

// Função para pré-carregar URLs de vídeo com qualidade adaptativa
async function preloadVideoUrl(videoId) {
    return new Promise((resolve, reject) => {
        if (videoUrlCache.has(videoId)) {
            console.log('Cache hit para:', videoId);
            const cachedData = videoUrlCache.get(videoId);
            console.log('Dados do cache:', cachedData);
            resolve(cachedData);
            return;
        }

        console.log('Pré-carregando URL para:', videoId);
        const ytDlpPath = path.join(__dirname, 'bin', 'yt-dlp.exe');
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Especificando formatos compatíveis com navegadores
        const command = `"${ytDlpPath}" -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best" -g "${videoUrl}"`;
        
        console.log('Executando comando:', command);
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Erro ao executar yt-dlp:', error);
                console.error('Stderr:', stderr);
                reject(error);
                return;
            }

            const urls = stdout.trim().split('\n');
            console.log('URLs obtidas:', urls);

            if (urls.length === 0) {
                reject(new Error('Nenhuma URL encontrada'));
                return;
            }

            // Se temos duas URLs, são streams separados de vídeo e áudio
            if (urls.length >= 2) {
                resolve({
                    videoUrl: urls[0],
                    audioUrl: urls[1]
                });
            } else {
                // Se temos apenas uma URL, é um stream combinado
                resolve({
                    url: urls[0]
                });
            }
        });
    });
}

// Função para pré-carregar URLs em lote
async function preloadBatch(videoIds) {
    console.log('\n=== Iniciando pré-carregamento em lote ===');
    console.log('Vídeos para pré-carregar:', videoIds.length);

    // Processa em grupos de 3 para não sobrecarregar
    const batchSize = 3;
    for (let i = 0; i < videoIds.length; i += batchSize) {
        const batch = videoIds.slice(i, i + batchSize);
        console.log(`\nProcessando lote ${i/batchSize + 1}:`, batch);

        // Processa cada grupo em paralelo
        await Promise.all(batch.map(async (videoId) => {
            try {
                // Verifica se já está em cache
                if (videoUrlCache.has(videoId)) {
                    console.log(`[${videoId}] Já em cache`);
                    return;
                }

                console.log(`[${videoId}] Iniciando pré-carregamento`);
                const result = await preloadVideoUrl(videoId);
                console.log(`[${videoId}] Pré-carregamento concluído`);

                // Armazena no cache
                if (result && (result.videoUrl || result.url)) {
                    videoUrlCache.set(videoId, {
                        ...result,
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                console.error(`[${videoId}] Erro no pré-carregamento:`, error.message);
            }
        }));

        // Pequeno delay entre os lotes para não sobrecarregar
        if (i + batchSize < videoIds.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log('\n=== Pré-carregamento em lote concluído ===');
}

app.get('/search', async (req, res) => {
    const query = req.query.q;
    const page = parseInt(req.query.page) || 1;
    const resultsPerPage = 10;
    
    if (!query) {
        console.log('Query vazia ou indefinida');
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    if (currentProcess) {
        console.log('Cancelando processo anterior de busca...');
        try {
            process.kill(currentProcess.pid);
        } catch (e) {
            console.log('Processo anterior já finalizado');
        }
    }

    const ytDlpCommand = `${path.join(__dirname, 'bin/yt-dlp.exe')} ytsearch${resultsPerPage * page}:"${query}" --flat-playlist --no-warnings -j`;
    console.log('\n=== Iniciando busca de vídeos ===');
    console.log('Comando:', ytDlpCommand);
    console.log('Página:', page);
    console.log('Resultados por página:', resultsPerPage);
    console.log('Query:', query);
    
    const startTime = Date.now();

    currentProcess = exec(
        ytDlpCommand,
        { maxBuffer: MAX_BUFFER },
        async (error, stdout, stderr) => {
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            
            currentProcess = null;
            console.log(`\nTempo de busca: ${duration.toFixed(2)} segundos`);
            
            if (error) {
                console.error('Erro no yt-dlp:', error);
                return res.status(500).json({ error: 'Failed to search video' });
            }
            
            try {
                const allVideos = stdout.split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line))
                    .map(video => ({
                        id: video.id,
                        title: video.title,
                        duration: video.duration,
                        thumbnail: video.thumbnails ? video.thumbnails[0].url : null
                    }));

                const startIndex = (page - 1) * resultsPerPage;
                const videos = allVideos.slice(startIndex);

                console.log(`\nResultados encontrados: ${allVideos.length}`);
                console.log(`Resultados retornados: ${videos.length}`);

                // Inicia o pré-carregamento das URLs em background
                const videoIds = videos.map(v => v.id);
                preloadBatch(videoIds);

                res.json({ 
                    videos,
                    hasMore: videos.length === resultsPerPage
                });
            } catch (err) {
                console.error('Erro ao processar dados dos vídeos:', err);
                res.status(500).json({ error: 'Failed to parse video data' });
            }
        }
    );
});

// Endpoint para obter URL do vídeo
app.get('/video/:videoId', async (req, res) => {
    try {
        const videoId = req.params.videoId;
        console.log('\n=== Nova requisição de vídeo ===');
        console.log('ID do vídeo:', videoId);

        // Verificar cache primeiro
        const cachedUrl = videoUrlCache.get(videoId);
        if (cachedUrl && Date.now() - cachedUrl.timestamp < 3600000) {
            console.log('Retornando URL do cache');
            return res.json(cachedUrl);
        }

        // Comando yt-dlp melhorado para lidar com diferentes formatos
        const command = `yt-dlp -f "bv*[height<=720]+ba/b[height<=720]/best" --no-playlist --no-warnings --print-json --get-url "https://www.youtube.com/watch?v=${videoId}"`;
        
        exec(command, { maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
            if (error) {
                console.error('Erro ao executar yt-dlp:', error);
                return res.status(500).json({ error: 'Erro ao obter URL do vídeo' });
            }

            const lines = stdout.trim().split('\n');
            let videoUrl = null;
            let audioUrl = null;
            let info = null;

            // Processar saída do yt-dlp
            try {
                // A última linha é sempre o JSON com informações do vídeo
                info = JSON.parse(lines[lines.length - 1]);
                
                // As URLs vêm antes do JSON
                const urls = lines.slice(0, -1);
                if (urls.length >= 2) {
                    videoUrl = urls[0];
                    audioUrl = urls[1];
                } else if (urls.length === 1) {
                    videoUrl = urls[0];
                    // Se só tiver uma URL, é um stream combinado
                    audioUrl = urls[0];
                }

                const result = {
                    videoUrl,
                    audioUrl,
                    format: info.ext,
                    timestamp: Date.now()
                };

                // Armazenar no cache
                videoUrlCache.set(videoId, result);
                console.log('URLs obtidas com sucesso');

                res.json(result);
            } catch (parseError) {
                console.error('Erro ao processar saída do yt-dlp:', parseError);
                res.status(500).json({ error: 'Erro ao processar informações do vídeo' });
            }
        });
    } catch (error) {
        console.error('Erro ao processar requisição de vídeo:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para proxy de stream
app.get('/proxy-stream', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) {
            return res.status(400).send('URL parameter is required');
        }

        const response = await fetch(url);
        
        // Forward the content type and other relevant headers
        res.setHeader('Content-Type', response.headers.get('content-type'));
        
        // Stream the response
        const reader = response.body.getReader();
        res.setHeader('Transfer-Encoding', 'chunked');

        // Stream the chunks
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();
    } catch (error) {
        console.error('Proxy stream error:', error);
        res.status(500).send('Error proxying stream');
    }
});

// Adicionar endpoint de status
app.get('/status', (req, res) => {
    res.json({ status: 'online', type: 'video' });
});

// Limpar cache a cada hora
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [key, value] of videoUrlCache.entries()) {
        if (value.timestamp < oneHourAgo) {
            videoUrlCache.delete(key);
        }
    }
}, 60 * 60 * 1000);

function startServer(port) {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
            resolve(server);
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${port} is busy, trying ${port + 1}...`);
                resolve(startServer(port + 1));
            } else {
                reject(err);
            }
        });
    });
}

// Start the server with port fallback
startServer(port).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
