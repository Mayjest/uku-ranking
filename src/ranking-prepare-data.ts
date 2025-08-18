import { stream } from "undici-types";
import { AlgorithmConfig } from "./global";

interface GameRow {
    tournament: string;
    date: Date;
    team1: string;
    team2: string;
    score1: number;
    score2: number;
}

interface TeamAtTournament {
    team: string;
    tournament: string;
}

interface TournamentSummary {
    date_first: Date;
    date_last: Date;
    teams_count_qualified: number;
    teams_count_total: number;
    games_count: number;
}

function prepareData(
    spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
    config: AlgorithmConfig,
    division: 'mixed' | 'open' | 'women'): boolean {

    // Games is all the games played
    // Teams is all teams that play in a season & any aliases they have
    // Teams at tournaments is the teams at a tournament, and allows us to count a game at a tournament but not include that team in the rankings (e.g., for rostering, or because they're an international team)

    const gamesSheetName = 'games'
    const teamsSheetName = 'teams-' + division;
    const teamsAtTournamentsSheetName = 'teams_at_tournaments-' + division;

    const dataSheet = SpreadsheetApp.openByUrl(config.dataSheetUrl);
    if (!dataSheet) {
        throw new Error('Data sheet not found: ' + config.dataSheetUrl);
    }

    const gamesSheet = dataSheet.getSheetByName(gamesSheetName);
    if (!gamesSheet) {
        throw new Error(`Games sheet named "${gamesSheetName}" not found.`);
    }
    const teamsSheet = dataSheet.getSheetByName(teamsSheetName);
    if (!teamsSheet) {
        throw new Error(`Teams sheet named "${teamsSheetName}" not found.`);
    }
    const teamsAtTournamentsSheet = dataSheet.getSheetByName(teamsAtTournamentsSheetName);
    if (!teamsAtTournamentsSheet) {
        throw new Error(`Teams at tournaments sheet named "${teamsAtTournamentsSheetName}" not found.`);
    }

    // Grab the data from the sheets
    const gamesData = gamesSheet.getDataRange().getValues();
    const teamsData = teamsSheet.getDataRange().getValues();
    const teamsAtTournamentsData = teamsAtTournamentsSheet.getDataRange().getValues();

    // filter out the other divisions from the games data
    const divisionGamesData = gamesData.filter((row, index) => {
        //Tournament	Date	Team_1	Team_2	Score_1	Score_2	Division
        // skip the header row
        if (index === 0) return false;
        return row[6] === division;
    });

    // cut the header out of teamsData before mapping
    const teams: string[] = teamsData.slice(1).map((row, index) => {
        // Team Name, Alias...
        // Teams can have muultiple aliases, or none at all
        return row[0];
    });

    let games: GameRow[] = handleTeamAliasesInGames(divisionGamesData, teamsData);
    let teamsAtTournaments: TeamAtTournament[] = handleTeamAliasesInTournaments(teamsAtTournamentsData, teamsData);


    games = validateTeams(games, teamsAtTournaments);

    games = processGames(games)
    streamToTable(games, ['Tournament', 'Date', 'Team1', 'Team2', 'Score1', 'Score2'], spreadSheet, config.dataSetName + ' Processed Games ' + division);

    const teamsInGames = getTeamsInGames(games);
    streamToTable(teamsInGames, ['Teams in Games'], spreadSheet, config.dataSetName + ' Teams in Games ' + division);

    const tournamentSummaries = getSummaryOfTournaments(games);
    streamToTable(tournamentSummaries, ['Date First', 'Date Last', 'Teams Count Qualified', 'Teams Count Total', 'Games Count'], spreadSheet, config.dataSetName + ' Tournament Summaries ' + division);

    return false
}

function processGames(games: GameRow[], removeDraws: boolean = false): GameRow[] {
    games = games.filter((game) => {
        // Filter out games with no scores
        if (game.score1 === undefined || game.score2 === undefined) {
            return false;
        }
        if (game.score1 === null || game.score2 === null) {
            return false;
        }

        if (removeDraws) {
            // Remove draws
            return game.score1 !== game.score2;
        }
        return true;
    });

    // Reorder so that team1 is the winner (aka if score2 > score1, swap them)
    games = games.map((game) => {
        if (game.score2 > game.score1) {
            return {
                ...game,
                team1: game.team2,
                team2: game.team1,
                score1: game.score2,
                score2: game.score1
            };
        }
        return game;
    });

    // remove any forfeits (1-0)
    games = games.filter((game) => {
        return !(game.score1 === 1 && game.score2 === 0) && !(game.score1 === 0 && game.score2 === 1);
    });
    return games.sort((a, b) => {
        // Sort by date, then by tournament, then by team1, then by team2
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        if (a.tournament < b.tournament) return -1;
        if (a.tournament > b.tournament) return 1;
        if (a.team1 < b.team1) return -1;
        if (a.team1 > b.team1) return 1;
        if (a.team2 < b.team2) return -1;
        if (a.team2 > b.team2) return 1;
        return 0;
    })
}

