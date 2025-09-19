import { handleControllerUpdate } from "./controller";
import { AlgorithmConfig, controllerSheetName } from "./global";
import { calculateRankings } from "./ranking-calculate";
import { prepareData } from "./ranking-prepare-data";
import { gatherConfig } from "./ranking-setup";

function runControllerConfig() {
    // 166u7fC2oqyyNOMW2fM7kZusXJNyhKAzxnRBNkWtCWhg
    const spreadSheet = SpreadsheetApp.getActiveSpreadsheet();
    handleControllerUpdate(spreadSheet);
}

function runRankingAlgorithm() {
    // Logic to run the ranking algorithm
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt('Which data sheet do you want to run the algorithm on?', 'Please enter the name of the data set:', ui.ButtonSet.OK_CANCEL);

    const spreadSheet = SpreadsheetApp.getActiveSpreadsheet();
    spreadSheet.toast('Running algorithm on: ' + response.getResponseText());
    const config: AlgorithmConfig | null = gatherConfig(response.getResponseText(), spreadSheet);
    if (!config) {
        spreadSheet.toast('No configuration found for the specified data set.');
        return;
    }
    spreadSheet.toast('Configuration found for data set: ' + config.dataSetName + '. Preparing data for mixed division.');
    const mixedData = prepareData(spreadSheet, config, 'mixed');
    spreadSheet.toast('Data prepared for mixed. Preparing data for open division.');
    const openData = prepareData(spreadSheet, config, 'open');
    spreadSheet.toast('Data prepared for open. Preparing data for women\'s division.');
    const womensData = prepareData(spreadSheet, config, 'women');
    spreadSheet.toast('Data prepared for all divisions. Calculating rankings for mixed');
    calculateRankings(spreadSheet, config, mixedData, 'mixed');

    // vbpjuytghtgyhuioplkmnbvgfgtrgfhuyhjiookllppffrrsxzwsewdrftgyghujikolp;;;;
    // Evie added her own spin above :)





}

function onEdit(e: any) {
    var range = e.range;
    var spreadSheet = e.source;
    var sheetName = spreadSheet.getActiveSheet().getName();
    var column = range.getColumn();
    var row = range.getRow();

    // if the edit's on the controller, check if there's a new entry
    if (sheetName === controllerSheetName) {
        handleControllerUpdate(spreadSheet);
    }
}

function onOpen() {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('UKU Ranking')
        .addItem('Run Controller Config', 'runControllerConfig')
        .addItem('Run Ranking Algorithm', 'runRankingAlgorithm')
        .addToUi();
}