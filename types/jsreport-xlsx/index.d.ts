/// <reference types='jsreport-core' />

declare namespace JsReport {
  const enum Recipe {
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

  // without exporting enum, it doesn't include the require('jsreport-core') in the test.js for some reason
  // help welcome
  export enum Foo { }
}

declare function JsReportXlsx(options?: Partial<JsReportXlsx.Options>): JsReport.ExtensionDefinition;

declare module 'jsreport-xlsx' {
  export = JsReportXlsx;
}
