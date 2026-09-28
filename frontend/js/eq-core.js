// PulseTerm — Pure Audio DSP Core Logic (Framework-independent, DOM-independent)
// Clean mathematical models for Web Audio tuning, genre routing, and spatial calculations

export const GENRE_PRIORITY = [
    'metal', 'dangdut', 'hip-hop', 'edm', 'rock', 'punk', 'alternative',
    'r&b', 'jazz', 'blues', 'classical', 'soundtrack', 'acoustic',
    'gospel', 'funk', 'reggae', 'latin', 'k-pop', 'j-pop', 'pop',
    'indie', 'lofi', 'ambient'
];

export const GENRE_MAP = {
    metal: 'metal',
    dangdut: 'bass_boost',
    'hip-hop': 'hiphop',
    edm: 'electronic',
    rock: 'rock',
    punk: 'rock',
    alternative: 'rock',
    'r&b': 'rnb',
    jazz: 'jazz',
    blues: 'jazz',
    classical: 'classical',
    soundtrack: 'classical',
    acoustic: 'acoustic',
    gospel: 'acoustic',
    funk: 'dance',
    reggae: 'dance',
    latin: 'dance',
    'k-pop': 'pop',
    'j-pop': 'pop',
    pop: 'pop',
    indie: 'pop',
    lofi: 'flat',
    ambient: 'flat'
};

export function mapGenresToPreset(genres) {
    if (!Array.isArray(genres) || genres.length === 0) return 'flat';
    const set = new Set(genres.map(g => String(g).toLowerCase().trim()));
    for (const g of GENRE_PRIORITY) {
        if (set.has(g)) {
            return GENRE_MAP[g] || 'flat';
        }
    }
    return 'flat';
}

// Local regex-based fallback rules with word boundaries.
// Ambiguous keywords removed: remix, club, dance, guitar, piano, queen, muse, ost, caesar
export const LOCAL_GENRE_RULES = [
    { preset: 'metal', words: ['metal', 'metalcore', 'deathcore', 'slipknot', 'metallica', 'megadeth', 'avenged', 'soad', 'pantera', 'iron maiden', 'bmth', 'rammstein', 'architect', 'lorna shore', 'bad omens'] },
    { preset: 'rock', words: ['rock', 'grunge', 'nirvana', 'linkin park', 'green day', 'arctic monkeys', 'oasis', 'foo fighters', 'paramore', 'rhcp', 'strokes', 'radiohead', 'weezer'] },
    { preset: 'electronic', words: ['edm', 'house', 'techno', 'trance', 'dubstep', 'dnb', 'drum and bass', 'avicii', 'skrillex', 'garrix', 'tiesto', 'marshmello', 'alan walker'] },
    { preset: 'hiphop', words: ['hip hop', 'hip-hop', 'rap', 'trap', 'drill', 'eminem', 'drake', 'kendrick', 'kanye', 'travis scott', 'post malone', '2pac', 'snoop'] },
    { preset: 'rnb', words: ['r&b', 'rnb', 'soul', 'neo soul', 'sza', 'frank ocean', 'brent faiyaz', 'giveon'] },
    { preset: 'jazz', words: ['jazz', 'bossa', 'swing', 'bebop', 'miles davis', 'coltrane', 'bill evans'] },
    { preset: 'classical', words: ['classical', 'symphony', 'orchestra', 'bach', 'beethoven', 'mozart', 'chopin', 'soundtrack', 'zimmer'] },
    { preset: 'acoustic', words: ['acoustic', 'akustik', 'unplugged', 'folk', 'fingerstyle'] },
    { preset: 'vocal', words: ['podcast', 'speech', 'interview', 'acapella', 'vocal'] },
    { preset: 'bass_boost', words: ['dangdut', 'koplo', 'funkot', 'breakbeat', 'bass boost', 'phonk'] },
    { preset: 'pop', words: ['pop', 'k-pop', 'kpop', 'j-pop', 'jpop', 'bts', 'blackpink', 'twice', 'newjeans', 'yoasobi', 'taylor swift', 'ariana', 'dua lipa', 'billie eilish'] },
];

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectPresetLocal(song) {
    if (!song) return 'perfect';
    const raw = `${song.title || ''} ${song.artist || ''} ${song.album || ''}`;
    const text = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    for (const rule of LOCAL_GENRE_RULES) {
        for (const word of rule.words) {
            const escaped = escapeRegex(word);
            // Word boundary regex: start of string or non-alphanumeric, then word, then end of string or non-alphanumeric
            const regex = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i');
            if (regex.test(text)) {
                return rule.preset;
            }
        }
    }
    return 'flat';
}