function getTeamsInGames(games: GameRow[], asIfDate: Date | null = null): string[] {
    if (asIfDate) {
        // Filter games to only those before the asIfDate
        games = games.filter(game => game.date <= asIfDate);
    }
    const teamsSet = new Set<string>();
    for (const game of games) {
        teamsSet.add(game.team1);
        teamsSet.add(game.team2);
    }
    return Array.from(teamsSet);
}

function getSummaryOfTournaments(games: GameRow[], asIfDate: Date | null = null): TournamentSummary[] {
    if (asIfDate) {
        // Filter games to only those before the asIfDate
        games = games.filter(game => game.date <= asIfDate);
    }
    const tournamentSummaries = []
    // firstly just get the unique tournaments
    const tournamentsSet = new Set<string>();
    for (const game of games) {
        tournamentsSet.add(game.tournament);
    }
    const tournaments = Array.from(tournamentsSet);
    return tournaments.map((tournament) => {
        // For each tournament, get the games and teams
        const tournamentGames = games.filter(game => game.tournament === tournament);
        const teamsInTournament = getTeamsInGames(tournamentGames, asIfDate);
        // qualified teams are those without '@ <tournament>' in their name
        const qualifiedTeams = teamsInTournament.filter(team => !team.includes('@ ' + tournament));
        const dateFirst = new Date(Math.min(...tournamentGames.map(game => game.date.getTime())));
        const dateLast = new Date(Math.max(...tournamentGames.map(game => game.date.getTime())));
        return {
            date_first: dateFirst,
            date_last: dateLast,
            teams_count_qualified: qualifiedTeams.length,
            teams_count_total: teamsInTournament.length,
            games_count: tournamentGames.length
        };
    })
}

function validateTeams(games: GameRow[], teamsAtTournaments: TeamAtTournament[]): GameRow[] {
    return games.map((game) => {
        // for each game, if team1 or team2 is not in the teamsAtTournamentsData for that specific tournament, 
        // then we add '@ <tournament>' to the team name
        const tournamentTeams = teamsAtTournaments.filter(row => row.tournament === game.tournament);
        if (tournamentTeams) {
            const team1InTournament = tournamentTeams.some(row => row.team === game.team1);
            const team2InTournament = tournamentTeams.some(row => row.team === game.team2);
            if (!team1InTournament) {
                game.team1 += ' @ ' + game.tournament;
            }
            if (!team2InTournament) {
                game.team2 += ' @ ' + game.tournament;
            }
        }
        return game;
    });
}

function handleTeamAliasesInGames(gamesData: any[][], teamsData: any[][]): GameRow[] {
    // Process the games data to include team aliases
    return gamesData.map((game) => {
        // Tournament	Date	Team_1	Team_2	Score_1	Score_2	Division
        const tournament = game[0];
        const date = new Date(game[1]);
        const team1 = getTeamIfAlias(game[2], teamsData);
        const team2 = getTeamIfAlias(game[3], teamsData);
        const score1 = game[4];
        const score2 = game[5];

        return {
            tournament,
            date,
            team1,
            team2,
            score1,
            score2
        };
    });
}

function handleTeamAliasesInTournaments(teamsAtTournamentsData: any[][], teamsData: any[][]): TeamAtTournament[] {
    // Process the teams at tournaments data to include team aliases
    return teamsAtTournamentsData.map((row) => {
        // Team	Tournament
        const team = getTeamIfAlias(row[0], teamsData);
        const tournament = row[1];
        return { team, tournament };
    });
}

function getTeamIfAlias(team: string, teamsData: any[][]): string {
    // Check if the team is an alias and return the correct team name
    for (const row of teamsData) {
        // Team Name, Alias...
        if (row.slice(1).includes(team)) {
            return row[0]; // Return the team name
        }
    }
    return team; // If no alias found, return the original team name
}

function streamToTable(data: GameRow[] | TournamentSummary[] | string[], headers: String[], spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string) {
    // Create or get the sheet for the data
    let dataSheet = spreadSheet.getSheetByName(sheetName);
    if (!dataSheet) {
        dataSheet = spreadSheet.insertSheet(sheetName);
    } else {
        dataSheet.clear(); // Clear existing data
    }

    // Set the header row based on the type of data
    if (data.length > 0) {
        dataSheet.appendRow(headers);

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

export { prepareData };