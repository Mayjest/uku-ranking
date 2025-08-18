import { AlgorithmConfig, BaseSetting, controllerSheetName, TournamentSetting } from "./global";

function gatherConfig(dataSet: string, spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet): AlgorithmConfig | null {
    const controllerSheet = spreadSheet.getSheetByName(controllerSheetName);
    if (!controllerSheet) {
        throw new Error(`Controller sheet named "${controllerSheetName}" not found.`);
    }


    const data = controllerSheet.getDataRange().getValues();

    // look for the dataSet in the controller sheet
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const name = row[0]; // Name/Description
        const dataSheetName = row[1]; // Data Sheet
        const resultsSheetName = row[2]; // Results Sheet
        const lastRun = row[3]; // Last run
        const configureEntry = row[4]; // Configure right now

        if (name === dataSet) {
            // Found the dataset, now we can gather the config

            const dataSheet = SpreadsheetApp.openByUrl(dataSheetName);
            const resultsSheet = SpreadsheetApp.openByUrl(resultsSheetName);
            if (!dataSheet) {
                throw new Error('Data sheet not found: ' + dataSheetName);
            }
            if (!resultsSheet) {
                throw new Error('Results sheet not found: ' + resultsSheetName);
            }
            if (!configureEntry) {
                throw new Error('Configuration not found for data sheet: ' + dataSet);
            }
            // Get the configure sheet
            const configureSheet = spreadSheet.getSheetByName(configureEntry);
            if (!configureSheet) {
                throw new Error('Configure sheet not found: ' + configureEntry);
            }

            // Get the named ranges for both the algorithm settings header & tournaments header
            const strippedSheetName = configureEntry.replace(/\s+/g, '');
            const algoHeaderNR = spreadSheet.getRangeByName(strippedSheetName + 'Algorithm');
            const tournamentHeaderNR = spreadSheet.getRangeByName(strippedSheetName + 'Tournaments');

            if (!algoHeaderNR || !tournamentHeaderNR) {
                throw new Error('Named ranges for algorithm settings or tournaments not found.');
            }

            // Gather algorithm settings
            const baseSettings: BaseSetting[] = [];
            // The algorithm settings start at 2 rows after algoHeader and finish 2 rows before the tournaments header
            const algoHeaderRow = algoHeaderNR.getRow();
            const tournamentHeaderRow = tournamentHeaderNR.getRow();
            const algoSettingsRange = configureSheet.getRange(algoHeaderRow + 2, 1, tournamentHeaderRow - algoHeaderRow - 2, 2);
            const algoSettingsData = algoSettingsRange.getValues();
            for (const setting of algoSettingsData) {
                if (setting[0]) { // If the setting name is not empty
                    baseSettings.push({
                        name: setting[0],
                        value: setting[1] || ''
                    });
                }
            }

            // Gather tournaments settings
            const tournaments: TournamentSetting[] = [];
            // The tournaments start 2 rows after the tournament header and go until the end of the sheet
            const tournamentStartRow = tournamentHeaderRow + 2;
            const tournamentRange = configureSheet.getRange(tournamentStartRow, 1, configureSheet.getLastRow() - tournamentStartRow + 1, 2);
            const tournamentData = tournamentRange.getValues();
            for (const tournament of tournamentData) {
                if (tournament[0]) { // If the tournament name is not empty
                    tournaments.push({
                        name: tournament[0],
                        weighting: parseFloat(tournament[1]) || 1 // Default to 1 if not specified
                    });
                }
            }

            return {
                dataSetName: name,
                dataSheetUrl: dataSheetName,
                resultsSheetUrl: resultsSheetName,
                algorithmSettings: baseSettings,
                tournaments: tournaments
            } as AlgorithmConfig;
        }
    }
    return null;
}

export { gatherConfig };