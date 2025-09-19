import { AlgorithmUSAU } from "./algorithmUSAU";
import { AlgorithmConfig, PreparedData, streamToTable } from "./global";

export function calculateRankings(
    spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
    config: AlgorithmConfig,
    preparedData: PreparedData,
    division: 'mixed' | 'open' | 'womens') {

    const algorithm = new AlgorithmUSAU();
    const ratings = algorithm.get_ratings(preparedData, config);


    streamToTable(ratings, ['Team, Rating'], spreadSheet, config.dataSetName + ' Ratings ' + division);
}