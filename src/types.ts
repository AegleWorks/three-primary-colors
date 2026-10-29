export interface Pair {
    id: string,
    key: string
}

export type Modpool = {
    mod: string,
    icon: string,
    maps: number[]
}

export interface Data {
    // a Google Sheet with the pool, shared as "anyone with the link can view";
    // when it can be read it replaces mappool
    sheet?: { id: string, gid?: number },
    mappool?: Modpool[],
    // seeds and country ranks by player name (tosu has neither)
    players?: Record<string, { seed?: number, countryRank?: number }>,
    // Twitch channel whose chat the overlay shows
    twitch?: string
}

export type Beatmap = {
    beatmapset_id:          number;
    difficulty_rating:      number;
    id:                     number;
    mode:                   string;
    status:                 string;
    total_length:           number;
    user_id:                number;
    version:                string;
    accuracy:               number;
    ar:                     number;
    bpm:                    number;
    convert:                boolean;
    count_circles:          number;
    count_sliders:          number;
    count_spinners:         number;
    cs:                     number;
    deleted_at:             null;
    drain:                  number;
    hit_length:             number;
    is_scoreable:           boolean;
    last_updated:           Date;
    mode_int:               number;
    passcount:              number;
    playcount:              number;
    ranked:                 number;
    url:                    string;
    checksum:               string;
    beatmapset:             Beatmapset;
    current_user_playcount: number;
    max_combo:              number;
    owners:                 Owner[];
}

type Beatmapset = {
    artist:              string;
    artist_unicode:      string;
    covers:              Covers;
    creator:             string;
    id:                  number;
    offset:              number;
    preview_url:         string;
    source:              string;
    status:              string;
    title:               string;
    title_unicode:       string;
    track_id:            null;
    user_id:             number;
    video:               boolean;
    bpm:                 number;
    tags:                string;
}

type Covers = {
    cover:          string;
    "cover@2x":     string;
    card:           string;
    "card@2x":      string;
    list:           string;
    "list@2x":      string;
    slimcover:      string;
    "slimcover@2x": string;
}

type Owner = {
    id:       number;
    username: string;
}