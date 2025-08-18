
var controllerSheetName = 'Controller'

interface BaseSetting {
    name: string;
    value: string | number;
}

interface TournamentSetting {
    name: string;
    weighting: number;
}

interface AlgorithmConfig {
    dataSetName: string;
    dataSheetUrl: string;
    resultsSheetUrl: string;
    algorithmSettings: BaseSetting[];
    tournaments: TournamentSetting[];
}

export { controllerSheetName };
export type { AlgorithmConfig, BaseSetting, TournamentSetting };
