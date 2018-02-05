/// <reference types='jsreport-core' />

declare namespace JsReport {
  const enum RecipeType {
    PhantomPdf = 'phantom-pdf'
  }

  interface Margin {
    left: number | string;
    right: number | string;
    top: number | string;
    bottom: number | string;
  }

  interface Phantom {
    margin: string | Margin;
    header: string;
    footer: string;
    width: string;
    height: string;
    headerHeight: string;
    footerHeight: string;
    format: string;
    orientation: 'portrait' | 'landscape';
    blockJavaScript: 'true' | any;
    resourceTimeout: number;
    waitForJS: 'true' | 'false';
    fitToPage: 'true' | 'false';
    customPhantomJS: 'true' | 'false';
    phantomjsVersion: string;
  }

  interface Template {
    phantom?: Partial<Phantom>;
  }
}

declare namespace JsReportPhantomPdf {
  interface Options {
    allowLocalFilesAccess: boolean;
    appDirectory: string;
    defaultPhantomjsVersion: string;
    strategy: string;
  }
}

declare function JsReportPhantomPdf(options?: Partial<JsReportPhantomPdf.Options>): JsReport.Recipe;

declare module 'jsreport-phantom-pdf' {
  export = JsReportPhantomPdf;
}
