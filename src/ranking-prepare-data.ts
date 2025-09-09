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

interface TeamSummary {
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

interface PreparedData {
    games: GameRow[];
    teams: string[];
    teamsAtTournaments: TeamAtTournament[];
    teamsInGames: string[];
    tournamentSummaries: TournamentSummary[];
    gamesGraph: string[][];
    teamSummary: TeamSummary[];
}

function prepareData(
    spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
    config: AlgorithmConfig,
    division: 'mixed' | 'open' | 'women'): PreparedData {

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

    const minTournamentsSetting = config.algorithmSettings.find(s => s.name === 'min_tournaments')?.value as number ?? 1;
    const minGamesSetting = config.algorithmSettings.find(s => s.name === 'min_games')?.value as number ?? 5;
    const minInterconnectivitySetting = config.algorithmSettings.find(s => s.name === 'min_interconnectivity')?.value as number ?? 10;

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
    // streamToTable(games, ['Tournament', 'Date', 'Team1', 'Team2', 'Score1', 'Score2'], spreadSheet, config.dataSetName + ' Processed Games ' + division);

    const teamsInGames = getTeamsInGames(games);
    // streamToTable(teamsInGames, ['Teams in Games'], spreadSheet, config.dataSetName + ' Teams in Games ' + division);

    const tournamentSummaries = getSummaryOfTournaments(games);
    // streamToTable(tournamentSummaries, ['Date First', 'Date Last', 'Teams Count Qualified', 'Teams Count Total', 'Games Count'], spreadSheet, config.dataSetName + ' Tournament Summaries ' + division);

    const gamesGraph = getGamesMatrix(games, teamsInGames);
    // streamToTable(gamesGraph, null, spreadSheet, config.dataSetName + ' Games Matrix ' + division);

    const teamSummary = getGamesSummary(games, teamsInGames, gamesGraph, minTournamentsSetting, minGamesSetting, minInterconnectivitySetting);
    // streamToTable(teamSummary, ['Team', 'Tournaments', 'Games', 'Wins', 'Losses', 'Win Ratio', 'Opp Win Ratio', 'Goals For', 'Goals Against', 'Avg Point Diff', 'Component', 'Interconnectivity', 'Eligible'], spreadSheet, config.dataSetName + ' Team Summary ' + division);

    return {
        games,
        teams,
        teamsAtTournaments,
        teamsInGames,
        tournamentSummaries,
        gamesGraph,
        teamSummary
    }
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

function getGamesMatrix(games: GameRow[], teamsInGames: string[]): string[][] {
    // Return a matrix of games between teams 
    // e.g.
    // Team, Team1, Team2, Team3, Team4
    // Team1, 0, 1, 0, 0
    // Team2, 1, 0, 1, 0
    // Team3, 0, 1, 0, 1
    // Team4, 0, 0, 1, 0

    const matrix: string[][] = [];
    // Add the header row
    matrix.push(['Team', ...teamsInGames]);

    for (const team1 of teamsInGames) {
        const row: string[] = [team1];
        for (const team2 of teamsInGames) {
            if (team1 === team2) {
                row.push('0'); // No games against itself
            } else {
                // Count the number of games between team1 and team2
                const count = games.filter(game => (game.team1 === team1 && game.team2 === team2) || (game.team1 === team2 && game.team2 === team1)).length;
                row.push(count.toString());
            }
        }
        matrix.push(row);
    }
    return matrix;
}

function getGamesSummary(games: GameRow[], teams: string[], gamesMatrix: string[][], minTournaments: number, minGames: number, minInterconnectivy: number): TeamSummary[] {
    const shortestPaths = deriveShortestPaths(games, teams, gamesMatrix);

    const summaries: TeamSummary[] = teams.map((team) => {
        const tournamentsCount = new Set(games.filter(game => game.team1 === team || game.team2 === team).map(game => game.tournament)).size;
        const teamGames = games.filter(game => game.team1 === team || game.team2 === team);
        const wins = teamGames.filter(game => game.team1 === team && game.score1 > game.score2).length;
        const losses = teamGames.filter(game => game.team2 === team && game.score2 > game.score1).length;
        const goalsFor = teamGames.reduce((sum, game) => {
            if (game.team1 === team) {
                return sum + game.score1;
            } else {
                return sum + game.score2;
            }
        }, 0);
        const goalsAgainst = teamGames.reduce((sum, game) => {
            if (game.team1 === team) {
                return sum + game.score2;
            } else {
                return sum + game.score1;
            }
        }, 0);
        const avgPointDiff = teamGames.length > 0 ? (goalsFor - goalsAgainst) / teamGames.length : 0;
        const wRatio = (teamGames.length) > 0 ? wins / (teamGames.length) : 0;
        const oppWinRatio = (teamGames.length) > 0 ? losses / (teamGames.length) : 0;
        const component = 1; // Placeholder, but always seems to be 1 in the python version, sooo?
        const shortestPathsForThisTeam = shortestPaths.find((row: string[]) => row[0] === team);
        const interconnectivity = shortestPathsForThisTeam ? shortestPathsForThisTeam.slice(1).reduce((sum, path) => {
            const pathNum = parseInt(path);
            if (pathNum >= 1 && pathNum <= 2) {
                return sum + pathNum;
            }
            return sum;
        }, 0) : 0;
        const eligible = (tournamentsCount >= minTournaments && teamGames.length >= minGames && interconnectivity >= minInterconnectivy) ? 1 : 0;
        return {
            team,
            tournaments: tournamentsCount,
            games: teamGames.length,
            wins,
            losses,
            w_ratio: wRatio,
            opponent_w_ratio: oppWinRatio,
            goals_for: goalsFor,
            goals_against: goalsAgainst,
            avg_point_diff: avgPointDiff,
            component,
            interconnectivity,
            eligible
        };
    });
    return summaries;
}

function deriveShortestPaths(games: GameRow[], teams: string[], gamesMatrix: string[][]): string[][] {
    // Get the information about the shortest paths between each pair of teams in the dataset (teams that played
    // a game together have distance 1, teams that share a common opponent have distance 2, etc.).


    const allPaths = teams.map(team => {
        // need to iterate over each team and find the shortest path to every other team
        const paths = [team];
        for (const otherTeam of teams) {
            if (otherTeam === team) {
                paths.push('0')
                continue
            }
            // Find the index of the team in the gamesMatrix
            const teamIndex = gamesMatrix[0].indexOf(team);
            const otherTeamIndex = gamesMatrix[0].indexOf(otherTeam);
            if (teamIndex === -1 || otherTeamIndex === -1) {
                paths.push('999'); // Not found, so infinite distance
                continue;
            }
            // If they played each other, distance is 1
            if (gamesMatrix[teamIndex][otherTeamIndex] !== '0') {
                paths.push('1');
                continue;
            }
            // Otherwise, find if they have a common opponent
            let foundCommonOpponent = false;
            for (const potentialOpponent of teams) {
                if (potentialOpponent === team || potentialOpponent === otherTeam) continue;
                const potentialOpponentIndex = gamesMatrix[0].indexOf(potentialOpponent);
                if (potentialOpponentIndex === -1) continue;
                if (gamesMatrix[teamIndex][potentialOpponentIndex] !== '0' && gamesMatrix[otherTeamIndex][potentialOpponentIndex] !== '0') {
                    // They have a common opponent
                    paths.push('2');
                    foundCommonOpponent = true;
                    break;
                }
            }
            if (foundCommonOpponent) continue;

            // If no common opponent, distance is 3 (although we can go further, it's not used right now so not needed)
            paths.push('3');
        }
        return paths;
    });

    return allPaths;
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

function streamToTable(data: GameRow[] | TournamentSummary[] | TeamSummary[] | string[] | string[][], headers: String[] | null, spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string) {
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

export { prepareData };