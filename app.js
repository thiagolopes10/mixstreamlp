// Elementos do DOM
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const resultsDiv = document.getElementById('results');
const audioPlayer = document.getElementById('audio-player');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const playPauseButton = document.getElementById('play-pause-button');
const nowPlayingDiv = document.getElementById('now-playing');
const autoplayToggle = document.getElementById('autoplay-toggle');
const loadMoreButton = document.getElementById('load-more-button');
const loadMoreContainer = document.getElementById('load-more-container');
const playlistForm = document.getElementById('playlist-form');
const modalClose = document.querySelector('.modal-close');
const playlistModal = document.getElementById('playlist-modal');

// Variáveis globais
let currentResults = [];
let searchResults = [];
let playlistResults = [];
let currentIndex = -1;
let isPlaying = false;
let currentQuery = '';
let currentOffset = 0;
let playlists = [];
let isPlayingPlaylist = false;

// Funções de busca
async function performSearch(offset = 0) {
    const query = offset === 0 ? searchInput.value.trim() : currentQuery;
    if (!query) {
        showError('Please enter a search term');
        return;
    }

    if (offset === 0) {
        currentQuery = query;
        resultsDiv.innerHTML = 'Searching...';
        currentResults = [];
        searchResults = [];
        currentOffset = 0;
    }

    loadMoreButton.disabled = true;
    
    try {
        const response = await fetch(`http://localhost:3002/search?q=${encodeURIComponent(query)}&offset=${offset}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Search failed');
        }
        
        const data = await response.json();
        const results = data.results;
        
        if (offset === 0) {
            currentResults = results;
            searchResults = results;
            isPlayingPlaylist = false;
            resultsDiv.innerHTML = '';
        } else {
            currentResults = [...currentResults, ...results];
            searchResults = [...searchResults, ...results];
        }

        displayResults(results, offset);
        
        loadMoreContainer.style.display = data.hasMore ? 'block' : 'none';
        loadMoreButton.disabled = false;
        currentOffset = offset + results.length;
    } catch (error) {
        showError('Error performing search: ' + error.message);
        loadMoreContainer.style.display = 'none';
    }
}

// Funções de exibição
function showError(message) {
    resultsDiv.innerHTML = `<div class="error">${message}</div>`;
}

function displayResults(results, offset) {
    if (results.length === 0 && offset === 0) {
        resultsDiv.innerHTML = '<div class="error">No results found</div>';
        loadMoreContainer.style.display = 'none';
        return;
    }

    const container = offset === 0 ? resultsDiv : document.createDocumentFragment();
    
    results.forEach((result, index) => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'result-item';
        resultDiv.dataset.index = offset + index;
        
        const thumbnailHTML = result.thumbnail 
            ? `<img src="${result.thumbnail}" class="thumbnail" alt="${result.title}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22><rect width=%22120%22 height=%2268%22 fill=%22%23ddd%22/><text x=%2260%22 y=%2234%22 fill=%22%23666%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>No Image</text></svg>'">`
            : `<div class="thumbnail default-thumbnail">No Image</div>`;
        
        resultDiv.innerHTML = `
            ${thumbnailHTML}
            <div class="result-content">
                <h3>${result.title}</h3>
                <div class="result-info">
                    <p>Duration: ${formatDuration(result.duration)}</p>
                    <p>Channel: ${result.uploader}</p>
                </div>
            </div>
            <button class="playlist-button add-to-playlist" data-id="${result.id}" data-title="${result.title}" data-duration="${result.duration}" data-thumbnail="${result.thumbnail}" data-uploader="${result.uploader}">
                Add to Playlist
            </button>
        `;
        
        resultDiv.querySelector('.result-content').onclick = () => playVideo(offset + index);
        container.appendChild(resultDiv);
    });

    if (offset > 0) {
        resultsDiv.appendChild(container);
    }
}

// Funções de formatação e controle
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function updatePlayPauseButton() {
    playPauseButton.textContent = isPlaying ? 'Pause' : 'Play';
}

function togglePlayPause() {
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
}

// Funções de reprodução
async function playVideo(index) {
    if (index < 0 || index >= currentResults.length) {
        return;
    }

    try {
        // Pausar a reprodução atual antes de iniciar uma nova
        if (!audioPlayer.paused) {
            await audioPlayer.pause();
        }
        
        currentIndex = index;
        const video = currentResults[index];
        
        // Atualizar interface
        nowPlayingDiv.textContent = `Now Playing: ${video.title}`;
        document.querySelectorAll('.result-item').forEach((item, i) => {
            item.classList.toggle('playing', i === index);
        });
        
        // Habilitar/desabilitar botões de controle
        prevButton.disabled = currentIndex <= 0;
        nextButton.disabled = currentIndex >= currentResults.length - 1;
        playPauseButton.disabled = false;

        // Buscar URL do stream
        const response = await fetch(`http://localhost:3002/stream?id=${video.id}`);
        if (!response.ok) {
            throw new Error('Failed to get stream URL');
        }
        const data = await response.json();
        
        if (!data.url) {
            throw new Error('No stream URL received');
        }

        // Limpar o src atual antes de definir o novo
        audioPlayer.src = '';
        await new Promise(resolve => setTimeout(resolve, 100)); // Pequeno delay para garantir
        
        // Configurar e reproduzir o áudio
        audioPlayer.src = data.url;
        await audioPlayer.play()
            .then(() => {
                isPlaying = true;
                updatePlayPauseButton();
            })
            .catch(error => {
                console.error('Playback error:', error);
                showError('Error playing audio: ' + error.message);
            });
    } catch (error) {
        console.error('Error playing video:', error);
        showError('Error playing video: ' + error.message);
    }
}

function updateControls() {
    prevButton.disabled = currentIndex <= 0;
    nextButton.disabled = currentIndex >= currentResults.length - 1;
    playPauseButton.disabled = currentIndex === -1;
    
    document.querySelectorAll('.result-item').forEach(item => {
        item.classList.remove('playing');
        if (parseInt(item.dataset.index) === currentIndex) {
            item.classList.add('playing');
        }
    });

    if (currentIndex >= 0 && currentIndex < currentResults.length) {
        const current = currentResults[currentIndex];
        nowPlayingDiv.textContent = `Now Playing: ${current.title}`;
    } else {
        nowPlayingDiv.textContent = '';
    }

    updatePlayPauseButton();
}

// Funções de playlist
async function loadPlaylists() {
    try {
        const response = await fetch('http://localhost:3002/playlists');
        if (!response.ok) {
            throw new Error('Failed to load playlists');
        }
        playlists = await response.json();
        displayPlaylists();
    } catch (error) {
        console.error('Error loading playlists:', error);
        showError('Failed to load playlists');
    }
}

async function createPlaylist(name) {
    try {
        const response = await fetch('http://localhost:3002/playlists', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });

        if (!response.ok) {
            throw new Error('Failed to create playlist');
        }

        await loadPlaylists();
    } catch (error) {
        console.error('Error creating playlist:', error);
        showError('Failed to create playlist');
    }
}

