export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

export const EQ_PRESETS = {
    flat: {
        name: 'FLAT',
        label: 'Flat / Neutral',
        gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        preamp: 0
    },
    bass_boost: {
        name: 'BASS BOOST',
        label: 'Bass Boost',
        gains: [8, 7, 5, 3, 1, 0, 0, 0, 0, 0],
        preamp: -2
    },
    rock: {
        name: 'ROCK',
        label: 'Rock & Alt',
        gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5],
        preamp: -1
    },
    pop: {
        name: 'POP',
        label: 'Pop & Modern',
        gains: [-1, 1, 3, 4, 4, 3, 1, 0, 2, 3],
        preamp: -1
    },
    electronic: {
        name: 'EDM',
        label: 'Electronic / EDM',
        gains: [6, 5, 3, 0, -2, 1, 2, 3, 5, 5],
        preamp: -2
    },
    hiphop: {
        name: 'HIP-HOP',
        label: 'Hip-Hop & Rap',
        gains: [6, 5, 3, 1, -1, 1, 2, 1, 3, 4],
        preamp: -1.5
    },
    rnb: {
        name: 'R&B',
        label: 'R&B / Soul',
        gains: [4, 6, 3, 0, 1, 2, 2, 1, 2, 3],
        preamp: -1
    },
    jazz: {
        name: 'JAZZ',
        label: 'Jazz & Lounge',
        gains: [3, 2, 1, 2, -1, -1, 0, 1, 3, 4],
        preamp: 0
    },
    classical: {
        name: 'CLASSIC',
        label: 'Classical & Symphony',
        gains: [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
        preamp: 0
    },
    acoustic: {
        name: 'ACOUSTIC',
        label: 'Acoustic & Folk',
        gains: [3, 2, 1, 1, 2, 2, 3, 3, 3, 2],
        preamp: 0
    },
    dance: {
        name: 'DANCE',
        label: 'Dance & Club',
        gains: [5, 6, 4, 1, 0, 0, 2, 3, 4, 2],
        preamp: -1.5
    },
    metal: {
        name: 'METAL',
        label: 'Heavy Metal',
        gains: [5, 4, 2, 0, -2, -2, 1, 4, 5, 4],
        preamp: -1.5
    },
    vocal: {
        name: 'VOCAL',
        label: 'Vocal / Podcast',
        gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
        preamp: 0
    },
    treble_boost: {
        name: 'TREBLE',
        label: 'Treble Boost',
        gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
        preamp: -1
    },
    perfect: {
        name: 'PERFECT',
        label: 'Harmonic Studio Balance',
        gains: [3.5, 3.0, 1.5, -0.5, 0.5, 1.5, 2.0, 2.5, 3.0, 2.0],
        preamp: -1.5
    }
};


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
