import { config } from "process";
import { controllerSheetName } from "./global";

const base_settings = [
  { name: 'Minimum Tournaments', defaultValue: 1, note: null },
  { name: 'Minimum Games', defaultValue: 5, note: null },
  { name: 'Minimum Interconnectivity', defaultValue: 10, note: 'Interconnectivity is a score given to a team based on how many other teams it has played against and how many games those teams have played against others. A lot of games against only repeated opponents gives a lower score.' },
  { name: 'Ignore Blowouts', defaultValue: true, note: 'If true, games with a score difference (score_w > 2*score_l + 1), a rating difference of > 600 and where the winner already has 5 games will be removed from the list.' }
];

export function handleControllerUpdate(spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet) {

  // get the table on this sheet. Headers are Name/Description,	Data Sheet,	Results Sheet,Last run,	Configure right now.
  // For a entry to be valid & worth checking, it must have a name/description, a data sheet, and a results sheet.
  // If it is valid and doesn't have a configure entry, call 'createConfigureEntry' and pass the name & datasheet to it.
  const controllerSheet = spreadSheet.getSheetByName(controllerSheetName);
  if (!controllerSheet) {
    throw new Error('Controller sheet not found: ' + controllerSheetName);
  }
  const data = controllerSheet.getDataRange().getValues();
  // data is a var[][]
  // first row is headers, so we skip it
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = row[0]; // Name/Description
    const dataSheetName = row[1]; // Data Sheet
    const resultsSheetName = row[2]; // Results Sheet
    const lastRun = row[3]; // Last run
    const configureEntry = row[4]; // Configure right now

    if (name && dataSheetName && resultsSheetName) {

      const dataSheet = SpreadsheetApp.openByUrl(dataSheetName);
      const resultsSheet = SpreadsheetApp.openByUrl(resultsSheetName);
      if (!dataSheet) {
        throw new Error('Data sheet not found: ' + dataSheetName);
      }
      if (!resultsSheet) {
        throw new Error('Results sheet not found: ' + resultsSheetName);
      }
      // Valid entry, check if it has a configure entry
      if (!configureEntry) {
        const configureSheetName = createConfigureEntry(spreadSheet, name, dataSheetName);
        // Update the controller sheet with the new configure entry
        controllerSheet.getRange(i + 1, 5).setValue(configureSheetName);
      } else {
        verifyConfigureEntry(spreadSheet, name, dataSheetName);
      }
    }
  }
}

function createConfigureEntry(spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet, name: string, dataSheetName: string): string {
  // Logic to create a configure entry
  const configureSheetName = name + ' Settings';
  const configureSheet = spreadSheet.insertSheet(configureSheetName);

  // Add algorithm settings with defaults
  const algoHeader = configureSheet.getRange('A1');
  algoHeader.setValue('Algorithm Settings');
  // the named range cannot have any spaces, and the sheet name can, so we need to strip any spaces from the sheet name
  const cleanSheetName = configureSheetName.replace(/\s+/g, '');
  spreadSheet.setNamedRange(cleanSheetName + 'Algorithm', algoHeader);

  for (let i = 0; i < base_settings.length; i++) {
    const setting = base_settings[i];
    configureSheet.getRange(i + 3, 1).setValue(setting.name);
    configureSheet.getRange(i + 3, 2).setValue(setting.defaultValue);
    if (setting.note) {
      configureSheet.getRange(i + 3, 3).setValue(setting.note);
    }
  }

  // Get tournaments from data sheet
  const tournaments = getTournamentsFromDataSheet(dataSheetName);
  // Tournaments should start from settings.length + 4 (+1 for header, +1 for the gap after the header, +2 for spacing after the settings)
  var startRow = base_settings.length + 4;
  verifyOrAddTournaments(spreadSheet, configureSheet, tournaments, startRow);
  return configureSheetName
}

