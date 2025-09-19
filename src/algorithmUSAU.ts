import { it } from "node:test";
import { Algorithm } from "./algorithm";
import { GameRow, GameRating, GameRowRanker, groupBy, TeamRating } from "./global";


// USAU_ALGO = BlockRankingAlgorithm(
//     algo_name="USAU",
//     rank_diff_func="usau",
//     game_weight_func="usau_no_date",
//     rank_fit_func="iteration",
//     game_ignore_func="blowout",
//     game_weight_params={"w0": 0.5, "w_first": 29, "w_last": 42},
//     rank_fit_params={"rating_start": 0, "n_round": 2,
//                      "n_iter": 1000, "verbose": True},
//     game_ignore_params={"min_valid": MIN_GAMES},
// )

export class AlgorithmUSAU extends Algorithm {
    calculateRankingDiff(games: GameRow[]): GameRow[] {
        //     Process using USAU rank-diff function, source https://play.usaultimate.org/teams/events/rankings/.
        games.forEach(game => {
            if (game.score1 === game.score2) {
                game.rankDiff = 0;
            } else {
                const r = game.score1 != 1 ? game.score2 / (game.score1 - 1) : 1;
                game.rankDiff = 125 + 475 * (Math.sin(Math.min(1, 2 * (1 - r)) * 0.4 * Math.PI) / Math.sin(0.4 * Math.PI));
            }
        });
        return games;
    }

    calculateGameWeight(games: GameRow[]): GameRow[] {
        //     process USAU game-weight function, source https://play.usaultimate.org/teams/events/rankings/.
        games.forEach(game => {
            const weekNumber = game.date ? Math.ceil((game.date.getTime() - new Date(game.date.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24 * 7)) : 0;
            const weight = Math.min(1, Math.sqrt((game.score1 + Math.max(game.score2, Math.floor(0.5 * (game.score1 - 1)))) / 19));
            const dateWeight = weekNumber >= 42 ? 1 : 0.5 * ((1 / 0.5) ** (1 / (42 - 29))) ** (weekNumber - 29);
            game.weight = weight * dateWeight;

        });
        return games;
    }

    calculateRankFit(teams: string[], games: GameRow[], teamSummary: any, ignoreBlowouts: boolean): TeamRating[] {
        const iterations = 1000;
        const round_to_dp = 2;
        const rating_start = 0;
        const min_valid_games = 5;

        // in process ratings should be a map of string to integer arrays, where the array is of length iterations

        const ratingsMap: Map<string, number[]> = new Map();
        teams.forEach(team => {
            const ratingArray = new Array(iterations).fill(rating_start);
            ratingsMap.set(team, ratingArray);
        });

        for (let iter = 0; iter < iterations; iter++) {
            const games_iter: GameRowRanker[] = [...games].map(g => ({ ...g, team1Rank: 0, team2Rank: 0, teamRankDiff: 0, isIgnored: false, rank1: 0, rank2: 0, gameWeight: 0 })); // deep copy to avoid mutating original games

            // assign ranks based on last iteration
            games_iter.forEach(game => {
                const team1Ratings = ratingsMap.get(game.team1);
                const team2Ratings = ratingsMap.get(game.team2);
                if (team1Ratings && team2Ratings) {
                    game.team1Rank = team1Ratings[iter];
                    game.team2Rank = team2Ratings[iter];
                    game.teamRankDiff = game.team1Rank - game.team2Rank;
                }

                game.isIgnored = false;

                game.rank1 = (game.rankDiff ?? 0) + game.team2Rank;
                game.rank2 = game.team1Rank - (game.rankDiff ?? 0);
            });


            if (ignoreBlowouts) {
                // blowouts are ignored if they're damaging to the winner:
                // - the rating difference is > 600
                // - the winner has at least min_valid_games valid games
                // if only some of the games can be ignored, the least damaging ones are valid
                games_iter.forEach(game => {
                    // firstly iterate through and ignore all the blowouts
                    const isBlowout = game.score1 > 2 * game.score2 + 1
                    if (game.teamRankDiff > 600 && isBlowout) {
                        game.isIgnored = true;
                    }
                });

                // now for every team, check if they have at least 5 valid games
                // and un-ignore (make valid) the least damaging ones if they do not have 5

                teams.forEach(team => {
                    const teamGames = games_iter.filter(g => (g.team1 === team || g.team2 === team));
                    const validGames = teamGames.filter(g => !g.isIgnored);
                    const ignoredGames = teamGames.filter(g => g.isIgnored);
                    const ingoredGamesCount = teamGames.length - validGames.length;
                    if (validGames.length < min_valid_games && ingoredGamesCount > 0) {
                        // need to un-ignore some games
                        const needed_games = Math.min(min_valid_games - validGames.length, ingoredGamesCount);
                        ignoredGames.sort((a, b) => a.teamRankDiff - b.teamRankDiff); // sort by least damaging
                        for (let i = 0; i < needed_games; i++) {
                            ignoredGames[i].isIgnored = false;
                        }
                    }
                });

                games_iter.forEach(game => {
                    game.gameWeight = game.isIgnored ? 0 : (game.weight ?? 1);
                });

                const groupedGames = groupBy(games_iter, g => g.team1 || g.team2);
                const new_ratings = groupedGames.keys().map(team => {
                    const teamGames = groupedGames.get(team) || [];
                    const weightedSum = teamGames.reduce((sum, g) => sum + (g.rank1 * g.gameWeight), 0);
                    const totalWeight = teamGames.reduce((sum, g) => sum + g.gameWeight, 0);
                    const avg = totalWeight > 0 ? weightedSum / totalWeight : rating_start;
                    return { team, rating: Number(avg.toFixed(round_to_dp)) };

                    // avg = sum(a * weights) / sum(weights)
                });

                // update the ratings map
                new_ratings.forEach(nr => {
                    const ratingArray = ratingsMap.get(nr.team);
                    if (ratingArray) {
                        ratingArray[iter + 1] = Number((iter * 0.5 * (nr.rating - ratingArray[iter])).toFixed(round_to_dp))
                        // rmse_change = np.sqrt(((df_ratings_iter[i + 1] - df_ratings_iter[i]) ** 2).mean())
                        const rmseChange = Math.sqrt(((ratingArray[iter + 1] - ratingArray[iter]) ** 2) / teams.length);
                        console.log(`${iter + 1}/${iterations}, Change: ${rmseChange.toFixed(7)}, Rating 1: ${Math.max(...ratingArray).toFixed(4)}.`);
                    }
                });

            }
        }

        const finalRatings: TeamRating[] = [];
        ratingsMap.forEach((ratingArray, team) => {
            const finalRating = ratingArray[iterations - 1];
            finalRatings.push({ team, rating: Number(finalRating.toFixed(2)) });
        });

        return finalRatings;
    }

}