async function deletePlaylist(playlistId) {
    try {
        const response = await fetch(`http://localhost:3002/playlists/${playlistId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete playlist');
        }

        await loadPlaylists();
    } catch (error) {
        console.error('Error deleting playlist:', error);
        showError('Failed to delete playlist');
    }
}

async function editPlaylist(playlistId) {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;

    document.getElementById('modal-title').textContent = 'Edit Playlist';
    document.getElementById('playlist-name').value = playlist.name;
    playlistModal.classList.add('active');

    const currentSubmitHandler = playlistForm.onsubmit;
    playlistForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('playlist-name').value.trim();
        if (name) {
            try {
                const response = await fetch(`http://localhost:3002/playlists/${playlistId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name })
                });

                if (!response.ok) {
                    throw new Error('Failed to update playlist');
                }

                await loadPlaylists();
                playlistModal.classList.remove('active');
            } catch (error) {
                console.error('Error updating playlist:', error);
                showError('Failed to update playlist');
            }
        }
        playlistForm.onsubmit = currentSubmitHandler;
    };
}

async function addSongToPlaylist(playlistId, song) {
    try {
        const response = await fetch(`http://localhost:3002/playlists/${playlistId}/songs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ song })
        });

        if (!response.ok) {
            throw new Error('Failed to add song to playlist');
        }

        const updatedPlaylist = await response.json();
        await loadPlaylists();
        showSuccessMessage(`Added "${song.title}" to "${updatedPlaylist.name}"`);
    } catch (error) {
        console.error('Error adding song to playlist:', error);
        showError('Failed to add song to playlist');
    }
}

function displayPlaylists() {
    const container = document.getElementById('playlists-container');
    container.innerHTML = '';

    playlists.forEach(playlist => {
        const playlistDiv = document.createElement('div');
        playlistDiv.className = 'playlist-item';
        
        const headerHtml = `
            <div class="playlist-header">
                <div>
                    <h3>${playlist.name}</h3>
                    <p>${playlist.songs.length} songs</p>
                </div>
                <div class="playlist-controls">
                    <button class="playlist-button" onclick="playPlaylist('${playlist.id}')">Play</button>
                    <button class="playlist-button" onclick="editPlaylist('${playlist.id}')">Edit</button>
                    <button class="playlist-button" onclick="deletePlaylist('${playlist.id}')">Delete</button>
                </div>
            </div>
        `;

        const songsHtml = `
            <div class="playlist-songs">
                ${playlist.songs.map(song => `
                    <div class="playlist-song">
                        <img src="${song.thumbnail || 'placeholder.jpg'}" alt="Thumbnail">
                        <div class="playlist-song-info">
                            <div class="playlist-song-title">${song.title}</div>
                            <div class="playlist-song-artist">${song.uploader}</div>
                        </div>
                        <button class="playlist-button" onclick="removeSongFromPlaylist('${playlist.id}', '${song.id}')">Remove</button>
                    </div>
                `).join('')}
            </div>
        `;

        playlistDiv.innerHTML = headerHtml + (playlist.songs.length > 0 ? songsHtml : '');
        container.appendChild(playlistDiv);
    });
}

async function removeSongFromPlaylist(playlistId, songId) {
    try {
        const response = await fetch(`http://localhost:3002/playlists/${playlistId}/songs/${songId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to remove song from playlist');
        }

        await loadPlaylists();
        showSuccessMessage('Song removed from playlist');
    } catch (error) {
        console.error('Error removing song:', error);
        showError('Failed to remove song from playlist');
    }
}

function showSuccessMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'success-message';
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

async function preloadPlaylistStreams(songs) {
    console.log('Pre-loading playlist streams...');
    try {
        const preloadPromises = songs.map(async (song) => {
            try {
                const response = await fetch(`http://localhost:3002/stream?id=${song.id}&preload=true`);
                if (!response.ok) {
                    throw new Error('Failed to preload stream');
                }
                console.log(`Pre-loaded stream for: ${song.title}`);
            } catch (error) {
                console.error(`Error pre-loading stream for ${song.title}:`, error);
            }
        });

        await Promise.all(preloadPromises);
        console.log('Finished pre-loading all playlist streams');
    } catch (error) {
        console.error('Error in playlist pre-loading:', error);
    }
}

function playPlaylist(playlistId) {
    const playlist = playlists.find(p => p.id === playlistId);
    if (playlist && playlist.songs.length > 0) {
        currentResults = playlist.songs;
        playlistResults = playlist.songs;
        isPlayingPlaylist = true;
        currentIndex = -1;
        
        // Iniciar pré-carregamento das músicas da playlist
        preloadPlaylistStreams(playlist.songs);
        
        // Começar a reproduzir a primeira música
        playVideo(0);
    } else {
        showError('Playlist is empty');
    }
}

// Event Listeners
document.getElementById('create-playlist-button').addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Create Playlist';
    document.getElementById('playlist-name').value = '';
    playlistModal.classList.add('active');
    
    playlistForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('playlist-name').value.trim();
        if (name) {
            await createPlaylist(name);
            playlistModal.classList.remove('active');
        }
    };
});

modalClose.addEventListener('click', () => {
    playlistModal.classList.remove('active');
});

prevButton.addEventListener('click', () => {
    if (currentIndex > 0) {
        playVideo(currentIndex - 1);
    }
});

nextButton.addEventListener('click', () => {
    if (currentIndex < currentResults.length - 1) {
        playVideo(currentIndex + 1);
    }
});

playPauseButton.addEventListener('click', togglePlayPause);

audioPlayer.addEventListener('play', () => {
    isPlaying = true;
    updatePlayPauseButton();
});

audioPlayer.addEventListener('pause', () => {
    isPlaying = false;
    updatePlayPauseButton();
});

audioPlayer.addEventListener('ended', () => {
    if (autoplayToggle.checked && currentIndex < currentResults.length - 1) {
        playVideo(currentIndex + 1);
    }
});

searchButton.addEventListener('click', () => performSearch());

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

loadMoreButton.addEventListener('click', () => {
    performSearch(currentOffset);
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('add-to-playlist')) {
        const index = parseInt(e.target.parentElement.dataset.index);
        const song = {
            id: e.target.dataset.id,
            title: e.target.dataset.title,
            duration: e.target.dataset.duration,
            thumbnail: e.target.dataset.thumbnail,
            uploader: e.target.dataset.uploader
        };

        const playlistSelect = document.createElement('select');
        playlistSelect.innerHTML = `
            <option value="">Select a playlist...</option>
            ${playlists.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        `;
        const previousSelect = e.target.parentElement.querySelector('select');
        if (previousSelect) {
            previousSelect.remove();
        }

        playlistSelect.addEventListener('change', () => {
            const playlistId = playlistSelect.value;
            if (playlistId) {
                addSongToPlaylist(playlistId, song);
                playlistSelect.remove();
            }
        });

        e.target.parentElement.appendChild(playlistSelect);
    }
});

document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const tabId = tab.dataset.tab;
        document.getElementById(`${tabId}-tab`).classList.add('active');

        if (tabId === 'playlists') {
            loadPlaylists();
        } else if (tabId === 'search' && searchResults.length > 0) {
            currentResults = searchResults;
            isPlayingPlaylist = false;
            displayResults(searchResults, 0);
        }
    });
});