function verifyOrAddTournaments(
  spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  configureSheet: GoogleAppsScript.Spreadsheet.Sheet,
  tournaments: string[],
  startRow: number) {

  let tournamentHeader: GoogleAppsScript.Spreadsheet.Range;
  const tournamentNamedRangeName = configureSheet.getName().replace(/\s+/g, '') + 'Tournaments';
  let tournamentHeaderNR = configureSheet.getNamedRanges().find(nr => nr.getName() === tournamentNamedRangeName);
  if (!tournamentHeaderNR) {
    // If no named range, create a header
    tournamentHeader = configureSheet.getRange('A' + startRow);
    tournamentHeader.setValue('Tournaments');
    spreadSheet.setNamedRange(tournamentNamedRangeName, tournamentHeader);
  } else {
    tournamentHeader = tournamentHeaderNR.getRange();
  }
  // Should look like this in the end
  // 
  // Tournaments
  // 
  // Name, Weighting
  // Tournament1, 1
  // Tournament2, 1

  configureSheet.getRange('A' + (tournamentHeader.getRow() + 2) + ':B' + (tournamentHeader.getRow() + 2)).setValues([['Name', 'Weighting']]);

  const existingTournaments = configureSheet.getRange('A' + (tournamentHeader.getRow() + 3) + ':A' + configureSheet.getLastRow()).getValues().flat();

  for (const tournament of tournaments) {
    if (!existingTournaments.includes(tournament)) {
      configureSheet.appendRow([tournament, 1]); // Add new tournament with default weighting
    }
  }
}

function verifyConfigureEntry(spreadSheet: GoogleAppsScript.Spreadsheet.Spreadsheet, name: string, dataSheetName: string) {
  // Logic to verify the configure entry
  const configureSheetName = name + ' Settings';
  const configureSheet = spreadSheet.getSheetByName(configureSheetName);
  if (!configureSheet) {
    throw new Error('Configure sheet not found: ' + configureSheetName);
  }

  // Check all algorithm settings are present, if not, add them with default values
  for (const setting of base_settings) {
    const cell = configureSheet.createTextFinder(setting.name).findNext();
    if (!cell) {
      // Setting not found, add it
      // Find the row the Tournaments header is in
      const tournamentHeaderCell = configureSheet.createTextFinder('Tournaments').findNext();
      const row = tournamentHeaderCell ? tournamentHeaderCell.getRow() - 1 : configureSheet.getLastRow() + 1; // Default to the end if not found
      // Insert an empty row to keep the structure
      configureSheet.insertRowAfter(row);

      configureSheet.getRange(row, 1).setValue(setting.name);
      configureSheet.getRange(row, 2).setValue(setting.defaultValue);
      if (setting.note) {
        configureSheet.getRange(row, 3).setValue(setting.note);
      }
    }
  }


  // Check if the tournaments are still valid
  const tournaments = getTournamentsFromDataSheet(dataSheetName);
  var startRow = base_settings.length + 4;
  verifyOrAddTournaments(spreadSheet, configureSheet, tournaments, startRow);
}

function getTournamentsFromDataSheet(dataSheetName: string): string[] {
  // dataSheetName should be a URL to a Google Sheet
  const dataSheet = SpreadsheetApp.openByUrl(dataSheetName);
  if (!dataSheet) {
    throw new Error('Data sheet not found: ' + dataSheetName);
  }

  const gamesSheet = dataSheet.getSheetByName('games');
  if (!gamesSheet) {
    throw new Error('Games sheet not found in data sheet: ' + dataSheetName);
  }
  // Get all Unique values in A column (ignoring the header in the first row)
  const data = gamesSheet.getRange('A2:A' + gamesSheet.getLastRow()).getValues();
  const tournaments = new Set<string>();
  for (const row of data) {
    const tournament = row[0];
    if (tournament) {
      tournaments.add(tournament);
    }
  }
  return Array.from(tournaments);
}