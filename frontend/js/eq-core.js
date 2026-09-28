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

export function bandPowerDb(freqDb, sampleRate, fftSize, fc) {
    if (!freqDb || !freqDb.length || !sampleRate || !fftSize || !fc) return -100;
    const binWidth = sampleRate / fftSize;
    const fLow = fc / Math.SQRT2;
    const fHigh = fc * Math.SQRT2;
    const kLow = Math.max(0, Math.floor(fLow / binWidth));
    const kHigh = Math.min(freqDb.length - 1, Math.ceil(fHigh / binWidth));

    if (kLow > kHigh) {
        const k = Math.min(freqDb.length - 1, Math.max(0, Math.round(fc / binWidth)));
        return freqDb[k];
    }

    let sumPower = 0;
    let count = 0;
    for (let k = kLow; k <= kHigh; k++) {
        sumPower += Math.pow(10, freqDb[k] / 10);
        count++;
    }
    const avgPower = count > 0 ? (sumPower / count) : 1e-12;
    return 10 * Math.log10(Math.max(avgPower, 1e-12));
}

export function computeTuneCorrections(bandDb) {
    if (!Array.isArray(bandDb) || bandDb.length !== 10) {
        return { gains: new Array(10).fill(0), preamp: 0, hint: 'FLAT' };
    }

    // Ref at 1000 Hz (index 5)
    const refDb = bandDb[5];
    const targetTiltPerOctave = -4.5; // Pink noise reference curve

    // delta[i] = targetTilt[i] - actualRelativeDb[i]
    const delta = bandDb.map((val, i) => {
        const targetRel = (i - 5) * targetTiltPerOctave;
        const actualRel = val - refDb;
        return targetRel - actualRel;
    });

    // 3-point smoothing [0.25, 0.5, 0.25] with clamped boundaries
    const smoothed = delta.map((d, i) => {
        if (i === 0) return 0.75 * delta[0] + 0.25 * delta[1];
        if (i === delta.length - 1) return 0.75 * delta[9] + 0.25 * delta[8];
        return 0.25 * delta[i - 1] + 0.5 * delta[i] + 0.25 * delta[i + 1];
    });

    // Clamp corrections to [-4, +4] dB per band
    const gains = smoothed.map(g => {
        const clamped = Math.max(-4, Math.min(4, g));
        return Math.round(clamped * 10) / 10;
    });

    // Headroom auto-gain staging to prevent digital clipping
    const maxGain = Math.max(0, ...gains);
    const sumPos = gains.filter(g => g > 0).reduce((a, b) => a + b, 0);
    const preamp = -(Math.round((maxGain * 0.6 + (sumPos > 10 ? 1.0 : 0)) * 10) / 10);

    // Formulate descriptive hint
    let hint = 'BALANCED';
    const bassAvg = (gains[0] + gains[1] + gains[2]) / 3;
    const trebleAvg = (gains[7] + gains[8] + gains[9]) / 3;
    if (bassAvg > 1.0 && trebleAvg < -0.5) hint = '+BASS · TAME';
    else if (bassAvg > 1.0) hint = '+BASS';
    else if (bassAvg < -1.0 && trebleAvg > 1.0) hint = 'CLARITY · +AIR';
    else if (bassAvg < -1.0) hint = 'CLARITY';
    else if (trebleAvg > 1.0) hint = '+AIR';
    else if (trebleAvg < -1.0) hint = 'WARM';

    return { gains, preamp, hint };
}

