import { ignoreBlowoutsSettingName } from "./controller";
import { AlgorithmConfig, GameRow, PreparedData, TeamRating } from "./global";

export abstract class Algorithm {
    get_ratings(data: PreparedData, config: AlgorithmConfig): TeamRating[] {

        const ignoreBlowouts = config.algorithmSettings.find(s => s.name === ignoreBlowoutsSettingName)?.value === "TRUE";

        const gamesWithRankDiff = this.calculateRankingDiff(data.games)
        const gamesWithWeights = this.calculateGameWeight(gamesWithRankDiff)

        const ratings = this.calculateRankFit(data.teams, gamesWithWeights, data.teamSummary, ignoreBlowouts)

        return ratings
    }


    abstract calculateRankingDiff(games: GameRow[]): GameRow[];
    abstract calculateGameWeight(games: GameRow[]): GameRow[];
    abstract calculateRankFit(teams: string[], games: GameRow[], teamSummary: any, ignoreBlowouts: boolean): TeamRating[];
}
