// Hash router. Section changes are pushed by app.js `navigate()` via history.replaceState,
// so the router only reacts to deliberate hash edits and back/forward moves.
const routes = { home: 'home', search: 'search', library: 'library', playlists: 'playlists' };

function getCurrentRoute() {
    const hash = window.location.hash.slice(1) || 'home';
    return routes[hash] || 'home';
}

window.addEventListener('hashchange', async () => {
    if (window.navigate) await window.navigate(getCurrentRoute());
});

if (!window.location.hash) {
    try { history.replaceState(null, '', '#home'); } catch { window.location.hash = '#home'; }
}
