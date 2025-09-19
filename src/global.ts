
export var controllerSheetName = 'Controller'

export interface BaseSetting {
    name: string;
    value: string | number;
}

export interface TournamentSetting {
    name: string;
    weighting: number;
}

export interface AlgorithmConfig {
    dataSetName: string;
    dataSheetUrl: string;
    resultsSheetUrl: string;
    algorithmSettings: BaseSetting[];
    tournaments: TournamentSetting[];
}

export interface GameRow {
    tournament: string;
    date: Date;
    team1: string;
    team2: string;
    score1: number;
    score2: number;
    rankDiff?: number;
    weight?: number;
}

export interface GameRowRanker extends GameRow {
    team1Rank: number;
    team2Rank: number;
    teamRankDiff: number;
    isIgnored: boolean;
    rank1: number;
    rank2: number;
    gameWeight: number;
}

export interface GameRating {
    rating: number;
    isIgnored: boolean;
    teamRankDiff: number;
}

export interface TeamRating {
    team: string;
    rating: number;
}

export interface TeamAtTournament {
    team: string;
    tournament: string;
}

export interface TournamentSummary {
    date_first: Date;
    date_last: Date;
    teams_count_qualified: number;
    teams_count_total: number;
    games_count: number;
}

export interface TeamSummary {
    team: string;
    tournaments: number;
    games: number;
    wins: number;
    losses: number;
    w_ratio: number;
    opponent_w_ratio: number;
    goals_for: number;
    goals_against: number;
    avg_point_diff: number;
    component: number;
    interconnectivity: number;
    eligible: number;
}

export interface PreparedData {
    games: GameRow[];
    teams: string[];
    teamsAtTournaments: TeamAtTournament[];
    teamsInGames: string[];
    tournamentSummaries: TournamentSummary[];
    gamesGraph: string[][];
    teamSummary: TeamSummary[];
}

export const groupBy = <T, K extends keyof any>(list: T[], getKey: (item: T) => K) =>
    list.reduce((previous, currentItem) => {
        const group = getKey(currentItem);
        if (!previous.get(group)) previous.set(group, []);
        previous.get(group)!.push(currentItem);
        return previous;
    }, {} as Map<K, T[]>);



export function streamToTable(data: GameRow[] | TournamentSummary[] | TeamSummary[] | TeamRating[] | string[] | string[][], headers: String[] | null, spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string) {
    // Create or get the sheet for the data
    let dataSheet = spreadSheet.getSheetByName(sheetName);
    if (!dataSheet) {
        dataSheet = spreadSheet.insertSheet(sheetName);
    } else {
        dataSheet.clear(); // Clear existing data
    }

    // Set the header row based on the type of data
    if (data.length > 0) {
        if (headers) {
            dataSheet.appendRow(headers);
        }

        // Append each data row
        for (const row of data) {
            if (typeof row === "string") {
                dataSheet.appendRow([row]); // For string data, append as a single cell
            } else {
                dataSheet.appendRow(Object.values(row));
            }
        }
    }

}