export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];
export const EQ_HINTS = [
    { freq: '32Hz',  type: 'bass',   label: 'SUB',     role: 'Sub-Bass',       desc: 'Naikkan untuk getaran sub-bass / 808' },
    { freq: '64Hz',  type: 'bass',   label: 'BASS',    role: 'Kick Bass',      desc: 'Naikkan untuk dentuman kick & punch bass' },
    { freq: '125Hz', type: 'bass',   label: 'WARMTH',  role: 'Warm Bass',      desc: 'Naikkan untuk ketebalan bass & low-end hangat' },
    { freq: '250Hz', type: 'mid',    label: 'BODY',    role: 'Low-Mid',        desc: 'Naikkan untuk bobot instrumen, turunkan jika muddy/keruh' },
    { freq: '500Hz', type: 'mid',    label: 'MID',     role: 'Mid Body',       desc: 'Naikkan untuk kehangatan vokal & bodi instrumen' },
    { freq: '1kHz',  type: 'vocal',  label: 'VOCAL',   role: 'Vocal Core',     desc: 'Naikkan untuk menonjolkan vokal utama / lead' },
    { freq: '2kHz',  type: 'vocal',  label: 'CLARITY', role: 'Vocal Clarity',  desc: 'Naikkan untuk kejelasan artikulasi vokal & konsonan' },
    { freq: '4kHz',  type: 'treble', label: 'TREBLE',  role: 'Treble Attack',  desc: 'Naikkan untuk gigitan treble, snare attack & petikan' },
    { freq: '8kHz',  type: 'treble', label: 'BRIGHT',  role: 'Brilliance',     desc: 'Naikkan untuk kilau cymbals & suara renyah/garing' },
    { freq: '16kHz', type: 'treble', label: 'AIR',     role: 'Air / Shimmer',  desc: 'Naikkan untuk nuansa airy, lega & shimmer halus' }
];

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
        gains: [1.0, 2.0, 1.5, 0.0, 0.5, 1.5, 2.0, 2.0, 2.5, 2.5],
        preamp: -1
    },
    pop_upbeat: {
        name: 'POP UPBEAT',
        label: 'Pop Upbeat / Fun',
        gains: [1.5, 3.0, 1.5, -0.5, 0.0, 1.5, 2.5, 2.0, 3.0, 3.5],
        preamp: -1.5
    },
    sad_ballad: {
        name: 'EMOTIONAL',
        label: 'Mellow & Emotional Ballad',
        gains: [2.0, 2.0, 1.0, 1.0, 1.5, 2.5, 3.0, 2.0, 1.5, 1.0],
        preamp: -1.0
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
        name: 'R&B / CITY POP',
        label: 'R&B / Soul / City Pop',
        gains: [3.0, 4.0, 2.0, 0.5, 1.0, 1.5, 2.0, 1.5, 2.5, 3.0],
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
        label: 'Metal & Heavy Rock',
        gains: [2.5, 3.5, 1.5, -1.0, -0.5, 1.0, 2.5, 2.0, 1.5, 1.0],
        preamp: -2.0
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

export const SPECTRAL_ARCHETYPES = {
    pop_upbeat: {
        name: 'POP UPBEAT',
        label: 'Pop Upbeat / Fun',
        baseGains: [1.5, 3.0, 1.5, -0.5, 0.0, 1.5, 2.5, 2.0, 3.0, 3.5],
        preamp: -1.5,
        targetTilt: -4.2,
        priorities: [1.0, 1.3, 1.0, 0.8, 0.8, 1.1, 1.2, 1.1, 1.4, 1.5],
        maxBoost: 3.5,
        maxCut: -2.5
    },
    sad_ballad: {
        name: 'EMOTIONAL',
        label: 'Mellow & Emotional Ballad',
        baseGains: [2.0, 2.0, 1.0, 1.0, 1.5, 2.5, 3.0, 2.0, 1.5, 1.0],
        preamp: -1.0,
        targetTilt: -4.8,
        priorities: [1.1, 1.1, 1.2, 1.2, 1.3, 1.4, 1.4, 1.0, 0.8, 0.7],
        maxBoost: 3.0,
        maxCut: -3.0
    },
    metal: {
        name: 'METAL',
        label: 'Metal & Heavy Subgenres',
        baseGains: [2.5, 3.5, 1.5, -1.0, -0.5, 1.0, 2.5, 2.0, 1.5, 1.0],
        preamp: -2.0,
        targetTilt: -4.5,
        priorities: [1.1, 1.4, 1.1, 0.9, 0.9, 1.2, 1.4, 1.2, 0.8, 0.7],
        maxBoost: 3.5,
        maxCut: -3.0
    },
    rock: {
        name: 'ROCK',
        label: 'Rock & Alt',
        baseGains: [4.0, 3.5, 2.5, 0.5, -0.5, 0.5, 1.5, 2.5, 3.0, 3.5],
        preamp: -1.5,
        targetTilt: -4.4,
        priorities: [1.0, 1.2, 1.0, 0.9, 0.9, 1.1, 1.2, 1.1, 1.2, 1.2],
        maxBoost: 3.0,
        maxCut: -2.5
    },
    electronic: {
        name: 'EDM',
        label: 'Electronic / EDM',
        baseGains: [4.5, 4.5, 2.5, 0.0, -1.0, 1.0, 2.0, 2.5, 4.0, 4.0],
        preamp: -2.0,
        targetTilt: -4.0,
        priorities: [1.3, 1.4, 1.0, 0.7, 0.7, 1.0, 1.1, 1.2, 1.4, 1.4],
        maxBoost: 4.0,
        maxCut: -3.0
    },
    hiphop: {
        name: 'HIP-HOP',
        label: 'Hip-Hop & Rap',
        baseGains: [5.0, 4.5, 2.5, 0.5, -0.5, 1.0, 2.0, 1.5, 2.5, 3.0],
        preamp: -1.5,
        targetTilt: -4.3,
        priorities: [1.4, 1.3, 1.0, 0.8, 0.8, 1.1, 1.2, 1.0, 1.1, 1.1],
        maxBoost: 3.5,
        maxCut: -2.5
    },
    rnb: {
        name: 'R&B / CITY POP',
        label: 'R&B / Soul / City Pop',
        baseGains: [3.0, 4.0, 2.0, 0.5, 1.0, 1.5, 2.0, 1.5, 2.5, 3.0],
        preamp: -1.0,
        targetTilt: -4.5,
        priorities: [1.2, 1.3, 1.1, 1.0, 1.1, 1.2, 1.2, 1.0, 1.0, 1.0],
        maxBoost: 3.0,
        maxCut: -2.5
    },
    pop: {
        name: 'POP',
        label: 'Pop & Modern',
        baseGains: [1.0, 2.0, 1.5, 0.0, 0.5, 1.5, 2.0, 2.0, 2.5, 2.5],
        preamp: -1.0,
        targetTilt: -4.3,
        priorities: [1.0, 1.2, 1.0, 0.8, 0.8, 1.1, 1.2, 1.1, 1.2, 1.3],
        maxBoost: 3.0,
        maxCut: -2.5
    },
    flat: {
        name: 'FLAT',
        label: 'Flat / Neutral',
        baseGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        preamp: 0,
        targetTilt: -4.5,
        priorities: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        maxBoost: 2.0,
        maxCut: -2.0
    }
};

/**
 * Reclassify the EQ archetype by examining the ACTUAL measured audio spectrum.
 * This overrides weak metadata guesses (flat/pop) when audio features clearly
 * indicate a different genre character.
 *
 * Spectral features used:
 *   - sub (32Hz deviation from pink-noise ref): rumble / 808 sub-bass presence
 *   - kick (64Hz): punchy kick drum / bass guitar fundamental
 *   - lowMid (250Hz): body / mud indicator
 *   - midBody (500Hz): vocal/piano warmth or guitar chug
 *   - upperMid (2kHz): vocal presence / guitar crunch
 *   - presence (4kHz): guitar bite / snare attack
 *   - brilliance (8kHz): cymbal / hi-hat / sibilance
 *   - air (16kHz): glossy sheen / analog warmth roll-off
 *
 * @param {number[]} bandDb - 10-element array of measured octave-band levels in dB
 * @param {string} metadataHint - the archetype chosen by metadata (Phase 1)
 * @returns {string} - reclassified archetype key
 */
export function classifySpectralProfile(bandDb, metadataHint = 'flat') {
    if (!Array.isArray(bandDb) || bandDb.length !== 10) return metadataHint || 'flat';
    const ref = bandDb[5]; // 1kHz reference
    if (ref < -80) return metadataHint || 'flat';

    // Deviation relative to standard pink-noise slope (-4.5 dB/octave from 1kHz)
    const dev = bandDb.map((val, i) => val - ref - (i - 5) * (-4.5));
    const sub = dev[0];        // 32Hz
    const kick = dev[1];       // 64Hz
    const lowMid = dev[3];     // 250Hz
    const midBody = dev[4];    // 500Hz
    const upperMid = dev[6];   // 2kHz
    const presence = dev[7];   // 4kHz
    const brilliance = dev[8]; // 8kHz
    const air = dev[9];        // 16kHz

    const bassPower = (sub + kick) / 2;
    const highPower = (brilliance + air) / 2;
    const guitarPresence = (upperMid + presence) / 2;
    const vocalWarmth = (midBody + dev[5]) / 2; // 500Hz + 1kHz

    // If metadata already provided a high-confidence specific preset, trust it
    if (metadataHint && !['flat', 'pop'].includes(metadataHint)) {
        return metadataHint;
    }

    // --- Spectral classification from real audio ---

    // 1. Sad Ballad / Mellow / Acoustic
    //    Signature: subdued sub-bass, gentle highs, prominent vocal/piano mid-body
    if (bassPower <= 0.5 && highPower <= 0.5 && (midBody >= -1.0 || lowMid >= 0.5)) {
        return 'sad_ballad';
    }

    // 2. EDM / Electronic (check before hip-hop: EDM has BOTH extreme sub AND extreme highs)
    //    Signature: massive sub+kick AND massive high-end synths, scooped mids
    //    Key differentiator from hip-hop: EDM has extremely high brilliance+air (>= 6.0)
    if (bassPower >= 3.5 && highPower >= 6.0 && lowMid <= -1.0) {
        return 'electronic';
    }

    // 3. Hip-Hop / 808 Trap / Semi Hip-Hop K-Pop
    //    Signature: massive sub-bass (sub >= 3dB above pink ref), scooped low-mids
    //    808 sub-bass is the defining feature — sub must dominate
    if (sub >= 3.0 && bassPower >= 2.5 && lowMid <= 1.0) {
        return 'hiphop';
    }

    // 4. Metal / Heavy Rock
    //    Signature: heavy distorted 2k-4k guitar wall + punchy kick, scooped 250Hz
    //    Key differentiator from rock: metal has deeply scooped lowMid (<= -1.0)
    //    AND sub-bass is NOT dominant (guitars don't produce 808-style sub)
    if (upperMid >= 3.0 && guitarPresence >= 3.0 && kick >= 1.5 && sub <= 2.0 && lowMid <= -0.5) {
        return 'metal';
    }

    // 5. Rock / Alt-Rock
    //    Signature: guitar crunch in 2k-4k but less extreme than metal,
    //    sub-bass not dominant, low-mids more present than metal (less scooped)
    if (guitarPresence >= 2.5 && kick >= 1.0 && upperMid >= 2.0 && sub <= 1.0 && lowMid > -0.5) {
        return 'rock';
    }

    // 6. Pop Upbeat / Dance Pop / K-Pop Pure Pop
    //    Signature: punchy 64Hz kick + glossy 8k-16k air (modern mastering sheen)
    //    Pop has high air but sub-bass is NOT as extreme as hip-hop/EDM
    if (highPower >= 2.0 && kick >= 1.0) {
        return 'pop_upbeat';
    }

    // 7. R&B / City Pop / Groovy
    //    Signature: warm bass, smooth mids, moderate high shimmer
    if (bassPower >= 1.5 && vocalWarmth >= 0.5 && highPower >= 0.5 && highPower <= 2.5) {
        return 'rnb';
    }

    // 8. Modern Pop / Balanced
    if (bassPower >= 1.0 || highPower >= 1.0) {
        return 'pop';
    }

    return metadataHint || 'flat';
}

export const AIR_GATING = {
    // Absolute noise floor: di bawah ini 16kHz dianggap tidak ada konten (hiss/noise saja)
    floorDb: -70,
    // Relative roll-off vs 1kHz: lebih curam dari ini = mastering memang di-roll-off / lossy / lo-fi
    maxDropRelDb: -30,
    // 8kHz deviasi di atas pink-noise ref = sibilant/harsh (cymbal, ess, distortion)
    harshBrillDb: 4.0,
    // Gap 8kHz jauh lebih panas dari 16kHz = top-end kasar, jangan dongkrak air
    harshGapDb: 6.0,
    // 2kHz deviasi di bawah ini = vokal absen / scooped (drop EDM, instrumental)
    vocalMin2kDb: -4.0,
    // Total gain 16kHz maksimum saat air diblokir (base + offset dipangkas ke sini)
    defaultBlockedTotalCap: 1.5
};

// Per-archetype batas air: [airMaxBoostEligible, airTotalCapBlocked]
// airMaxBoostEligible = offset kompensasi 16kHz maksimum saat eligible
// airTotalCapBlocked  = total gain 16kHz (base+offset) maksimum saat TIDAK eligible
export const AIR_POLICY_BY_ARCHETYPE = {
    pop_upbeat:  { airMaxBoost: 3.0, blockedTotalCap: 2.0 },
    electronic:  { airMaxBoost: 3.0, blockedTotalCap: 2.0 },
    pop:         { airMaxBoost: 2.5, blockedTotalCap: 1.5 },
    hiphop:      { airMaxBoost: 2.0, blockedTotalCap: 1.5 },
    rnb:         { airMaxBoost: 2.0, blockedTotalCap: 1.5 },
    rock:        { airMaxBoost: 1.5, blockedTotalCap: 1.0 },
    metal:       { airMaxBoost: 1.0, blockedTotalCap: 1.0 },
    sad_ballad:  { airMaxBoost: 1.0, blockedTotalCap: 1.0 },
    flat:        { airMaxBoost: 0.5, blockedTotalCap: 0.5 }
};

/**
 * Tentukan apakah lagu ini layak diberi boost AIRY (8k/16k) — khususnya airy vocal.
 *
 * Tidak semua lagu boleh di-airy:
 *  - Rekaman lo-fi / lossy / roll-off sengaja (16kHz tinggal noise floor) -> boost = hiss
 *  - Lagu harsh/sibilant (8kHz sudah panas) -> boost = makin perih & essy
 *  - Vokal absen/scooped di 2kHz -> "airy vocal" tidak ada gunanya
 *  - Ballad intim / metal berdinding gitar -> air berlebih = tipis & fatiguing
 *
 * @param {number[]} measuredOctaveDb - 10 elemen level octave-band dalam dB
 * @param {string} archetypeKey - kunci archetype SmartEQ
 * @returns {{ eligible: boolean, reason: string, details: object }}
 */
export function assessAirEligibility(measuredOctaveDb, archetypeKey = 'flat') {
    const fallback = { eligible: true, reason: '', details: {} };
    if (!Array.isArray(measuredOctaveDb) || measuredOctaveDb.length !== 10) return fallback;
    const refDb = measuredOctaveDb[5]; // 1kHz reference
    if (refDb < -85) return { eligible: false, reason: 'SILENT', details: { refDb } };

    const airAbs = measuredOctaveDb[9];   // 16kHz absolut
    const brillAbs = measuredOctaveDb[8]; // 8kHz absolut
    const airRel = airAbs - refDb;        // relatif terhadap 1kHz
    // Deviasi terhadap pink-noise slope -4.5 dB/oct dari 1kHz
    const brillDev = brillAbs - refDb - (8 - 5) * (-4.5);
    const airDev = airAbs - refDb - (9 - 5) * (-4.5);
    const presDev = measuredOctaveDb[6] - refDb - (6 - 5) * (-4.5); // 2kHz vocal presence

    // 1. Tidak ada konten HF asli — tinggal noise floor / artefak lossy
    if (airAbs < AIR_GATING.floorDb) {
        return { eligible: false, reason: 'NO AIR CONTENT', details: { airAbs, refDb } };
    }
    // 2. Roll-off disengaja / master vintage / lo-fi / kaset — hormati artis, jangan "koreksi"
    if (airRel < AIR_GATING.maxDropRelDb) {
        return { eligible: false, reason: 'ROLLED-OFF', details: { airRel, refDb } };
    }
    // 3. Curam terjun 8k->16k = tidak ada shimmer asli, yang ada hiss bila di-boost
    if ((brillAbs - airAbs) > 8) {
        return { eligible: false, reason: 'NO SHIMMER', details: { brillAbs, airAbs } };
    }
    // 4. Sudah sibilant / harsh di 8k — tambah air = makin perih, essy, fatiguing
    if (brillDev > AIR_GATING.harshBrillDb && airDev <= brillDev - 2) {
        return { eligible: false, reason: 'HARSH', details: { brillDev, airDev } };
    }
    // 5. Gap 8k jauh di atas 16k — top-end kasar, lift air hanya menonjolkan sibilance
    if ((brillDev - airDev) > AIR_GATING.harshGapDb) {
        return { eligible: false, reason: 'SIBILANT', details: { brillDev, airDev } };
    }
    // 6. Vokal tidak present di 2k — "airy vocal" tidak relevan (drop/instrumental/scooped)
    if (presDev < AIR_GATING.vocalMin2kDb) {
        return { eligible: false, reason: 'NO VOCAL', details: { presDev } };
    }
    return { eligible: true, reason: '', details: { airAbs, airRel, brillDev, airDev, presDev } };
}

export function analyzeAndCompensate(measuredOctaveDb, archetypeKey = 'flat') {
    const arch = SPECTRAL_ARCHETYPES[archetypeKey] || SPECTRAL_ARCHETYPES.flat;
    const refDb = measuredOctaveDb[5]; // 1kHz reference

    if (refDb < -85) {
        return { gains: [...arch.baseGains], offsets: new Array(10).fill(0), hint: arch.name, airEligible: false, airReason: 'SILENT' };
    }

    // 1. Calculate raw deficiency per band
    const rawDefect = measuredOctaveDb.map((val, i) => {
        const expectedRel = (i - 5) * arch.targetTilt;
        const actualRel = val - refDb;
        const defect = (expectedRel - actualRel) * arch.priorities[i] * 0.35;
        return Math.max(arch.maxCut, Math.min(arch.maxBoost, defect));
    });

    // 2. 3-point smoothing
    const smoothed = rawDefect.map((d, i) => {
        if (i === 0) return 0.75 * rawDefect[0] + 0.25 * rawDefect[1];
        if (i === 9) return 0.75 * rawDefect[9] + 0.25 * rawDefect[8];
        return 0.25 * rawDefect[i - 1] + 0.5 * rawDefect[i] + 0.25 * rawDefect[i + 1];
    });

    // 2b. AIR gating — tidak semua lagu boleh diberi efek/boost airy vocal.
    // Kalau top-end tidak eligible (lo-fi/roll-off, hiss saja, harsh/sibilant,
    // atau vokal memang absen), pangkas kompensasi 8k/16k agar tidak jadi
    // hiss, essy, tipis, atau fatiguing. Kalau eligible, tetap batasi boost
    // 16k sesuai karakter archetype (ballad/metal jauh lebih kecil dari pop/EDM).
    const airPolicy = AIR_POLICY_BY_ARCHETYPE[archetypeKey] || AIR_POLICY_BY_ARCHETYPE.flat;
    const airCheck = assessAirEligibility(measuredOctaveDb, archetypeKey);
    if (airCheck.eligible) {
        if (smoothed[9] > airPolicy.airMaxBoost) smoothed[9] = airPolicy.airMaxBoost;
        if (smoothed[8] > airPolicy.airMaxBoost + 0.5) smoothed[8] = airPolicy.airMaxBoost + 0.5;
    } else {
        // Blokir boost air: jangan tambah kilau di atas base preset.
        if (smoothed[9] > 0) smoothed[9] = 0;
        if (smoothed[8] > 0.5) smoothed[8] = 0.5;
    }

    // 3. Merge with base gains
    const finalGains = arch.baseGains.map((base, i) => {
        let total = base + smoothed[i];
        // Saat air diblokir, total gain 16kHz ikut dipangkas ke blockedTotalCap
        // supaya base preset yang airy (mis. pop_upbeat +3.5) tidak memaksa
        // shimmer ke lagu yang tidak cocok.
        if (!airCheck.eligible && i === 9) {
            const cap = (airPolicy.blockedTotalCap ?? AIR_GATING.defaultBlockedTotalCap);
            if (total > cap) total = cap;
        }
        if (!airCheck.eligible && i === 8) {
            const cap8 = (airPolicy.blockedTotalCap ?? AIR_GATING.defaultBlockedTotalCap) + 1.0;
            if (total > cap8) total = cap8;
        }
        return Math.round(Math.max(-12, Math.min(12, total)) * 10) / 10;
    });

    // 4. Telemetry hint
    const bassMod = (smoothed[0] + smoothed[1] + smoothed[2]) / 3;
    const midMod = (smoothed[4] + smoothed[5] + smoothed[6]) / 3;
    const trebleMod = (smoothed[7] + smoothed[8] + smoothed[9]) / 3;

    let tag = '';
    if (!airCheck.eligible) {
        // Jangan pernah klaim +AIR saat boost-nya ditahan — jujur ke UI.
        if (bassMod > 0.8) tag = `+PUNCH · AIR HELD`;
        else if (midMod > 0.8) tag = `+VOCAL · AIR HELD`;
        else if (trebleMod < -0.8) tag = 'TAME HARSH';
        else if (bassMod < -0.8) tag = 'TIGHT BASS';
        else tag = `AIR HELD (${airCheck.reason})`;
    } else if (trebleMod > 0.8 && bassMod > 0.8) tag = '+PUNCH · +AIR';
    else if (trebleMod > 0.8) tag = '+AIR';
    else if (bassMod > 0.8) tag = '+PUNCH';
    else if (midMod > 0.8) tag = '+VOCAL';
    else if (trebleMod < -0.8) tag = 'TAME HARSH';
    else if (bassMod < -0.8) tag = 'TIGHT BASS';
    else tag = 'BALANCED';

    return {
        gains: finalGains,
        offsets: smoothed.map(s => Math.round(s * 10) / 10),
        hint: `${arch.name} (${tag})`,
        airEligible: airCheck.eligible,
        airReason: airCheck.reason
    };
}

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

export function mapProfileToPreset(genres = [], vibes = [], song = null) {
    const genreList = Array.isArray(genres) ? genres.map(g => String(g).toLowerCase().trim()) : [];
    const vibeList = Array.isArray(vibes) ? vibes.map(v => String(v).toLowerCase().trim()) : [];
    const genreSet = new Set(genreList);
    const vibeSet = new Set(vibeList);

    const raw = song ? `${song.title || ''} ${song.artist || ''} ${song.album || ''}`.toLowerCase() : '';

    // 1. Sad / Mellow / Emotional Ballad
    if (vibeSet.has('mellow') || vibeSet.has('sad') || vibeSet.has('ballad') || vibeSet.has('heartbreak') ||
        /\b(sad|ballad|galau|sedih|tears|cry|crying|lonely|heartbreak|patah hati|rindu|duka|hampa|terluka|someone like you|glimpse of us|satu bulan|drivers license|untungnya|through the night|heather|traitor|back to december|all too well|when i was your man|say something|fix you|let her go)\b/i.test(raw)) {
        return 'sad_ballad';
    }

    // 2. Metal & Heavy Subgenres (expanded with more bands)
    if (genreSet.has('metal') || genreSet.has('punk') ||
        /\b(metal|metalcore|deathcore|nu-metal|thrash|djent|post-hardcore|slipknot|metallica|megadeth|iron maiden|bmth|bring me the horizon|rammstein|lorna shore|bad omens|babymetal|band-maid|hanabie|maximum the hormone|coldrain|spiritbox|sleep token|gojira|architects|trivium|parkway drive|killswitch engage|avenged sevenfold|a7x|polyphia|periphery|meshuggah|lamb of god|opeth|in flames|jinjer|electric callboy|slaughter to prevail|korn|deftones|disturbed|pantera|soad|system of a down|bullet for my valentine|cannibal corpse|sepultura|anthrax|ghost|judas priest|black sabbath|falling in reverse|evanescence|dir en grey|the gazette|sim|galneryus|man with a mission|while she sleeps|wage war|motionless in white|ice nine kills|knocked loose|counterparts|currents|erra|northlane|crystal lake|make them suffer|veil of maya|born of osiris|august burns red|miss may i|as i lay dying|whitechapel|thy art is murder|suicide silence|infant annihilator|shadow of intent|fit for an autopsy|rivers of nihil|between the buried and me)\b/i.test(raw)) {
        return 'metal';
    }

    // 3. K-Pop & J-Pop Semi Hip-Hop / Hard-Hitting (trap-based production, heavy 808s)
    if (/\b(stray kids|skz|nct|nct 127|nct dream|wayv|bigbang|g-dragon|taeyang|monsta x|ateez|xg|b\.i|bobby|ikon|block b|zico|cl|2ne1|got7|jackson wang|agust d|suga|j-hope|rm|god's menu|gods menu|maniac|thunderous|back door|kick it|2 baddies|fire truck|cherry bomb|bang bang bang|fantastic baby|mic drop|ugh|ddaeng|daechwita|first|guerrilla)\b/i.test(raw)) {
        return 'hiphop';
    }

    // 4. K-Pop & J-Pop Pure Pop Upbeat / Dance (glossy, punchy, bright production)
    if (/\b(twice|ive|aespa|le sserafim|illit|newjeans|itzy|stayc|nmixx|red velvet|girls generation|snsd|fromis_9|loona|wjsn|oh my girl|apink|mamamoo|gfriend|viviz|kep1er|everglow|dreamcatcher|blackpink|lisa|jennie|rose|jisoo|treasure|riize|zerobaseone|kiss of life|tws|boynextdoor|seventeen|txt|tomorrow x together|enhypen|the boyz|cravity|tempest|drippin|fancy|feel special|what is love|i can't stop me|alcohol-free|scientist|talk that talk|set me free|dice|love dive|after like|eleven|i am|kitsch|baddie|supernova|drama|armageddon|perfect night|fearless|antifragite|unforgiven|super shy|hype boy|attention|ditto|eta|get up|cookie|dalla dalla|wannabe|loco|sneakers|cheshire|love me like this|o\.o|tank|roll|queencard|flower|magnetic|lucky girl syndrome|idol|dynamite|boy with luv|butter|permission to dance|run bts|dna)\b/i.test(raw)) {
        return 'pop_upbeat';
    }

    // 5. Pop Upbeat by vibe signals
    if ((genreSet.has('pop') || genreSet.has('k-pop') || genreSet.has('j-pop') || genreSet.has('dance')) &&
        (vibeSet.has('energetic') || vibeSet.has('happy') || vibeSet.has('party') ||
         /\b(upbeat|fun|dance|party|club|hype|bouncy|espresso|levitating|cheerful|ceria|summer)\b/i.test(raw))) {
        return 'pop_upbeat';
    }

    // 6. J-Pop Upbeat / Anime Upbeat
    if (/\b(yoasobi|ado|eve|king gnu|higedan|official hige dandism|mrs\.? green apple|vaundy|zutomayo|yorushika|fujii kaze|kenshi yonezu|lisa|aimer|spyair|kana-boon|asian kung-fu generation|hatsune miku|miku|vocaloid|deco\*27|kikuo|giga|idol|racing into the night|new genesis|odo|kick back|unravel|shinzou wo sasageyo|gurenge|inferno|zankyou sanka|kaikai kitan)\b/i.test(raw)) {
        return 'pop_upbeat';
    }

    // 7. City Pop & K-R&B
    if (vibeSet.has('groovy') || /\b(city pop|shibuya-kei|tatsuro yamashita|miki matsubara|anri|mariya takeuchi|lamp|k-rnb|dean|crush|dpr ian|dpr live|colde|heize|bibi|lee hi|offonoff|sumin|ph-1|gray|elo|code kunst|sam kim|wave to earth|the rose|hyukoh|silica gel|jannabi|sza|frank ocean|daniel caesar|brent faiyaz|giveon)\b/i.test(raw)) {
        return 'rnb';
    }

    // 8. Standard genre mapping fallback
    const genrePreset = mapGenresToPreset(genreList);
    if (genrePreset !== 'flat') return genrePreset;

    // 9. Local text fallback
    return detectPresetLocal(song);
}

// Local regex-based fallback rules with word boundaries.
export const LOCAL_GENRE_RULES = [
    { preset: 'sad_ballad', words: ['sad', 'ballad', 'galau', 'sedih', 'tears', 'crying', 'lonely', 'heartbreak', 'patah hati', 'rindu', 'duka', 'hampa', 'terluka', 'bernadya', 'adele', 'glimpse of us', 'heather', 'traitor', 'drivers license', 'satu bulan', 'untungnya', 'feby putri', 'nadin amizah', 'pamungkas', 'mahalini', 'lewis capaldi', 'sam smith', 'joji', 'calum scott', 'conan gray', 'paul kim', 'sung si kyung', 'davichi', 'ailee', 'park hyo shin', 'taeyeon', 'iu', 'melomance', 'lim young woong'] },
    { preset: 'metal', words: ['metal', 'metalcore', 'deathcore', 'nu-metal', 'thrash', 'djent', 'slipknot', 'metallica', 'megadeth', 'avenged sevenfold', 'a7x', 'soad', 'system of a down', 'pantera', 'iron maiden', 'bmth', 'bring me the horizon', 'rammstein', 'architects', 'lorna shore', 'bad omens', 'babymetal', 'band-maid', 'hanabie', 'maximum the hormone', 'coldrain', 'spiritbox', 'sleep token', 'gojira', 'trivium', 'parkway drive', 'killswitch engage', 'polyphia', 'periphery', 'meshuggah', 'lamb of god', 'opeth', 'in flames', 'jinjer', 'electric callboy', 'slaughter to prevail', 'korn', 'deftones', 'disturbed', 'bullet for my valentine', 'cannibal corpse', 'sepultura', 'anthrax', 'ghost', 'judas priest', 'black sabbath', 'falling in reverse', 'evanescence', 'dir en grey', 'the gazette', 'sim', 'galneryus', 'man with a mission', 'while she sleeps', 'wage war', 'motionless in white', 'ice nine kills', 'knocked loose', 'counterparts', 'erra', 'northlane', 'crystal lake', 'currents', 'veil of maya', 'born of osiris', 'august burns red', 'whitechapel', 'thy art is murder', 'suicide silence', 'infant annihilator', 'shadow of intent', 'fit for an autopsy'] },
    { preset: 'hiphop', words: ['hip hop', 'hip-hop', 'rap', 'trap', 'drill', 'eminem', 'drake', 'kendrick', 'kanye', 'travis scott', 'post malone', '2pac', 'snoop', 'zico', 'epik high', 'stray kids', 'skz', 'nct', 'nct 127', 'nct dream', 'wayv', 'bigbang', 'g-dragon', 'monsta x', 'ateez', 'ikon', 'bobby', 'block b', 'got7', 'jackson wang', 'agust d', 'changmo', 'ph-1', 'rich brian'] },
    { preset: 'pop_upbeat', words: ['upbeat', 'dance pop', 'espresso', 'levitating', 'super shy', 'hype boy', 'dynamite', 'bouncy', 'cheerful', 'ceria', 'twice', 'ive', 'aespa', 'le sserafim', 'illit', 'newjeans', 'itzy', 'stayc', 'nmixx', 'red velvet', 'girls generation', 'snsd', 'mamamoo', 'gfriend', 'viviz', 'everglow', 'fromis_9', 'loona', 'dreamcatcher', 'blackpink', 'seventeen', 'txt', 'enhypen', 'the boyz', 'treasure', 'riize', 'zerobaseone', 'kiss of life', 'boynextdoor', 'fancy', 'feel special', 'love dive', 'after like', 'eleven', 'queencard', 'supernova', 'magnetic', 'perfect night', 'dalla dalla', 'wannabe', 'sneakers'] },
    { preset: 'pop_upbeat', words: ['yoasobi', 'ado', 'eve', 'king gnu', 'higedan', 'mrs green apple', 'vaundy', 'zutomayo', 'yorushika', 'fujii kaze', 'kenshi yonezu', 'spyair', 'kana-boon', 'hatsune miku', 'vocaloid', 'idol', 'racing into the night', 'gurenge', 'kick back', 'unravel'] },
    { preset: 'rock', words: ['rock', 'grunge', 'nirvana', 'linkin park', 'green day', 'arctic monkeys', 'oasis', 'foo fighters', 'paramore', 'rhcp', 'strokes', 'radiohead', 'weezer', 'one ok rock', 'radwimps', 'asian kung-fu generation', 'day6', 'wave to earth', 'muse', 'coldplay', 'imagine dragons', 'the killers', 'my chemical romance', 'queen'] },
    { preset: 'electronic', words: ['edm', 'house', 'techno', 'trance', 'dubstep', 'dnb', 'drum and bass', 'avicii', 'skrillex', 'garrix', 'tiesto', 'marshmello', 'alan walker', 'zedd', 'david guetta'] },
    { preset: 'rnb', words: ['r&b', 'rnb', 'soul', 'neo soul', 'city pop', 'sza', 'frank ocean', 'brent faiyaz', 'giveon', 'tatsuro yamashita', 'miki matsubara', 'mariya takeuchi', 'anri', 'dean', 'crush', 'dpr ian', 'colde', 'heize', 'bibi', 'lee hi', 'daniel caesar', 'wave to earth', 'the rose', 'hyukoh', 'silica gel', 'jannabi'] },
    { preset: 'jazz', words: ['jazz', 'bossa', 'swing', 'bebop', 'miles davis', 'coltrane', 'bill evans'] },
    { preset: 'classical', words: ['classical', 'symphony', 'orchestra', 'bach', 'beethoven', 'mozart', 'chopin', 'soundtrack', 'zimmer', 'sawano', 'hisaishi'] },
    { preset: 'acoustic', words: ['acoustic', 'akustik', 'unplugged', 'folk', 'fingerstyle'] },
    { preset: 'vocal', words: ['podcast', 'speech', 'interview', 'acapella', 'vocal'] },
    { preset: 'bass_boost', words: ['dangdut', 'koplo', 'funkot', 'breakbeat', 'bass boost', 'phonk'] },
    { preset: 'pop', words: ['pop', 'k-pop', 'kpop', 'j-pop', 'jpop', 'bts', 'taylor swift', 'ariana', 'dua lipa', 'billie eilish', 'tulus', 'raisa', 'tiara andini'] },
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
        return { gains: new Array(10).fill(0), preamp: 0, hint: 'FLAT', airEligible: true, airReason: '' };
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

    // AIR gating (Perfect Tune) — tidak semua lagu boleh di-airy.
    // bandDb di sini level absolut per octave-band, jadi bisa langsung dinilai:
    // lo-fi/roll-off, tinggal hiss, harsh/sibilant, atau vokal absen -> tahan boost 8k/16k.
    const airCheck = assessAirEligibility(bandDb);
    if (airCheck.eligible) {
        // Tetap batasi air agar tidak over-shimmer pada koreksi generik
        if (smoothed[9] > 2.5) smoothed[9] = 2.5;
        if (smoothed[8] > 3.0) smoothed[8] = 3.0;
    } else {
        if (smoothed[9] > 0) smoothed[9] = 0;
        if (smoothed[8] > 0.5) smoothed[8] = 0.5;
    }

    // Clamp corrections to [-4, +4] dB per band
    const gains = smoothed.map(g => {
        const clamped = Math.max(-4, Math.min(4, g));
        return Math.round(clamped * 10) / 10;
    });

    // Headroom auto-gain staging to prevent digital clipping
    const maxGain = Math.max(0, ...gains);
    const sumPos = gains.filter(g => g > 0).reduce((a, b) => a + b, 0);
    const preamp = -(Math.round((maxGain * 0.6 + (sumPos > 10 ? 1.0 : 0)) * 10) / 10);

    // Formulate descriptive hint (jujur: jangan klaim +AIR saat air-nya ditahan)
    let hint = 'BALANCED';
    const bassAvg = (gains[0] + gains[1] + gains[2]) / 3;
    const trebleAvg = (gains[7] + gains[8] + gains[9]) / 3;
    if (!airCheck.eligible) {
        if (bassAvg > 1.0 && trebleAvg < -0.5) hint = '+BASS · TAME';
        else if (bassAvg > 1.0) hint = '+BASS';
        else if (bassAvg < -1.0) hint = 'CLARITY';
        else if (trebleAvg < -1.0) hint = 'WARM';
        else hint = `AIR HELD (${airCheck.reason})`;
    }
    else if (bassAvg > 1.0 && trebleAvg < -0.5) hint = '+BASS · TAME';
    else if (bassAvg > 1.0) hint = '+BASS';
    else if (bassAvg < -1.0 && trebleAvg > 1.0) hint = 'CLARITY · +AIR';
    else if (bassAvg < -1.0) hint = 'CLARITY';
    else if (trebleAvg > 1.0) hint = '+AIR';
    else if (trebleAvg < -1.0) hint = 'WARM';

    return { gains, preamp, hint, airEligible: airCheck.eligible, airReason: airCheck.reason };
}

export function calculatePannerCoordinates(azimuthDeg, radius = 1.5) {
    // Azimuth in degrees on horizontal plane (y = 0).
    // Listener faces -Z with forward vector (0, 0, -1).
    // 0 deg: directly in front (0, 0, -R)
    // +deg: to the right (x > 0, z < 0)
    // -deg: to the left (x < 0, z < 0)
    const rad = (azimuthDeg * Math.PI) / 180;
    const x = Number((radius * Math.sin(rad)).toFixed(4));
    const z = Number((-radius * Math.cos(rad)).toFixed(4));
    const y = 0.0;
    return { x, y, z };
}

export function computeMidSideMatrix(L, R, width = 1.0) {
    const M = 0.5 * (L + R);
    const S = 0.5 * (L - R);
    const lPrime = M + width * S;
    const rPrime = M - width * S;
    return { lPrime, rPrime, M, S };
}

export function getMidSideGains(width = 1.0) {
    // Coefficients for:
    // L' = a*L + b*R
    // R' = b*L + a*R
    const a = 0.5 * (1 + width);
    const b = 0.5 * (1 - width);
    return { a, b };
}

export function generateSyntheticReverbIR(sampleRate, durationSec, decayTau, predelaySec, cutoffHz = 5000) {
    const totalSamples = Math.max(1, Math.floor(sampleRate * durationSec));
    const predelaySamples = Math.min(totalSamples, Math.floor(sampleRate * predelaySec));

    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);

    // Seeded LCG PRNG for repeatable stereo decorrelation
    let sL = 13371337;
    let sR = 73317331;
    function randL() {
        sL = (1664525 * sL + 1013904223) >>> 0;
        return (sL / 4294967296) * 2 - 1;
    }
    function randR() {
        sR = (1664525 * sR + 1013904223) >>> 0;
        return (sR / 4294967296) * 2 - 1;
    }

    // 1-pole RC lowpass filter
    const dt = 1 / sampleRate;
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const alpha = dt / (rc + dt);

    let prevL = 0;
    let prevR = 0;

    for (let i = predelaySamples; i < totalSamples; i++) {
        const t = (i - predelaySamples) / sampleRate;
        const env = Math.exp(-t / decayTau);

        const rawL = randL() * env;
        const rawR = randR() * env;

        prevL = prevL + alpha * (rawL - prevL);
        prevR = prevR + alpha * (rawR - prevR);

        left[i] = prevL;
        right[i] = prevR;
    }

    // Peak normalisation to avoid harsh clipping
    let maxPeak = 0;
    for (let i = 0; i < totalSamples; i++) {
        if (Math.abs(left[i]) > maxPeak) maxPeak = Math.abs(left[i]);
        if (Math.abs(right[i]) > maxPeak) maxPeak = Math.abs(right[i]);
    }
    if (maxPeak > 1e-6) {
        const norm = 0.7 / maxPeak;
        for (let i = 0; i < totalSamples; i++) {
            left[i] *= norm;
            right[i] *= norm;
        }
    }

    return { left, right };
}

export function computeLimiterGain(peak, threshold, currentGain, releaseAlpha) {
    let targetGain = 1.0;
    if (peak > threshold) {
        targetGain = threshold / peak;
    }
    if (targetGain < currentGain) {
        return targetGain;
    }
    return Math.min(1.0, currentGain + (1.0 - currentGain) * releaseAlpha);
}

