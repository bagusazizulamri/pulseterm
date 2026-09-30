document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Player instance
    window.player = new Player();
    window.spatial = new SpatialAudioEngine();
    window.equalizer = new EqualizerEngine();

    // 2. Monkey-patch player UI updates to use Modern DOM
    const oldUpdateProgress = window.player.updateProgress.bind(window.player);
    window.player.updateProgress = () => {
        oldUpdateProgress(); // Keep logic running
        const p = window.player;
        const cur = document.getElementById('modern-time-current');
        const tot = document.getElementById('modern-time-total');
        const prog = document.getElementById('modern-progress');
        if (!p.audio || !p.currentTrack) return;
        
        cur.textContent = p.formatTime(p.audio.currentTime);
        tot.textContent = p.formatTime(p.audio.duration || p.currentTrack.duration || 0);
        
        if (p.audio.duration) {
            prog.value = (p.audio.currentTime / p.audio.duration) * 100;
        }
    };

    const oldUpdateUIState = window.player.updateUIState.bind(window.player);
    window.player.updateUIState = (state) => {
        oldUpdateUIState(state);
        const icon = document.getElementById('play-icon');
        if (icon) {
            if (state === 'playing') {
                icon.className = 'ph ph-pause-circle';
            } else {
                icon.className = 'ph ph-play-circle';
            }
        }
    };

    const oldPlayTrack = window.player.playTrack.bind(window.player);
    window.player.playTrack = async (track, isHistory = false) => {
        await oldPlayTrack(track, isHistory);
        document.getElementById('modern-title').textContent = track.title || 'Unknown';
        document.getElementById('modern-artist').textContent = track.artist || 'Unknown';
        document.getElementById('modern-cover').src = track.thumbnail || '/assets/favicon.svg';
    };

    // 3. Bind Controls
    document.getElementById('modern-play').onclick = () => window.player.togglePlay();
    document.getElementById('modern-prev').onclick = () => window.player.prev();
    document.getElementById('modern-next').onclick = () => window.player.next();
    
    document.getElementById('modern-progress').oninput = (e) => {
        if (window.player.audio && window.player.audio.duration) {
            window.player.audio.currentTime = (e.target.value / 100) * window.player.audio.duration;
        }
    };

    const volSlider = document.getElementById('modern-volume');
    volSlider.value = (window.player.volume || 0.8) * 100;
    volSlider.oninput = (e) => {
        window.player.setVolume(e.target.value / 100);
        const icon = document.getElementById('vol-icon');
        if (e.target.value == 0) icon.className = 'ph ph-speaker-x';
        else if (e.target.value < 50) icon.className = 'ph ph-speaker-low';
        else icon.className = 'ph ph-speaker-high';
    };

    // 4. Load Data
    try {
        const historyRes = await window.api.getHistory();
        if (historyRes.success) {
            renderSongs(historyRes.data.slice(0, 20), document.getElementById('home-content'));
        }
    } catch (e) {
        console.error("Failed to load history", e);
    }
});

function renderSongs(songs, container) {
    if (!songs || songs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">No songs found.</p>';
        return;
    }
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '0.5rem';

    songs.forEach(song => {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.innerHTML = `
            <img src="${song.thumbnail || '/assets/favicon.svg'}" alt="cover">
            <div class="song-card-text">
                <div class="song-card-title">${song.title}</div>
                <div class="song-card-artist">${song.artist}</div>
            </div>
            <button class="icon-btn song-card-action"><i class="ph ph-play"></i></button>
        `;
        card.onclick = () => {
            window.player.queue = [song];
            window.player.currentIndex = 0;
            window.player.playTrack(song);
        };
        list.appendChild(card);
    });
    container.appendChild(list);
}
