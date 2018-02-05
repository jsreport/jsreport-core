/// <reference types='jsreport-core' />

declare namespace JsReport {
  const enum RecipeType {
    Xlsx = 'xlsx'
  }

  interface Xlsx {
    shortid: string;
  }

  interface Template {
    xlsxTemplate: Partial<Xlsx>;
  }
}

declare namespace JsReportXlsx {
  interface Options {
    addBufferSize: number;
    escapeAmp: boolean;
    numberOfParsedAddIterations: number;
  }
}

declare function JsReportXlsx(options?: Partial<JsReportXlsx.Options>): JsReport.Recipe;

declare module 'jsreport-xlsx' {
  export = JsReportXlsx;
}
